// src/components/SmartScheduler.jsx
import React, { useState, useEffect } from "react";
import { Button } from "./UILibrary";
import { buildSmartSchedule } from "../api/gemini";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { logSession, loadSessions, analyzePattern } from "../utils/patternLearner";
import { recordAIPlanningRun } from "../utils/plannerMetrics";
import { findOverlaps } from "../utils/riskScoring";
import {
  saveSchedule, loadSchedule, clearSchedule,
  addFeedback, loadFeedback, summarizeFeedback, clearFeedback,
} from "../utils/scheduleFeedback";
import { markDone, markUndone, loadCompletedMap, clearAll as clearAllDone } from "../utils/completionStore";

const REJECT_REASONS = [
  "Too early for me", "Too late at night", "I have class then",
  "Need a break at that time", "Prefer a longer block",
  "Prefer a shorter block", "Wrong day", "Other",
];

export default function SmartScheduler({ extractedEvents, energyPattern, learnedPattern, googleCalendarEvents, onScheduleBuilt, onNavigate }) {
  const [status,       setStatus]       = useState("idle");
  const [schedule,     setSchedule]     = useState(null);
  const [error,        setError]        = useState(null);
  const [completed,    setCompleted]    = useState(() => loadCompletedMap());
  const [accepted,     setAccepted]     = useState({}); // slotKey → true (synced to GCal)
  const [ratingSlot,   setRatingSlot]   = useState(null);
  const [autoLogCount, setAutoLogCount] = useState(0);
  const [feedbackList, setFeedbackList] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [buildMs, setBuildMs] = useState(null);
  const [explainSlot, setExplainSlot] = useState(null);

  // Multi-select state
  const [selected,      setSelected]      = useState(new Set()); // Set of slotKeys
  const [selectMode,    setSelectMode]    = useState(false);
  const [bulkRejectBox, setBulkRejectBox] = useState(false);
  const [bulkReason,    setBulkReason]    = useState("");

  // Single-slot inline edit state
  const [editingSlot,  setEditingSlot]  = useState(null); // slotKey
  const [editValues,   setEditValues]   = useState({});   // { date, startTime, endTime, taskTitle }

  // Single-slot reject state
  const [rejectingSlot, setRejectingSlot] = useState(null);
  const [rejectReason,  setRejectReason]  = useState("");

  const gcal = useGoogleCalendar();
  const { isConnected, isConnecting, isSyncing, error: gcalError,
          syncResult, connect, disconnect, syncToCalendar } = gcal;

  const [prefs, setPrefs] = useState({
    maxHoursPerDay: 4, studyDaysAhead: 3,
    breakDuration: 15, avoidWeekends: false,
  });

  // ── Load persisted schedule + feedback ───────────────────────────────────
  useEffect(() => {
    const saved = loadSchedule();
    if (saved) { setSchedule(saved); onScheduleBuilt(saved); setStatus("done"); }
    setFeedbackList(loadFeedback());
    setAutoLogCount(loadSessions().filter(s => s.autoLogged).length);
  }, []);

  // ── Build ─────────────────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!extractedEvents?.length) {
      setError("No events found. Import from Blackboard or upload a syllabus first."); return;
    }
    setStatus("building"); setError(null);
    setCompleted({}); setSelected(new Set()); setSelectMode(false);
    setEditingSlot(null); setRejectingSlot(null);
    const startedAt = Date.now();
    try {
      const result = await buildSmartSchedule(
        extractedEvents, energyPattern || {}, prefs,
        learnedPattern, summarizeFeedback(feedbackList)
      );
      const elapsed = Date.now() - startedAt;
      setBuildMs(elapsed);
      recordAIPlanningRun({
        feature: "smart_scheduler_build",
        durationMs: elapsed,
        outputCount: result?.schedule?.length || 0,
      });
      setSchedule(result); saveSchedule(result); onScheduleBuilt(result); setStatus("done");
    } catch (err) { setError(err.message); setStatus("error"); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getAllKeys = () =>
    (schedule?.schedule || []).map((s, i) => `${s.date}-${i}-${s.taskTitle}`);

  const toggleSelect = (key) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleSelectAll = () => {
    const all = getAllKeys();
    setSelected(prev => prev.size === all.length ? new Set() : new Set(all));
  };

  const removeSlots = (keys) => {
    const keySet = new Set(keys);
    setSchedule(prev => {
      const updated = {
        ...prev,
        schedule: prev.schedule.filter((s, i) => !keySet.has(`${s.date}-${i}-${s.taskTitle}`)),
      };
      saveSchedule(updated);
      if (typeof onScheduleBuilt === "function") onScheduleBuilt(updated);
      return updated;
    });
  };

  // ── Bulk accept → sync selected to Google Calendar ───────────────────────
  const handleBulkAccept = async () => {
    const newAccepted = { ...accepted };
    selected.forEach(key => { newAccepted[key] = true; });
    setAccepted(newAccepted);

    selected.forEach(key => {
      const slot = getSlotByKey(key);
      if (!slot) return;
      addFeedback({ type:"accept", taskTitle:slot.taskTitle,
        originalTime:`${slot.date} ${slot.startTime}`, energyMatch:slot.energyMatch });
    });
    setFeedbackList(loadFeedback());

    // Sync all selected to Google Calendar
    const slotsToSync = [...selected].map(key => getSlotByKey(key)).filter(Boolean)
      .map(s => ({ ...s, title: s.taskTitle }));

    if (gcal.isConnected) {
      await gcal.syncToCalendar(slotsToSync);
    } else {
      gcal.connect();
    }

    setSelected(new Set()); setSelectMode(false);
  };

  // ── Bulk reject ───────────────────────────────────────────────────────────
  const handleBulkReject = () => {
    selected.forEach(key => {
      const slot = getSlotByKey(key);
      if (!slot) return;
      addFeedback({ type:"reject", taskTitle:slot.taskTitle,
        originalTime:`${slot.date} ${slot.startTime}`, reason:bulkReason });
    });
    removeSlots([...selected]);
    setFeedbackList(loadFeedback());
    setSelected(new Set()); setSelectMode(false);
    setBulkRejectBox(false); setBulkReason("");
  };

  // ── Single accept → sync to Google Calendar ──────────────────────────────
  const handleSingleAccept = async (slot, key) => {
    // Mark as accepted (visual feedback)
    setAccepted(prev => ({ ...prev, [key]: true }));

    // Log positive feedback for AI learning
    addFeedback({ type:"accept", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, energyMatch:slot.energyMatch });
    setFeedbackList(loadFeedback());

    // Sync this single slot to Google Calendar
    if (gcal.isConnected) {
      await gcal.syncToCalendar([{ ...slot, title: slot.taskTitle }]);
    } else {
      gcal.connect(); // prompt to connect if not yet connected
    }
  };

  // ── Single reject ─────────────────────────────────────────────────────────
  const submitReject = (slot, key) => {
    addFeedback({ type:"reject", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, reason:rejectReason });
    removeSlots([key]);
    setFeedbackList(loadFeedback());
    setRejectingSlot(null); setRejectReason("");
  };

  // ── Inline edit ───────────────────────────────────────────────────────────
  const startEdit = (slot, key) => {
    setEditingSlot(key);
    setEditValues({ date:slot.date, startTime:slot.startTime||"", endTime:slot.endTime||"", taskTitle:slot.taskTitle });
    setRejectingSlot(null); setRatingSlot(null);
  };

  const submitEdit = (key) => {
    setSchedule(prev => {
      const updated = {
        ...prev,
        schedule: prev.schedule.map((s, i) =>
          `${s.date}-${i}-${s.taskTitle}` === key
            ? { ...s, ...editValues }
            : s
        ),
      };
      saveSchedule(updated);
      // Propagate up so Today view / Calendar / Insights re-render with the
      // rescheduled slot. Without this, the inline edit only lives inside
      // SmartScheduler's local state and the rest of the app stays stale.
      if (typeof onScheduleBuilt === "function") onScheduleBuilt(updated);
      return updated;
    });
    // Log as move feedback
    const slot = getSlotByKey(key);
    if (slot) addFeedback({ type:"move", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`,
      newTime:`${editValues.date} ${editValues.startTime}`, reason:"Manually edited" });
    setFeedbackList(loadFeedback());
    setEditingSlot(null); setEditValues({});
  };

  // ── Complete + rating ─────────────────────────────────────────────────────
  const handleComplete = (slot, key) => {
    if (completed[key]) {
      setCompleted(p=>{ const n={...p}; delete n[key]; return n; });
      markUndone(key, slot.taskTitle);
      return;
    }
    setCompleted(p=>({...p,[key]:true}));
    markDone(key, slot.taskTitle);
    setRatingSlot({ slot, slotKey:key });
    setEditingSlot(null); setRejectingSlot(null);
  };

  const handleRating = (rating) => {
    if (!ratingSlot) return;
    const { slot } = ratingSlot;
    logSession({
      taskName:slot.taskTitle, taskType:"Assignment",
      complexity:slot.complexity||(slot.energyMatch==="peak"?"high":slot.energyMatch==="low"?"low":"medium"),
      hour:slot.startTime?parseInt(slot.startTime.split(":")[0]):new Date().getHours(),
      duration:calcDuration(slot.startTime,slot.endTime),
      productivity:rating, date:slot.date, autoLogged:true,
    });
    addFeedback({ type:"accept", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, energyMatch:slot.energyMatch, productivity:rating });
    setFeedbackList(loadFeedback());
    markDone(ratingSlot.slotKey, slot.taskTitle, rating);
    setAutoLogCount(c=>c+1); setRatingSlot(null);
    const updated = loadSessions();
    if (updated.length >= 3) window.dispatchEvent(new CustomEvent("patternUpdated",{ detail:analyzePattern(updated) }));
  };

  const getSlotByKey = (key) => {
    if (!schedule?.schedule) return null;
    return schedule.schedule.find((s,i) => `${s.date}-${i}-${s.taskTitle}` === key) || null;
  };

  function calcDuration(start, end) {
    if (!start||!end) return 1;
    const [sh,sm]=start.split(":").map(Number);
    const [eh,em]=end.split(":").map(Number);
    return Math.max(0.5,((eh*60+em)-(sh*60+sm))/60);
  }

  const groupedSchedule = schedule?.schedule?.reduce((acc,slot,i) => {
    if (!acc[slot.date]) acc[slot.date]=[];
    acc[slot.date].push({ ...slot, _idx:i });
    return acc;
  },{}) || {};

  const fmtDate = (d) => new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});

  const energyBadge = (match) => {
    const map = {
      peak:  { label:"🔥 Peak",   bg:"rgba(124,111,247,0.2)",color:"var(--purple-l)",border:"rgba(124,111,247,0.4)" },
      medium:{ label:"⚡ Medium", bg:"rgba(79,159,255,0.18)", color:"var(--blue-l)",  border:"rgba(79,159,255,0.35)" },
      low:   { label:"🌊 Low",    bg:"rgba(45,212,191,0.15)", color:"var(--teal)",    border:"rgba(45,212,191,0.3)" },
    };
    const m = map[match]||map.medium;
    return <span style={{background:m.bg,color:m.color,border:`1px solid ${m.border}`,
      fontSize:"0.7rem",fontWeight:700,padding:"3px 10px",borderRadius:20,flexShrink:0}}>{m.label}</span>;
  };

  const totalSlots = schedule?.schedule?.length||0;
  const completedCount = Object.keys(completed).length;
  const acceptedCount = feedbackList.filter(f=>f.type==="accept").length;
  const rejectedCount = feedbackList.filter(f=>f.type==="reject").length;
  const movedCount    = feedbackList.filter(f=>f.type==="move").length;

  return (
    <div>
      {/* ── Config ── */}
      <div className="card">
        <div className="card-title">🧠 Smart Scheduler</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span className="ai-badge">AI-generated</span>
          {buildMs !== null && (
            <span style={{ fontSize: "0.72rem", color: "var(--hint)" }}>
              Last build: {(buildMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <div className="card-sub">
          Schedule auto-saves. Use multi-select to bulk accept or reject slots.
          Edit any slot inline. All feedback trains the AI for next time.
        </div>

        {/* Status chips */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          <div style={{padding:"6px 12px",borderRadius:20,fontSize:"0.78rem",fontWeight:500,
            background:extractedEvents?.length?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)",
            color:extractedEvents?.length?"var(--green)":"var(--red)",
            border:`1px solid ${extractedEvents?.length?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)"}`}}>
            {extractedEvents?.length?`✅ ${extractedEvents.length} events loaded`:"❌ No events yet"}
          </div>
          {learnedPattern&&<div style={{padding:"6px 12px",borderRadius:20,fontSize:"0.78rem",fontWeight:500,
            background:"rgba(251,191,36,0.1)",color:"var(--amber)",border:"1px solid rgba(251,191,36,0.25)"}}>
            🧠 Learned from {learnedPattern.totalSessions} sessions
          </div>}
          {feedbackList.length>0&&<div style={{padding:"6px 12px",borderRadius:20,fontSize:"0.78rem",fontWeight:500,
            background:"rgba(124,111,247,0.1)",color:"var(--purple-l)",border:"1px solid rgba(124,111,247,0.25)",cursor:"pointer"}}
            onClick={()=>setShowFeedback(p=>!p)}>
            💬 {feedbackList.length} feedback entries
          </div>}
          {(googleCalendarEvents?.length || 0) > 0 && <div style={{padding:"6px 12px",borderRadius:20,fontSize:"0.78rem",fontWeight:500,
            background:"rgba(79,159,255,0.1)",color:"var(--blue-l)",border:"1px solid rgba(79,159,255,0.25)"}}>
            📅 {googleCalendarEvents.length} Google Calendar events loaded
          </div>}
        </div>

        {/* Feedback panel */}
        {showFeedback&&feedbackList.length>0&&(
          <div style={{marginBottom:16,background:"rgba(124,111,247,0.06)",border:"1px solid rgba(124,111,247,0.2)",borderRadius:10,padding:"12px 16px"}}>
            <div style={{fontSize:"0.82rem",fontWeight:600,color:"var(--purple-l)",marginBottom:8}}>
              💬 Feedback the AI will use next rebuild
            </div>
            <div style={{display:"flex",gap:12,marginBottom:10}}>
              {[{l:"✅ Accepted",v:acceptedCount},{l:"❌ Rejected",v:rejectedCount},{l:"🔀 Moved/Edited",v:movedCount}].map(s=>(
                <div key={s.l} style={{fontSize:"0.78rem",color:"var(--muted)"}}>
                  <strong style={{color:"var(--text)"}}>{s.v}</strong> {s.l}
                </div>
              ))}
            </div>
            {feedbackList.slice(-6).reverse().map((f,i)=>(
              <div key={i} style={{fontSize:"0.75rem",color:"var(--muted)",padding:"3px 0",borderBottom:"1px solid var(--border)"}}>
                {f.type==="reject"?"❌":f.type==="move"?"🔀":"✅"}{" "}
                <strong style={{color:"var(--text)"}}>{f.taskTitle}</strong>
                {f.reason&&` — ${f.reason}`}
                {f.newTime&&` → ${f.newTime}`}
              </div>
            ))}
            <Button variant="ghost" style={{fontSize:"0.72rem",marginTop:8,color:"var(--red)"}}
              onClick={()=>{clearFeedback();setFeedbackList([]);}}>
              Clear all feedback
            </Button>
          </div>
        )}

        {/* Prefs */}
        <div className="sec-label">Scheduling preferences</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <label style={{fontSize:"0.78rem",color:"var(--muted)",display:"block",marginBottom:4}}>Max study hours/day</label>
            <input type="number" className="input" min={1} max={10}
              value={prefs.maxHoursPerDay}
              onChange={e => {
                // Allow the field to be transiently empty so the user can
                // backspace a digit without getting a sticky "0".
                const raw = e.target.value;
                setPrefs(p => ({ ...p, maxHoursPerDay: raw === "" ? "" : +raw }));
              }}
              onBlur={e => {
                // On blur, snap back to a sensible value within [1, 10].
                const n = Number(e.target.value);
                setPrefs(p => ({
                  ...p,
                  maxHoursPerDay: !n || Number.isNaN(n) ? 4 : Math.max(1, Math.min(10, n)),
                }));
              }}/>
          </div>
          <div>
            <label style={{fontSize:"0.78rem",color:"var(--muted)",display:"block",marginBottom:4}}>Days before deadline to start</label>
            <input type="number" className="input" min={1} max={14}
              value={prefs.studyDaysAhead}
              onChange={e => {
                const raw = e.target.value;
                setPrefs(p => ({ ...p, studyDaysAhead: raw === "" ? "" : +raw }));
              }}
              onBlur={e => {
                const n = Number(e.target.value);
                setPrefs(p => ({
                  ...p,
                  studyDaysAhead: !n || Number.isNaN(n) ? 3 : Math.max(1, Math.min(14, n)),
                }));
              }}/>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <input type="checkbox" id="noWeekend" checked={prefs.avoidWeekends}
            onChange={e=>setPrefs(p=>({...p,avoidWeekends:e.target.checked}))}/>
          <label htmlFor="noWeekend" style={{fontSize:"0.85rem",cursor:"pointer",color:"var(--muted)"}}>Avoid weekends</label>
        </div>

        {/* Empty-state CTA: guide the student to where tasks come from */}
        {!extractedEvents?.length && onNavigate && (
          <div style={{
            background: "var(--bg-deep)",
            border: "1px dashed var(--border2)",
            borderRadius: "var(--radius)",
            padding: "16px 18px",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              Before AI can build anything, it needs tasks to schedule.
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.55 }}>
              Add them in one of two ways:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => onNavigate("upload")}
                style={{ fontSize: "0.85rem" }}>
                Upload a syllabus →
              </Button>
              <Button variant="secondary" onClick={() => onNavigate("blackboard")}
                style={{ fontSize: "0.85rem" }}>
                Connect Blackboard →
              </Button>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Button variant="primary" onClick={handleBuild}
            disabled={status==="building"||!extractedEvents?.length}
            style={{fontSize:"0.95rem",padding:"11px 24px"}}>
            {status==="building"
              ?<><span className="spinner"/> Building...</>
              :schedule?"Rebuild schedule":"Build my smart schedule"}
          </Button>
          {schedule&&<Button variant="secondary" style={{fontSize:"0.82rem"}}
            onClick={()=>{clearSchedule();setSchedule(null);setStatus("idle");setCompleted({});setSelected(new Set());setSelectMode(false);clearAllDone();}}>
            Clear
          </Button>}
        </div>

        {schedule?.savedAt&&status==="done"&&(
          <div style={{marginTop:8,fontSize:"0.72rem",color:"var(--hint)"}}>
            💾 Auto-saved · {new Date(schedule.savedAt).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
          </div>
        )}
        {error&&<div style={{marginTop:12,background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.25)",
          borderRadius:8,padding:"10px 14px",color:"var(--red)",fontSize:"0.82rem"}}>⚠️ {error}</div>}
      </div>

      {/* ── Results ── */}
      {schedule&&(
        <>
          {/* Insights */}
          <div className="card">
            <div className="card-title">🧬 Your scheduling profile</div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:8,padding:"10px 16px"}}>
                <div style={{fontSize:"0.7rem",color:"var(--amber)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Archetype</div>
                <div style={{fontWeight:700,fontSize:"1rem",color:"var(--amber)"}}>{schedule.archetype}</div>
              </div>
              <div style={{background:"rgba(124,111,247,0.1)",border:"1px solid rgba(124,111,247,0.25)",borderRadius:8,padding:"10px 16px"}}>
                <div style={{fontSize:"0.7rem",color:"var(--purple-l)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Peak hours</div>
                <div style={{fontWeight:700,fontSize:"1rem",color:"var(--purple-l)",fontFamily:"monospace"}}>{schedule.peakHours}</div>
              </div>
              {completedCount>0&&<div style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:8,padding:"10px 16px"}}>
                <div style={{fontSize:"0.7rem",color:"var(--green)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Completed</div>
                <div style={{fontWeight:700,fontSize:"1rem",color:"var(--green)"}}>{completedCount}/{totalSlots}</div>
              </div>}
            </div>
            {schedule.insights?.map((ins,i)=><div key={i} className="insight-card"><span>💡</span><span>{ins}</span></div>)}
          </div>

          {explainSlot && (
            <div className="card" style={{ background: "rgba(124,111,247,0.08)", borderColor: "rgba(124,111,247,0.25)" }}>
              <div className="card-title">🧠 Why This Recommendation?</div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text)" }}>{explainSlot.taskTitle}</strong> was placed at{" "}
                <strong style={{ color: "var(--purple-l)" }}>{explainSlot.startTime}–{explainSlot.endTime}</strong> on{" "}
                <strong style={{ color: "var(--text)" }}>{explainSlot.date}</strong>.
              </div>
              <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--muted)" }}>
                Energy match: <strong style={{ color: "var(--text)" }}>{explainSlot.energyMatch || "medium"}</strong>
              </div>
              <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--muted)" }}>
                AI rationale: {explainSlot.rationale || "Aligned with your profile, deadlines, and feedback patterns."}
              </div>
              <Button variant="ghost" style={{marginTop:10,fontSize:"0.74rem"}} onClick={() => setExplainSlot(null)}>
                Hide explanation
              </Button>
            </div>
          )}

          {/* GCal sync */}
          <div className="card" style={{background:"rgba(255,255,255,0.02)"}}>
            <div className="card-title" style={{fontSize:"0.9rem"}}>📅 Sync to Google Calendar</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              {!isConnected
                ?<Button variant="primary" onClick={connect} disabled={isConnecting}>
                  {isConnecting?<><span className="spinner"/> Connecting...</>:"🔗 Connect Google Calendar"}
                </Button>
                :<><Button variant="success" onClick={async () => {
                    const slots = schedule.schedule || [];
                    // Mark every slot accepted so per-row buttons flip from "Accept" to "Synced"
                    const nextAccepted = { ...accepted };
                    slots.forEach((s, i) => {
                      nextAccepted[`${s.date}-${i}-${s.taskTitle}`] = true;
                    });
                    setAccepted(nextAccepted);
                    // Log positive feedback for the AI so it keeps trusting these suggestions
                    slots.forEach(s => addFeedback({ type:"accept", taskTitle:s.taskTitle,
                      originalTime:`${s.date} ${s.startTime}`, energyMatch:s.energyMatch }));
                    setFeedbackList(loadFeedback());
                    await syncToCalendar(slots.map(s => ({ ...s, title: s.taskTitle })));
                  }} disabled={isSyncing}>
                  {isSyncing?<><span className="spinner"/> Syncing...</>:`📅 Sync ${schedule.schedule?.length} events`}
                </Button>
                <Button variant="secondary" onClick={disconnect} style={{fontSize:"0.78rem"}}>Disconnect</Button></>}
            </div>
            {isConnected&&<div style={{marginTop:8,fontSize:"0.78rem",color:"var(--green)"}}>✅ Connected</div>}
            {gcalError&&<div style={{marginTop:8,fontSize:"0.82rem",color:"var(--red)"}}>⚠️ {gcalError}</div>}
            {syncResult?.success?.length>0&&<div style={{marginTop:10,color:"var(--green)",fontSize:"0.82rem"}}>
              ✅ {syncResult.success.length} events synced!
              {syncResult.success[0]?.link&&<a href={syncResult.success[0].link} target="_blank" rel="noreferrer"
                style={{marginLeft:8,color:"var(--blue)",textDecoration:"underline"}}>View →</a>}
            </div>}
          </div>

          {/* ── Schedule ── */}
          <div className="card">
            {/* Toolbar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="card-title" style={{marginBottom:2}}>{totalSlots} study slots scheduled</div>
                <div style={{fontSize:"0.75rem",color:"var(--hint)"}}>
                  Select slots to bulk accept or reject · Click ✏️ to edit any slot
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {/* Select mode toggle */}
                <Button variant={selectMode?"primary":"secondary"} style={{fontSize:"0.78rem"}}
                  onClick={()=>{setSelectMode(p=>!p);setSelected(new Set());setBulkRejectBox(false);}}>
                  {selectMode?"✕ Exit select":"☑️ Select slots"}
                </Button>

                {/* Select all — only in select mode */}
                {selectMode&&<Button variant="secondary" style={{fontSize:"0.75rem"}}
                  onClick={toggleSelectAll}>
                  {selected.size===totalSlots?"Deselect all":"Select all"}
                </Button>}
              </div>
            </div>

            {/* Bulk action bar — shows when slots are selected */}
            {selectMode&&selected.size>0&&(
              <div style={{background:"rgba(124,111,247,0.1)",border:"1px solid rgba(124,111,247,0.25)",
                borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.85rem",fontWeight:600,color:"var(--purple-l)"}}>
                    {selected.size} slot{selected.size!==1?"s":""} selected
                  </span>
                  <Button variant="success" style={{fontSize:"0.78rem"}} onClick={handleBulkAccept}>
                    {gcal.isConnected ? `📅 Accept & sync ${selected.size} to GCal` : `🔗 Connect GCal to accept ${selected.size}`}
                  </Button>
                  <Button variant="secondary" style={{fontSize:"0.78rem"}}
                    onClick={()=>setBulkRejectBox(p=>!p)}>
                    ❌ Reject {selected.size} slots
                  </Button>
                  <Button variant="ghost" style={{fontSize:"0.75rem"}} onClick={()=>setSelected(new Set())}>
                    Clear selection
                  </Button>
                </div>

                {/* Bulk reject reason */}
                {bulkRejectBox&&(
                  <div>
                    <div style={{fontSize:"0.78rem",color:"var(--muted)",marginBottom:6}}>
                      Why are you rejecting these? (helps AI learn)
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      {REJECT_REASONS.map(r=>(
                        <button key={r} onClick={()=>setBulkReason(r)}
                          style={{padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:"0.72rem",fontWeight:bulkReason===r?700:400,
                            border:`1px solid ${bulkReason===r?"var(--red)":"rgba(248,113,113,0.3)"}`,
                            background:bulkReason===r?"rgba(248,113,113,0.2)":"rgba(248,113,113,0.05)",
                            color:bulkReason===r?"var(--red)":"var(--muted)"}}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Button variant="secondary" style={{fontSize:"0.78rem"}}
                        onClick={handleBulkReject}>
                        Confirm reject
                      </Button>
                      <Button variant="ghost" style={{fontSize:"0.75rem"}}
                        onClick={()=>setBulkRejectBox(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Slots by day */}
            {Object.entries(groupedSchedule).sort(([a],[b])=>a.localeCompare(b)).map(([date,slots])=>(
              <div key={date} style={{marginBottom:20}}>
                <div className="sec-label" style={{marginBottom:8}}>{fmtDate(date)}</div>
                {slots.sort((a,b)=>(a.startTime||"").localeCompare(b.startTime||"")).map((slot)=>{
                  const key      = `${slot.date}-${slot._idx}-${slot.taskTitle}`;
                  const isDone   = completed[key];
                  const isEditing= editingSlot===key;
                  const isReject = rejectingSlot===key;
                  const isRating = ratingSlot?.slotKey===key;
                  const isSelected=selected.has(key);
                  const gcalOverlaps = findOverlaps(slot, googleCalendarEvents || []);

                  return (
                    <div key={key} style={{marginBottom:(isEditing||isReject||isRating)?0:8}}>

                      {/* ── Slot row ── */}
                      <div className={`schedule-slot ${slot.energyMatch||""}`}
                        style={{
                          opacity:isDone?0.55:1,
                          borderRadius:(isEditing||isReject||isRating)?"10px 10px 0 0":undefined,
                          outline:isSelected?"2px solid var(--purple)":"none",
                          outlineOffset:2,
                          cursor:selectMode?"pointer":"default",
                          transition:"all 0.15s",
                        }}
                        onClick={()=>selectMode&&toggleSelect(key)}>

                        {/* Checkbox (select mode) or complete circle */}
                        {selectMode?(
                          <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${isSelected?"var(--purple)":"rgba(255,255,255,0.2)"}`,
                            background:isSelected?"var(--purple)":"transparent",flexShrink:0,
                            display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",color:"white"}}>
                            {isSelected&&"✓"}
                          </div>
                        ):(
                          <button onClick={e=>{e.stopPropagation();handleComplete(slot,key);}}
                            style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                              border:`2px solid ${isDone?"var(--green)":"rgba(255,255,255,0.2)"}`,
                              background:isDone?"var(--green)":"transparent",
                              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:"0.75rem",color:"white",transition:"all 0.15s"}}>
                            {isDone&&"✓"}
                          </button>
                        )}

                        <div className="slot-time" style={{textDecoration:isDone?"line-through":"none"}}>
                          {slot.startTime}<br/>→ {slot.endTime}
                        </div>

                        {/* Google Calendar overlap warning */}
                        {gcalOverlaps.length > 0 && (
                          <div style={{
                            fontSize: "0.7rem",
                            color: "var(--amber)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginLeft: 2,
                            padding: "2px 6px",
                            background: "rgba(251,191,36,0.1)",
                            borderRadius: 4,
                            border: "1px solid rgba(251,191,36,0.3)"
                          }}>
                            <span>⚠️</span>
                            <span><strong>{gcalOverlaps.length}</strong> calendar event{gcalOverlaps.length !== 1 ? 's' : ''} overlap</span>
                          </div>
                        )}

                        <div className="slot-content">
                          <div className="slot-title" style={{textDecoration:isDone?"line-through":"none"}}>
                            {slot.taskTitle}
                          </div>
                          <div className="slot-rationale">{slot.rationale}</div>
                          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="ai-badge">AI</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExplainSlot(slot); }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--blue-l)",
                                cursor: "pointer",
                                fontSize: "0.72rem",
                                padding: 0,
                              }}
                            >
                              Why this slot?
                            </button>
                          </div>
                        </div>
                        {energyBadge(slot.energyMatch)}

                        {/* Action buttons — hidden in select mode */}
                        {!selectMode&&!isDone&&(
                          <div style={{display:"flex",gap:4,marginLeft:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            <button title={accepted[key] ? "Synced to Google Calendar" : gcal.isConnected ? "Accept & sync to Google Calendar" : "Connect Google Calendar to accept"}
                              onClick={()=>handleSingleAccept(slot,key)}
                              style={{padding:"3px 10px",borderRadius:6,
                                border:`1px solid ${accepted[key]?"rgba(74,222,128,0.5)":"rgba(74,222,128,0.35)"}`,
                                background:accepted[key]?"rgba(74,222,128,0.2)":"rgba(74,222,128,0.12)",
                                color:"var(--green)",cursor:"pointer",fontSize:"0.7rem",fontWeight:700,
                                display:"flex",alignItems:"center",gap:4}}>
                              {accepted[key] ? "📅 Synced" : "✅ Accept"}
                            </button>
                            <button title="Edit slot" onClick={()=>isEditing?setEditingSlot(null):startEdit(slot,key)}
                              style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${isEditing?"var(--amber)":"rgba(251,191,36,0.3)"}`,
                                background:isEditing?"rgba(251,191,36,0.25)":"rgba(251,191,36,0.1)",
                                color:"var(--amber)",cursor:"pointer",fontSize:"0.7rem",fontWeight:600}}>
                              ✏️
                            </button>
                            <button title="Reject slot" onClick={()=>isReject?setRejectingSlot(null):setRejectingSlot(key)}
                              style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${isReject?"var(--red)":"rgba(248,113,113,0.3)"}`,
                                background:isReject?"rgba(248,113,113,0.25)":"rgba(248,113,113,0.1)",
                                color:"var(--red)",cursor:"pointer",fontSize:"0.7rem",fontWeight:600}}>
                              ❌
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Inline edit panel ── */}
                      {isEditing&&(
                        <div style={{background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.3)",
                          borderRadius:"0 0 10px 10px",padding:"14px 16px",marginBottom:8}}>
                          <div style={{fontSize:"0.82rem",fontWeight:600,color:"var(--amber)",marginBottom:10}}>
                            ✏️ Edit this slot
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                            <div>
                              <label style={{fontSize:"0.72rem",color:"var(--muted)",display:"block",marginBottom:3}}>Date</label>
                              <input type="date" className="input" value={editValues.date}
                                onChange={e=>setEditValues(p=>({...p,date:e.target.value}))}/>
                            </div>
                            <div>
                              <label style={{fontSize:"0.72rem",color:"var(--muted)",display:"block",marginBottom:3}}>Start time</label>
                              <input type="time" className="input" value={editValues.startTime}
                                onChange={e=>setEditValues(p=>({...p,startTime:e.target.value}))}/>
                            </div>
                            <div>
                              <label style={{fontSize:"0.72rem",color:"var(--muted)",display:"block",marginBottom:3}}>End time</label>
                              <input type="time" className="input" value={editValues.endTime}
                                onChange={e=>setEditValues(p=>({...p,endTime:e.target.value}))}/>
                            </div>
                          </div>
                          <div style={{marginBottom:10}}>
                            <label style={{fontSize:"0.72rem",color:"var(--muted)",display:"block",marginBottom:3}}>Task title</label>
                            <input type="text" className="input" value={editValues.taskTitle}
                              onChange={e=>setEditValues(p=>({...p,taskTitle:e.target.value}))}/>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <Button variant="secondary" style={{fontSize:"0.78rem"}}
                              onClick={()=>submitEdit(key)}>
                              💾 Save changes
                            </Button>
                            <Button variant="ghost" style={{fontSize:"0.75rem"}}
                              onClick={()=>setEditingSlot(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}

                      {/* ── Single reject panel ── */}
                      {isReject&&(
                        <div style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.25)",
                          borderRadius:"0 0 10px 10px",padding:"12px 16px",marginBottom:8}}>
                          <div style={{fontSize:"0.82rem",fontWeight:500,color:"var(--red)",marginBottom:8}}>
                            ❌ Why doesn't this slot work?
                          </div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                            {REJECT_REASONS.map(r=>(
                              <button key={r} onClick={()=>setRejectReason(r)}
                                style={{padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:"0.72rem",
                                  fontWeight:rejectReason===r?700:400,
                                  border:`1px solid ${rejectReason===r?"var(--red)":"rgba(248,113,113,0.3)"}`,
                                  background:rejectReason===r?"rgba(248,113,113,0.2)":"rgba(248,113,113,0.05)",
                                  color:rejectReason===r?"var(--red)":"var(--muted)"}}>
                                {r}
                              </button>
                            ))}
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <Button variant="secondary" style={{fontSize:"0.78rem"}}
                              onClick={()=>submitReject(slot,key)}>
                              Remove slot
                            </Button>
                            <Button variant="ghost" style={{fontSize:"0.75rem"}}
                              onClick={()=>setRejectingSlot(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}

                      {/* ── Focus rating ── */}
                      {isRating&&(
                        <div style={{background:"rgba(124,111,247,0.1)",border:"1px solid rgba(124,111,247,0.25)",
                          borderRadius:"0 0 10px 10px",padding:"10px 16px",marginBottom:8,
                          display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:"0.82rem",fontWeight:500,color:"var(--purple-l)"}}>
                            🤖 How focused were you?
                          </span>
                          <div style={{display:"flex",gap:3}}>
                            {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                              <button key={n} onClick={()=>handleRating(n)}
                                style={{width:26,height:26,borderRadius:6,
                                  border:"1px solid rgba(124,111,247,0.3)",
                                  background:n>=8?"var(--purple)":n>=5?"rgba(124,111,247,0.4)":"rgba(124,111,247,0.1)",
                                  color:n>=5?"white":"var(--purple-l)",
                                  cursor:"pointer",fontSize:"0.7rem",fontWeight:600}}>
                                {n}
                              </button>
                            ))}
                          </div>
                          <button onClick={()=>setRatingSlot(null)}
                            style={{fontSize:"0.72rem",color:"var(--hint)",background:"none",border:"none",cursor:"pointer"}}>
                            Skip
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
