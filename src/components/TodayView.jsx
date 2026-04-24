// src/components/TodayView.jsx
// Smart daily planner — default landing page
// Implements Option D: contextual completion detection + clean today view

import React, { useState, useEffect } from "react";
import { Button } from "./UILibrary";
import { computeRiskScore, riskLabel, detectOverload } from "../utils/riskScoring";
import { addFeedback } from "../utils/scheduleFeedback";
import { logSession, loadSessions, analyzePattern } from "../utils/patternLearner";
import AIChat from "./AIChat";
import EodCheckin from "./EodCheckin";
import TaskDetailModal from "./TaskDetailModal";
import { markDone as persistDone, markUndone, getCompletedTitles } from "../utils/completionStore";
import { parentKey, sameParent, eventRole } from "../utils/eventLinks";

const EMOJI_REACTIONS = [
  { value:9, emoji:"🔥", label:"Focused" },
  { value:6, emoji:"😐", label:"Okay" },
  { value:3, emoji:"😤", label:"Struggled" },
];

function getToday() { return new Date().toISOString().split("T")[0]; }

export default function TodayView({ schedule, events, energyPattern, learnedPattern, onScheduleUpdate, onNavigate }) {
  const [completed,     setCompleted]     = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("smart_cal_today_done")||"[]")); } catch { return new Set(); }
  });
  // Also load cross-day completions for deadline board filtering
  const allCompletedTitles = getCompletedTitles();
  const [reactionSlot,  setReactionSlot]  = useState(null); // slot awaiting emoji reaction (Option D)
  const [showChat,      setShowChat]      = useState(false);
  const [showCheckin,   setShowCheckin]   = useState(true);
  const [detailTask,    setDetailTask]    = useState(null); // task for the TaskDetailModal
  const [rescheduleSlot, setRescheduleSlot] = useState(null); // slot being rescheduled
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [actionMenuSlot, setActionMenuSlot] = useState(null); // slot with open action menu
  const today = getToday();

  // Today's slots from schedule
  const todaySlots = (schedule?.schedule || [])
    .map((s, i) => ({ ...s, _idx: i }))
    .filter(s => s.date === today && !s.isBuffer)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  // Option D: detect if we just passed a scheduled slot and trigger completion prompt
  useEffect(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin  = now.getMinutes();

    todaySlots.forEach(slot => {
      if (!slot.endTime) return;
      const [eh, em] = slot.endTime.split(":").map(Number);
      const key = `${slot.date}-${slot._idx}-${slot.taskTitle}`;

      // If the slot just ended (within 30 min) and not yet completed → prompt
      const minutesSinceEnd = (currentHour * 60 + currentMin) - (eh * 60 + em);
      if (minutesSinceEnd >= 0 && minutesSinceEnd <= 30 && !completed.has(key)) {
        setReactionSlot({ slot, key });
      }
    });
  }, []);

  const markDone = (slot, key) => {
    const newCompleted = new Set([...completed, key]);
    setCompleted(newCompleted);
    localStorage.setItem("smart_cal_today_done", JSON.stringify([...newCompleted]));
    persistDone(key, slot.taskTitle || slot.title);
    setReactionSlot({ slot, key }); // trigger emoji reaction
  };

  const markSkipped = (slot, key) => {
    addFeedback({ type:"reject", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, reason:"Skipped today" });
    const newCompleted = new Set([...completed, key + "_skipped"]);
    setCompleted(newCompleted);
    localStorage.setItem("smart_cal_today_done", JSON.stringify([...newCompleted]));
    setReactionSlot(null);
  };

  const handleContinueTomorrow = (slot) => {
    // Move to tomorrow at same time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split("T")[0];
    
    const updated = (schedule?.schedule || []).map(s => 
      s._idx === slot._idx ? { ...s, date: tomorrowDate } : s
    );
    onScheduleUpdate({ schedule: updated });
    setActionMenuSlot(null);
    addFeedback({ type:"postpone", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, newTime:`${tomorrowDate} ${slot.startTime}` });
  };

  const handleContinueLater = (slot) => {
    // Move to 2-3 hours later today
    if (!slot.startTime) return;
    const [h, m] = slot.startTime.split(":").map(Number);
    const newH = Math.min(h + 2, 23).toString().padStart(2, "0");
    const newM = m.toString().padStart(2, "0");
    const newStart = `${newH}:${newM}`;
    
    // Also shift end time
    let newEnd = slot.endTime;
    if (newEnd && h + 2 <= 23) {
      const [eh, em] = newEnd.split(":").map(Number);
      const newEh = Math.min(eh + 2, 23).toString().padStart(2, "0");
      newEnd = `${newEh}:${em.toString().padStart(2, "0")}`;
    }
    
    const updated = (schedule?.schedule || []).map(s => 
      s._idx === slot._idx ? { ...s, startTime: newStart, endTime: newEnd } : s
    );
    onScheduleUpdate({ schedule: updated });
    setActionMenuSlot(null);
    addFeedback({ type:"postpone", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, newTime:`${slot.date} ${newStart}` });
  };

  const handleRescheduleSubmit = () => {
    if (!rescheduleSlot || !rescheduleDate || !rescheduleTime) return;
    
    const updated = (schedule?.schedule || []).map(s => 
      s._idx === rescheduleSlot._idx 
        ? { ...s, date: rescheduleDate, startTime: rescheduleTime }
        : s
    );
    onScheduleUpdate({ schedule: updated });
    setRescheduleSlot(null);
    setRescheduleDate("");
    setRescheduleTime("");
    addFeedback({ type:"reschedule", taskTitle:rescheduleSlot.taskTitle,
      originalTime:`${rescheduleSlot.date} ${rescheduleSlot.startTime}`, 
      newTime:`${rescheduleDate} ${rescheduleTime}` });
  };

  const handleReaction = (reaction) => {
    if (!reactionSlot) return;
    const { slot } = reactionSlot;
    logSession({
      taskName:   slot.taskTitle,
      taskType:   "Assignment",
      complexity: slot.complexity || "medium",
      hour:       slot.startTime ? parseInt(slot.startTime.split(":")[0]) : new Date().getHours(),
      duration:   calcDuration(slot.startTime, slot.endTime),
      productivity: reaction.value,
      date:       today, autoLogged: true,
      notes:      `Reaction: ${reaction.label}`,
    });
    addFeedback({ type:"accept", taskTitle:slot.taskTitle,
      originalTime:`${slot.date} ${slot.startTime}`, energyMatch:slot.energyMatch,
      productivity:reaction.value });

    const updated = loadSessions();
    if (updated.length >= 3) {
      window.dispatchEvent(new CustomEvent("patternUpdated", { detail:analyzePattern(updated) }));
    }
    setReactionSlot(null);
  };

  function calcDuration(start, end) {
    if (!start||!end) return 1;
    const [sh,sm]=start.split(":").map(Number);
    const [eh,em]=end.split(":").map(Number);
    return Math.max(0.5,((eh*60+em)-(sh*60+sm))/60);
  }

  // Overload detection
  const overloadWarnings = detectOverload(schedule?.schedule, learnedPattern);
  const todayOverload    = overloadWarnings.find(w => w.date === today);

  // Upcoming high-risk events
  // Build a set of completed task titles for easy lookup
  // Merge today's completed keys + all-time completed titles from store
  const completedTitles = new Set([
    ...[...completed].map(key => (key || "").replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "").toLowerCase()),
    ...allCompletedTitles,
  ]);

  const todayStr = new Date().toISOString().split("T")[0];

  // Gather all events that could be "at risk" — after filtering completed
  // / cancelled / past-due. We'll dedupe by parent task below so one
  // deadline with 3 AI study blocks only takes up one row.
  const riskyCandidates = events
    .filter(e => {
      const title = (e.title || e.taskTitle || "").toLowerCase().trim();
      if (!title) return false;                              // skip blank-title rows
      if (completedTitles.has(title) || e.completed || e.cancelled) return false;
      const due = e.dueDate || e.date;
      if (due && due < todayStr) return false;
      return true;
    })
    .map(e => ({ ...e, risk: computeRiskScore(e, completed) }))
    .filter(e => e.risk >= 50);

  // Dedupe: group by parent task. For each group, elect the deadline (or
  // highest-risk item if no deadline) as the representative row, and
  // stash the rest as `relatedCount` so we can show "+3 study blocks".
  // Uses sameParent() rather than a strict parentKey string so courseless
  // study blocks still bucket with their Course deadlines.
  const riskyGroups = [];
  for (const e of riskyCandidates) {
    if (!parentKey(e)) {
      riskyGroups.push([e]);
      continue;
    }
    const bucket = riskyGroups.find(g => sameParent(g[0], e));
    if (bucket) bucket.push(e);
    else riskyGroups.push([e]);
  }
  const riskyEvents = riskyGroups
    .map(group => {
      const deadline = group.find(g => eventRole(g) === "deadline");
      const rep      = deadline || group.slice().sort((a, b) => b.risk - a.risk)[0];
      // Use the max risk across the group so related-study-block urgency
      // pushes the deadline higher in the list.
      const maxRisk  = Math.max(...group.map(g => g.risk));
      return {
        ...rep,
        risk: maxRisk,
        relatedCount: group.length - 1,
        relatedStudy: group.filter(g => g !== rep && eventRole(g) === "study").length,
      };
    })
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 4);

  // Same dedupe pattern for overdue: group by parent so an overdue deadline
  // + its expired study blocks collapse to one row.
  const overdueCandidates = events
    .filter(e => {
      const title = (e.title || e.taskTitle || "").toLowerCase().trim();
      if (!title) return false;
      if (completedTitles.has(title) || e.completed || e.cancelled) return false;
      const due = e.dueDate || e.date;
      return due && due < todayStr;
    });
  const overdueGroups = [];
  for (const e of overdueCandidates) {
    if (!parentKey(e)) {
      overdueGroups.push([e]);
      continue;
    }
    const bucket = overdueGroups.find(g => sameParent(g[0], e));
    if (bucket) bucket.push(e);
    else overdueGroups.push([e]);
  }
  const overdueEvents = overdueGroups
    .map(group => {
      const deadline = group.find(g => eventRole(g) === "deadline");
      const rep      = deadline || group[0];
      return {
        ...rep,
        relatedCount: group.length - 1,
        relatedStudy: group.filter(g => g !== rep && eventRole(g) === "study").length,
      };
    })
    .sort((a,b) => (a.dueDate||a.date).localeCompare(b.dueDate||b.date));
  const totalToday     = todaySlots.length;
  const completedToday = todaySlots.filter(s => completed.has(`${s.date}-${s._idx}-${s.taskTitle}`)).length;
  const totalHours     = todaySlots.reduce((sum, s) => sum + calcDuration(s.startTime, s.endTime), 0);
  const now            = new Date();

  return (
    <div>
      {/* ── Reschedule Dialog ── */}
      {rescheduleSlot && (
        <div style={{
          position:"fixed", inset:0, zIndex:1002, background:"rgba(0,0,0,0.7)",
          display:"flex", alignItems:"center", justifyContent:"center",
          backdropFilter:"blur(4px)"
        }} onClick={() => setRescheduleSlot(null)}>
          <div style={{
            background:"var(--surface)", borderRadius:16, padding:"24px",
            width:"90%", maxWidth:400, border:"1px solid rgba(124,111,247,0.3)",
            boxShadow:"0 10px 50px rgba(0,0,0,0.8)"
          }} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:"1.1rem", fontWeight:700, color:"var(--text)", marginBottom:8}}>
              📅 Reschedule Task
            </div>
            <div style={{fontSize:"0.85rem", color:"var(--muted)", marginBottom:16}}>
              {rescheduleSlot.taskTitle}
            </div>

            <div style={{marginBottom:14}}>
              <label style={{display:"block", fontSize:"0.8rem", color:"var(--hint)", fontWeight:600, marginBottom:6}}>
                New Date
              </label>
              <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                style={{width:"100%", padding:"10px 12px", borderRadius:8,
                  border:"1px solid var(--border)", background:"rgba(255,255,255,0.04)",
                  color:"var(--text)", fontSize:"0.82rem", fontFamily:"JetBrains Mono",
                  boxSizing:"border-box"}} />
            </div>

            <div style={{marginBottom:20}}>
              <label style={{display:"block", fontSize:"0.8rem", color:"var(--hint)", fontWeight:600, marginBottom:6}}>
                New Time (start)
              </label>
              <input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)}
                style={{width:"100%", padding:"10px 12px", borderRadius:8,
                  border:"1px solid var(--border)", background:"rgba(255,255,255,0.04)",
                  color:"var(--text)", fontSize:"0.82rem", fontFamily:"JetBrains Mono",
                  boxSizing:"border-box"}} />
            </div>

            <div style={{display:"flex", gap:10}}>
              <button onClick={() => setRescheduleSlot(null)}
                style={{flex:1, padding:"10px 16px", borderRadius:8,
                  border:"1px solid var(--border)", background:"transparent",
                  color:"var(--hint)", cursor:"pointer", fontSize:"0.82rem", fontWeight:600,
                  transition:"all 0.15s"}}
                onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { e.target.style.background = "transparent"; }}>
                Cancel
              </button>
              <button onClick={handleRescheduleSubmit}
                style={{flex:1, padding:"10px 16px", borderRadius:8, border:"none",
                  background:"var(--grad-purple)", color:"white", cursor:"pointer",
                  fontSize:"0.82rem", fontWeight:700, transition:"all 0.15s"}}
                onMouseEnter={(e) => { e.target.style.opacity = "0.9"; }}
                onMouseLeave={(e) => { e.target.style.opacity = "1"; }}>
                Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contextual completion popup (Option D) ── */}
      {reactionSlot && !completed.has(reactionSlot.key + "_reacted") && (
        <div style={{
          position:"fixed", top:24, right:24, zIndex:1001,
          width:340, background:"var(--surface)",
          border:"1px solid rgba(124,111,247,0.4)",
          borderRadius:16, padding:"18px 20px",
          boxShadow:"0 8px 40px rgba(0,0,0,0.6)",
          animation:"slideDown 0.3s ease",
        }}>
          <style>{`@keyframes slideDown{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div style={{fontWeight:700,fontSize:"0.9rem",color:"var(--text)",marginBottom:4}}>
            ⏰ Just finished: {reactionSlot.slot.taskTitle}?
          </div>
          <div style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:14}}>
            Your scheduled slot just ended. How did it go?
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {EMOJI_REACTIONS.map(r => (
              <button key={r.value} onClick={() => handleReaction(r)}
                style={{flex:1,padding:"12px 8px",borderRadius:12,border:"1px solid var(--border)",
                  background:"rgba(255,255,255,0.04)",cursor:"pointer",textAlign:"center",
                  transition:"all 0.15s"}}>
                <div style={{fontSize:"1.8rem",marginBottom:3}}>{r.emoji}</div>
                <div style={{fontSize:"0.68rem",color:"var(--muted)",fontWeight:600}}>{r.label}</div>
              </button>
            ))}
          </div>
          <button onClick={()=>setReactionSlot(null)}
            style={{width:"100%",padding:"7px",borderRadius:8,border:"1px solid var(--border)",
              background:"transparent",color:"var(--hint)",cursor:"pointer",fontSize:"0.75rem"}}>
            Skip for now
          </button>
        </div>
      )}

      {/* ── EOD Check-in ── */}
      {showCheckin && todaySlots.length > 0 && (
        <EodCheckin
          todaySlots={todaySlots}
          completedKeys={completed}
          onComplete={(done) => { setCompleted(done); setShowCheckin(false); }}
          onDismiss={() => setShowCheckin(false)}
        />
      )}

      {/* ── Header ── */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:"1.6rem",fontWeight:700,color:"var(--text)",marginBottom:2,letterSpacing:"-0.015em"}}>
          {getGreeting()}, {userDisplayName() || "Ram"}.
        </div>
        <div style={{fontSize:"0.85rem",color:"var(--fordham-gold-d, #b8860b)",fontWeight:600}}>
          {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          {energyPattern && <span style={{marginLeft:8,color:"var(--fordham-gold-d, #b8860b)"}}>· {energyPattern.archetype}</span>}
        </div>
      </div>

      {/* ── Today stats ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          { val:totalToday,                                   label:"Tasks today",  color:"purple" },
          { val:completedToday,                               label:"Completed",    color:"green" },
          { val:`${Math.round(totalHours*10)/10}h`,           label:"Total hours",  color:"blue" },
          { val:riskyEvents.length,                           label:"At risk",      color:"amber" },
        ].map(s => (
          <div key={s.label} className={`kpi-card ${s.color}`}>
            <div className="kpi-val">{s.val}</div>
            <div className="kpi-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Overload warning ── */}
      {todayOverload && (
        <div style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.3)",
          borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",gap:12,alignItems:"flex-start"}}>
          <span style={{fontSize:"1.4rem"}}>⚠️</span>
          <div>
            <div style={{fontWeight:700,color:"var(--red)",marginBottom:3}}>Overload detected today</div>
            <div style={{fontSize:"0.82rem",color:"var(--muted)",lineHeight:1.6}}>
              You have <strong style={{color:"var(--text)"}}>{todayOverload.totalHours}h</strong> of work scheduled
              but your average capacity is <strong style={{color:"var(--text)"}}>{todayOverload.capacity}h</strong>.
              You'll likely complete <strong style={{color:"var(--text)"}}>{todayOverload.likelyComplete} of {todayOverload.slots}</strong> tasks.
              Consider moving some to tomorrow.
            </div>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:16,alignItems:"start"}}>
        <div>
          {/* ── Today's schedule ── */}
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div className="card-title" style={{marginBottom:0}}>Today&apos;s plan</div>
              <div style={{display:"flex",gap:6}}>
                <Button variant="secondary" style={{fontSize:"0.72rem"}} onClick={()=>onNavigate("schedule")}>
                  Edit schedule →
                </Button>
              </div>
            </div>

            {todaySlots.length === 0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:"var(--hint)"}}>
                <div style={{fontSize:"2rem",marginBottom:8}}>🎉</div>
                <div style={{fontWeight:600,marginBottom:4}}>Nothing scheduled today</div>
                <div style={{fontSize:"0.82rem",marginBottom:14}}>Build a schedule to see your daily plan here</div>
                <Button variant="primary" onClick={()=>onNavigate("schedule")}>
                  Build schedule
                </Button>
              </div>
            ) : todaySlots.map((slot, i) => {
              const key      = `${slot.date}-${slot._idx}-${slot.taskTitle}`;
              const isDone   = completed.has(key);
              const isSkipped= completed.has(key+"_skipped");
              const isPast   = slot.endTime && (() => {
                const [eh,em] = slot.endTime.split(":").map(Number);
                return now.getHours()*60+now.getMinutes() > eh*60+em;
              })();
              const isOverdue = isPast && !isDone && !isSkipped;

              const energyColors = {
                peak:  {bg:"rgba(124,111,247,0.08)",border:"rgba(124,111,247,0.2)",left:"var(--purple)"},
                medium:{bg:"rgba(79,159,255,0.07)", border:"rgba(79,159,255,0.2)", left:"var(--blue)"},
                low:   {bg:"rgba(45,212,191,0.07)", border:"rgba(45,212,191,0.2)", left:"var(--teal)"},
              };
              const ec = energyColors[slot.energyMatch]||energyColors.medium;

              return (
                <div key={key}
                  onClick={() => setDetailTask({ ...slot, id: key, title: slot.taskTitle || slot.title, complexity: slot.complexity || slot.energyMatch })}
                  title="Open task · start a focus session"
                  style={{
                    display:"flex",alignItems:"center",gap:12,padding:"13px 16px",
                    borderRadius:12,marginBottom:8,cursor:"pointer",
                    background:isDone?"rgba(74,222,128,0.05)":isOverdue?"rgba(248,113,113,0.08)":isSkipped?"rgba(255,255,255,0.02)":ec.bg,
                    border:`1px solid ${isDone?"rgba(74,222,128,0.2)":isOverdue?"rgba(248,113,113,0.35)":isSkipped?"var(--border)":ec.border}`,
                    borderLeft:`3px solid ${isDone?"var(--green)":isOverdue?"var(--red)":isSkipped?"var(--hint)":ec.left}`,
                    opacity:isSkipped?0.5:1,
                    transition:"all 0.2s",
                  }}>
                  {/* Overdue warning */}
                  {isOverdue && (
                    <span title="Time passed — not yet completed" style={{fontSize:"1rem",flexShrink:0}}>⚠️</span>
                  )}

                  {/* Time */}
                  <div style={{fontFamily:"JetBrains Mono",fontSize:"0.72rem",
                    color:isDone?"var(--green)":isOverdue?"var(--red)":isSkipped?"var(--hint)":
                      {peak:"var(--purple-l)",medium:"var(--blue-l)",low:"var(--teal)"}[slot.energyMatch]||"var(--muted)",
                    minWidth:80,flexShrink:0,lineHeight:1.4,textDecoration:isDone||isSkipped?"line-through":"none"}}>
                    {slot.startTime}<br/>→{slot.endTime}
                  </div>

                  {/* Title */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:"0.88rem",
                      color:isDone?"var(--muted)":isOverdue?"var(--red)":isSkipped?"var(--hint)":"var(--text)",
                      textDecoration:isDone||isSkipped?"line-through":"none",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {slot.taskTitle||slot.title}
                    </div>
                    <div style={{fontSize:"0.7rem",color:isOverdue?"var(--red)":"var(--hint)",marginTop:2}}>
                      {isOverdue?"⏰ Overdue — tap to update schedule":`${slot.energyMatch} energy · ${Math.round(calcDuration(slot.startTime,slot.endTime)*10)/10}h`}
                    </div>
                  </div>

                  {/* Actions */}
                  {!isDone && !isSkipped ? (
                    <div style={{display:"flex",gap:6,flexShrink:0,position:"relative"}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>markDone(slot,key)}
                        style={{padding:"6px 14px",borderRadius:8,border:"none",
                          background:"var(--grad-green)",color:"#0a1a10",cursor:"pointer",
                          fontSize:"0.78rem",fontWeight:700,boxShadow:"var(--glow-green)"}}>
                        ✅ Done
                      </button>
                      <button onClick={()=>setActionMenuSlot(actionMenuSlot === key ? null : key)}
                        style={{padding:"6px 10px",borderRadius:8,
                          border:"1px solid var(--border)",background:"transparent",
                          color:"var(--hint)",cursor:"pointer",fontSize:"0.78rem",
                          transition:"all 0.15s"}}>
                        ⋯
                      </button>

                      {/* Action menu popover */}
                      {actionMenuSlot === key && (
                        <div style={{
                          position:"absolute", top:"100%", right:0, marginTop:6, zIndex:100,
                          background:"var(--surface)", border:"1px solid rgba(124,111,247,0.3)",
                          borderRadius:10, boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
                          minWidth:180, overflow:"hidden",
                        }}>
                          <button onClick={() => handleContinueTomorrow(slot)}
                            style={{display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px",
                              border:"none", background:"transparent", color:"var(--text)", cursor:"pointer",
                              fontSize:"0.82rem", fontWeight:500, borderBottom:"1px solid rgba(255,255,255,0.05)",
                              transition:"background 0.1s"}}
                            onMouseEnter={(e) => e.target.style.background = "rgba(124,111,247,0.1)"}
                            onMouseLeave={(e) => e.target.style.background = "transparent"}>
                            <span>📅</span> Continue Tomorrow
                          </button>
                          <button onClick={() => handleContinueLater(slot)}
                            style={{display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px",
                              border:"none", background:"transparent", color:"var(--text)", cursor:"pointer",
                              fontSize:"0.82rem", fontWeight:500, borderBottom:"1px solid rgba(255,255,255,0.05)",
                              transition:"background 0.1s"}}
                            onMouseEnter={(e) => e.target.style.background = "rgba(124,111,247,0.1)"}
                            onMouseLeave={(e) => e.target.style.background = "transparent"}>
                            <span>🕐</span> Continue Later
                          </button>
                          <button onClick={() => { setRescheduleSlot(slot); setActionMenuSlot(null); setRescheduleDate(slot.date); setRescheduleTime(slot.startTime); }}
                            style={{display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px",
                              border:"none", background:"transparent", color:"var(--text)", cursor:"pointer",
                              fontSize:"0.82rem", fontWeight:500, borderBottom:"1px solid rgba(255,255,255,0.05)",
                              transition:"background 0.1s"}}
                            onMouseEnter={(e) => e.target.style.background = "rgba(124,111,247,0.1)"}
                            onMouseLeave={(e) => e.target.style.background = "transparent"}>
                            <span>✏️</span> Reschedule
                          </button>
                          <button onClick={()=>markSkipped(slot,key)}
                            style={{display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px",
                              border:"none", background:"transparent", color:"var(--red)", cursor:"pointer",
                              fontSize:"0.82rem", fontWeight:500, transition:"background 0.1s"}}
                            onMouseEnter={(e) => e.target.style.background = "rgba(248,113,113,0.1)"}
                            onMouseLeave={(e) => e.target.style.background = "transparent"}>
                            <span>⏭️</span> Skip
                          </button>
                        </div>
                      )}
                    </div>
                  ) : isDone ? (
                    <span style={{fontSize:"0.75rem",color:"var(--green)",fontWeight:600}}>✅ Done</span>
                  ) : (
                    <span style={{fontSize:"0.75rem",color:"var(--hint)"}}>Skipped</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Risk board ── */}
          {riskyEvents.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-title">Deadline risk board</div>
              <div className="card-sub">Based on time left, estimated effort, and your history</div>
              {riskyEvents.map((ev,i) => {
                const r = riskLabel(ev.risk);
                // Day-granularity compare: avoids the "today event shows Due
                // tomorrow" off-by-one caused by ceiling a partial-day delta.
                const dateStr = (ev.dueDate||ev.date||"").slice(0,10);
                const todayStr = now.toISOString().slice(0,10);
                const daysLeft = dateStr
                  ? Math.round((new Date(dateStr+"T00:00:00") - new Date(todayStr+"T00:00:00")) / 86400000)
                  : 0;
                return (
                  <div key={i}
                    onClick={() => setDetailTask(ev)}
                    title="Open task · start a focus session"
                    style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                    borderRadius:10,marginBottom:8,cursor:"pointer",
                    background:r.bg,border:`1px solid ${r.border}`,
                    transition:"all 0.15s"}}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateX(2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateX(0)"; }}>
                    <div style={{fontSize:"1.2rem",flexShrink:0}}>{r.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:"0.85rem",color:"var(--text)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ev.title || ev.taskTitle || "Untitled task"}
                      </div>
                      <div style={{fontSize:"0.72rem",color:"var(--muted)",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        {ev.course&&<span>{ev.course}</span>}
                        <span>
                          {daysLeft<=0?"Due today!":daysLeft===1?"Due tomorrow":`${daysLeft} days left`}
                          {ev.estimatedHours&&` · ~${ev.estimatedHours}h`}
                        </span>
                        {ev.relatedStudy > 0 && (
                          <span title="AI-scheduled study blocks working toward this deadline"
                            style={{
                              display:"inline-flex",alignItems:"center",gap:3,
                              padding:"1px 7px",borderRadius:999,fontSize:"0.68rem",fontWeight:600,
                              background:"rgba(99,102,241,0.15)",color:"var(--purple-l, #818cf8)",
                              border:"1px solid rgba(99,102,241,0.3)",
                            }}>
                            🧠 +{ev.relatedStudy} study block{ev.relatedStudy!==1?"s":""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"JetBrains Mono",fontWeight:700,fontSize:"0.9rem",color:r.color}}>
                        {ev.risk}
                      </div>
                      <div style={{fontSize:"0.62rem",color:"var(--hint)"}}>risk score</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── AI Chat ── */}
        <div>
          <AIChat
            schedule={schedule}
            events={events}
            energyPattern={energyPattern}
            onScheduleUpdate={onScheduleUpdate}
          />

          {/* Quick stats */}
          {learnedPattern && (
            <div className="card" style={{marginTop:14,background:"rgba(251,191,36,0.05)",borderColor:"rgba(251,191,36,0.2)"}}>
              <div style={{fontWeight:600,fontSize:"0.82rem",color:"var(--amber)",marginBottom:10}}>
                🧠 Your pattern today
              </div>
              {learnedPattern.insights?.slice(0,2).map((ins,i)=>(
                <div key={i} style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:6,
                  display:"flex",gap:6}}>
                  <span>💡</span><span>{ins}</span>
                </div>
              ))}
              {learnedPattern.bestHours?.high?.length>0&&(
                <div style={{marginTop:8,fontSize:"0.75rem",
                  background:"rgba(124,111,247,0.1)",border:"1px solid rgba(124,111,247,0.2)",
                  borderRadius:8,padding:"6px 10px",color:"var(--purple-l)"}}>
                  🔥 Peak focus hours: {learnedPattern.bestHours.high.slice(0,2).map(h=>`${h}:00`).join(", ")}
                </div>
              )}
            </div>
          )}
          {overdueEvents.length > 0 && (
            <div className="card" style={{borderColor:"rgba(248,113,113,0.4)",background:"rgba(248,113,113,0.05)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:"1.2rem"}}>🚨</span>
                <div>
                  <div className="card-title" style={{marginBottom:0,color:"var(--red)"}}>
                    {overdueEvents.length} Overdue task{overdueEvents.length!==1?"s":""}
                  </div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>Past deadline — not yet completed</div>
                </div>
              </div>
              {/* scrollable list */}
              <div style={{maxHeight:200,overflowY:"auto",paddingRight:4,display:"flex",flexDirection:"column",gap:6}}>
              {overdueEvents.map((ev,i) => {
                const daysOver = Math.ceil((now - new Date((ev.dueDate||ev.date)+"T23:59:00")) / 86400000);
                return (
                  <div key={i}
                    onClick={() => setDetailTask(ev)}
                    title="Open task · start a focus session"
                    style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                      borderRadius:8,marginBottom:6,cursor:"pointer",
                      background:"rgba(185,28,28,0.08)",border:"1px solid rgba(185,28,28,0.22)"}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>⚠️</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:"0.82rem",color:"var(--red)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ev.title||ev.taskTitle}
                      </div>
                      <div style={{fontSize:"0.68rem",color:"var(--muted)"}}>
                        Due {ev.dueDate||ev.date} · ~{ev.estimatedHours||1}h
                      </div>
                    </div>
                    <div style={{fontFamily:"JetBrains Mono",fontSize:"0.75rem",
                      fontWeight:700,color:"var(--red)",flexShrink:0}}>
                      {daysOver}d late
                    </div>
                  </div>
                );
              })}
            </div>
          
              </div>
          )}
        </div>
      </div>

      {/* Task detail / focus session modal */}
      <TaskDetailModal
        task={detailTask}
        open={Boolean(detailTask)}
        allEvents={events}
        onOpenRelated={(relatedEv) => setDetailTask(relatedEv)}
        onClose={() => setDetailTask(null)}
      />
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

function userDisplayName() {
  try {
    const e = localStorage.getItem("smart_cal_user_email") || "";
    if (!e) return null;
    const local = e.split("@")[0];
    // Title-case the first chunk before any dot/underscore
    return local.split(/[._-]/)[0].replace(/^\w/, c => c.toUpperCase());
  } catch { return null; }
}
