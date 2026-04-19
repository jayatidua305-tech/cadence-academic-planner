// src/components/CalendarView.jsx
// Week view with real time blocks — shows actual duration visually

import React, { useState, useMemo, useRef } from "react";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { getCompletedTitles } from "../utils/completionStore";
import {
  parentKey as sharedParentKey,
  eventKey as sharedEventKey,
  sameParent,
} from "../utils/eventLinks";


const HOUR_HEIGHT = 56; // px per hour
const START_HOUR  = 6;  // display from 6am
const END_HOUR    = 26; // display to 2am next day (26 = 2am)
const HOURS       = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);
const DAY_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmtHour(h) {
  const norm = h % 24;
  if (norm === 0)  return "12am";
  if (norm < 12)   return `${norm}am`;
  if (norm === 12) return "12pm";
  return `${norm - 12}pm`;
}

function isoDate(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function getWeekDates(refDate) {
  const d  = new Date(refDate);
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(a, b) {
  const aStart = timeToMinutes(a.startTime);
  const aEnd   = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd   = timeToMinutes(b.endTime);
  if (aStart==null||aEnd==null||bStart==null||bEnd==null) return false;
  return aStart < bEnd && aEnd > bStart;
}

// Group overlapping events into columns
function layoutEvents(dayEvents) {
  const sorted = [...dayEvents]
    .filter(e => e.startTime && e.endTime)
    .sort((a,b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const columns = [];
  const placed  = [];

  sorted.forEach(ev => {
    let col = 0;
    while (placed.some(p => p.col === col && overlaps(p.ev, ev))) col++;
    placed.push({ ev, col });
  });

  const maxCol = Math.max(...placed.map(p => p.col), 0) + 1;
  return placed.map(({ ev, col }) => ({
    ev, col, totalCols: maxCol,
  }));
}

// ── Color system ─────────────────────────────────────────────────────────────
// Two visual axes mapped to two visual properties:
//   Axis 1 — Source: drives the block's background color.
//            Answers "where did this event come from?"
//   Axis 2 — Priority: drives the left border stripe (4px).
//            Answers "how urgent / important is this?"
//
// AI-scheduled study slots additionally show their energy match as a subtle
// dot + footer label, keeping the peak/medium/low context visible without
// hijacking the background.

const SOURCE_COLORS = {
  // Unified "Course" source covers Blackboard iCal, syllabus uploads, and
  // anything else that originates from a class. A student doesn't care
  // whether a deadline came from BB or a PDF — they care that it's a
  // graded course item vs a personal event.
  course: {
    bg: "#900028",          // Fordham maroon — "fixed, you can't move it"
    border: "#c41e3a",
    text: "#ffffff",
    icon: "🎓",
    label: "Course",
  },
  "google-calendar": {
    bg: "#1e3a5f",          // Slate blue — "already committed"
    border: "#3b82f6",
    text: "#ffffff",
    icon: "📅",
    label: "Google Cal",
  },
  ai: {
    // Background shifts subtly by energy match, but all sit in the indigo family
    // so you see them as "AI blocks" at a glance.
    peak:    { bg:"#3730a3", border:"#818cf8", text:"#ffffff", icon:"🧠", label:"AI · Peak" },
    medium:  { bg:"#1e40af", border:"#60a5fa", text:"#ffffff", icon:"🧠", label:"AI · Medium" },
    low:     { bg:"#0f766e", border:"#2dd4bf", text:"#ffffff", icon:"🧠", label:"AI · Low" },
    default: { bg:"#312e81", border:"#6366f1", text:"#ffffff", icon:"🧠", label:"AI" },
  },
  manual: {
    bg: "#374151",          // Warm grey — "you added this"
    border: "#9ca3af",
    text: "#ffffff",
    icon: "✍️",
    label: "Manual",
  },
};

const PRIORITY_STRIPE = {
  high:   "#ef4444",   // red
  medium: "#f59e0b",   // amber
  low:    "#22c55e",   // green
};

// Resolve which source palette an event belongs to.
// Legacy "blackboard" and "syllabus" sources are aliased to the unified
// "course" palette for backward compatibility with any events already in
// localStorage from before the merge.
function resolveSource(ev) {
  if (ev.source === "google-calendar") return { kind: "google-calendar", palette: SOURCE_COLORS["google-calendar"] };
  if (ev.source === "course" ||
      ev.source === "blackboard" ||
      ev.source === "syllabus")        return { kind: "course",          palette: SOURCE_COLORS.course };
  if (ev.aiScheduled || ev.energyMatch) {
    const sub = SOURCE_COLORS.ai[ev.energyMatch] || SOURCE_COLORS.ai.default;
    return { kind: "ai", palette: sub, energy: ev.energyMatch };
  }
  return { kind: "manual", palette: SOURCE_COLORS.manual };
}

// Delegate to the shared util so CalendarView stays in lockstep with
// TodayView + TaskDetailModal on how "same task" is defined. See
// src/utils/eventLinks.js for the course-tolerance rules.
const parentKey = sharedParentKey;
const eventKey  = sharedEventKey;

export default function CalendarView({ events, onEventsChange, gcal: gcalProp }) {
  const gcalInternal = useGoogleCalendar();
  const gcal = gcalProp || gcalInternal;

  const today   = new Date();
  const [refDate,     setRefDate]     = useState(new Date());
  const [view,        setView]        = useState("week"); // "week" | "month"
  const [selectedEv,  setSelectedEv]  = useState(null);
  const [showSync,    setShowSync]    = useState(false);
  const [filterType,  setFilterType]  = useState("all");
  const [filterPri,   setFilterPri]   = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Calendar-redesign state: which sources to show, and whether the legend is open.
  const [visibleSources, setVisibleSources] = useState(
    () => new Set(["course","google-calendar","ai","manual"])
  );
  const [showLegend, setShowLegend] = useState(false);
  const scrollRef = useRef(null);

  // Scroll to current time on mount
  React.useEffect(() => {
    if (scrollRef.current) {
      const offset = (today.getHours() - START_HOUR - 1) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [view]);

  const weekDates = getWeekDates(refDate);

  const goBack = () => {
    const d = new Date(refDate);
    if (view==="week") d.setDate(d.getDate()-7);
    else d.setMonth(d.getMonth()-1);
    setRefDate(d);
  };
  const goForward = () => {
    const d = new Date(refDate);
    if (view==="week") d.setDate(d.getDate()+7);
    else d.setMonth(d.getMonth()+1);
    setRefDate(d);
  };
  const goToday = () => setRefDate(new Date());

  // Load completed task titles — cross-day persistent store
  const completedTitles = useMemo(() => {
    const legacyKeys = JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]");
    return new Set([
      ...legacyKeys.map(k => (k || "").replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "").toLowerCase()),
      ...getCompletedTitles(),
    ]);
  }, []);

  // Events keyed by date — only show events with actual time slots, hide completed,
  // and respect the source filter chips.
  const eventsByDate = useMemo(() => {
    const map = {};
    events
      .filter(e => e.startTime && e.endTime)
      .filter(e => {
        const title = (e.title || e.taskTitle || "").toLowerCase().trim();
        return !completedTitles.has(title) && !e.completed && !e.cancelled;
      })
      .filter(e => visibleSources.has(resolveSource(e).kind))
      .forEach(ev => {
        const d = ev.date || ev.dueDate;
        if (!d) return;
        if (!map[d]) map[d] = [];
        map[d].push({ ...ev, title: ev.title || ev.taskTitle || "Untitled" });
      });
    return map;
  }, [events, completedTitles, visibleSources]);



  const getDateStr = (d) => isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  const isToday    = (d) => getDateStr(d) === getDateStr(today);

  // ── Week header label ─────────────────────────────────────────────────────
  const weekLabel = (() => {
    const s = weekDates[0], e = weekDates[6];
    if (s.getMonth()===e.getMonth())
      return `${s.toLocaleDateString("en-US",{month:"long"})} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${s.toLocaleDateString("en-US",{month:"short"})} ${s.getDate()} – ${e.toLocaleDateString("en-US",{month:"short"})} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  // ── Month view ────────────────────────────────────────────────────────────
  const monthYear  = refDate.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const firstOfMon = new Date(refDate.getFullYear(), refDate.getMonth(), 1).getDay();
  const daysInMon  = new Date(refDate.getFullYear(), refDate.getMonth()+1, 0).getDate();

  // Sync panel
  const filteredEvs = useMemo(() => events.filter(e => {
    if (filterType!=="all" && e.type!==filterType) return false;
    if (filterPri!=="all"  && e.priority!==filterPri) return false;
    return true;
  }), [events, filterType, filterPri]);

  const toggleId = (i) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(i)?n.delete(i):n.add(i); return n;
  });

  const handleSyncAll      = async () => {
    if (!gcal.isConnected) { gcal.connect(); return; }
    // Don't push Google-origin events back to Google Calendar — they're
    // already there, and our slotId hash wouldn't match their real Google
    // ID, so we'd create duplicates.
    const pushable = events.filter(e => e.source !== "google-calendar");
    await gcal.syncToCalendar(pushable);
  };
  const handleSyncSelected = async () => { if (!gcal.isConnected){gcal.connect();return;} await gcal.syncToCalendar(filteredEvs.filter((_,i)=>selectedIds.has(i))); };

  return (
    <div>
      {/* ── Sync bar ── */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div>
            <div className="card-title" style={{marginBottom:2}}>📅 Calendar</div>
            <div style={{fontSize:"0.75rem",color:"var(--muted)"}}>{events.filter(e=>e.startTime&&e.endTime).length} scheduled slots</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)"}}>
              {["week","month"].map(v=>(
                <button key={v} onClick={()=>setView(v)}
                  style={{padding:"6px 14px",border:"none",cursor:"pointer",fontSize:"0.78rem",fontWeight:600,
                    background:view===v?"var(--purple)":"transparent",
                    color:view===v?"white":"var(--muted)",transition:"all 0.15s"}}>
                  {v==="week"?"Week":"Month"}
                </button>
              ))}
            </div>
            {!gcal.isConnected
              ? <button className="btn btn-primary" onClick={gcal.connect} disabled={gcal.isConnecting}>
                  {gcal.isConnecting?<><span className="spinner"/>Connecting...</>:"🔗 Connect Google Calendar"}
                </button>
              : <>
                  <button className="btn btn-success" onClick={handleSyncAll} disabled={gcal.isSyncing}>
                    {gcal.isSyncing?<><span className="spinner"/>Syncing...</>:`📅 Sync all ${events.length}`}
                  </button>
                  <button className="btn" onClick={()=>{setShowSync(p=>!p);setSelectedIds(new Set());}}>
                    {showSync?"✕ Close":"☑️ Choose"}
                  </button>
                  <button className="btn btn-ghost"
                    onClick={async () => {
                      if (!window.confirm("Delete all Cadence-created events from your Google Calendar? This removes duplicates and anything previously synced from this app. Your events INSIDE Cadence stay put.")) return;
                      await gcal.cleanupCalendar();
                      if (gcal.fetchCalendarEvents) gcal.fetchCalendarEvents();
                    }}
                    style={{fontSize:"0.72rem",color:"var(--red)",borderColor:"rgba(248,113,113,0.3)"}}
                    disabled={gcal.isSyncing}
                    title="Deletes any event in your Google Calendar that was created by Cadence (by ID prefix or 'Added by Cadence' footer)">
                    🧹 Clean up duplicates
                  </button>
                  <button className="btn btn-ghost" onClick={gcal.disconnect} style={{fontSize:"0.72rem"}}>Disconnect</button>
                </>}
          </div>
        </div>
        {gcal.isConnected&&<div style={{marginTop:6,fontSize:"0.75rem",color:"var(--green)"}}>✅ Connected</div>}
        {gcal.error&&<div style={{marginTop:6,fontSize:"0.78rem",color:"var(--red)"}}>⚠️ {gcal.error}</div>}
        {gcal.syncResult?.success?.length>0&&(
          <div style={{marginTop:8,fontSize:"0.78rem",color:"var(--green)"}}>
            ✅ {gcal.syncResult.created ? `${gcal.syncResult.created} new` : ""}
            {gcal.syncResult.created && gcal.syncResult.updated ? " · " : ""}
            {gcal.syncResult.updated ? `${gcal.syncResult.updated} updated` : ""}
            {!gcal.syncResult.created && !gcal.syncResult.updated && `${gcal.syncResult.success.length} synced`}
            {gcal.syncResult.success[0]?.link&&<a href={gcal.syncResult.success[0].link} target="_blank" rel="noreferrer"
              style={{marginLeft:6,color:"var(--blue)",textDecoration:"underline"}}>View →</a>}
          </div>
        )}
        {gcal.syncResult?.cleanup && (
          <div style={{marginTop:8,fontSize:"0.78rem",color:"var(--amber)"}}>
            🧹 Cleaned up {gcal.syncResult.cleanup.deleted} Cadence event{gcal.syncResult.cleanup.deleted!==1?"s":""} from Google Calendar
            {gcal.syncResult.cleanup.failed > 0 && ` (${gcal.syncResult.cleanup.failed} failed)`}
          </div>
        )}
      </div>

      {/* ── Sync selector ── */}
      {showSync&&gcal.isConnected&&(
        <div className="card" style={{marginBottom:14,borderColor:"rgba(124,111,247,0.3)"}}>
          <div className="card-title">☑️ Choose events to sync</div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <select className="input" style={{width:"auto"}} value={filterType} onChange={e=>{setFilterType(e.target.value);setSelectedIds(new Set());}}>
              <option value="all">All types</option>
              {["exam","assignment","quiz","project","reading"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" style={{width:"auto"}} value={filterPri} onChange={e=>{setFilterPri(e.target.value);setSelectedIds(new Set());}}>
              <option value="all">All priorities</option>
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
            <button className="btn" style={{fontSize:"0.75rem"}} onClick={()=>setSelectedIds(new Set(filteredEvs.map((_,i)=>i)))}>Select all ({filteredEvs.length})</button>
            <button className="btn" style={{fontSize:"0.75rem"}} onClick={()=>setSelectedIds(new Set())}>Clear</button>
          </div>
          <div style={{maxHeight:220,overflowY:"auto",border:"1px solid var(--border)",borderRadius:8,marginBottom:10}}>
            {filteredEvs.map((ev,i)=>(
              <div key={i} onClick={()=>toggleId(i)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                  borderBottom:"1px solid var(--border)",cursor:"pointer",
                  background:selectedIds.has(i)?"rgba(124,111,247,0.08)":"transparent"}}>
                <input type="checkbox" checked={selectedIds.has(i)} onChange={()=>toggleId(i)} onClick={e=>e.stopPropagation()}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"0.82rem",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
                  <div style={{fontSize:"0.68rem",color:"var(--hint)"}}>{ev.dueDate||ev.date}{ev.course?` · ${ev.course}`:""}</div>
                </div>
                <span className={`badge badge-${ev.priority}`}>{ev.priority}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" disabled={selectedIds.size===0||gcal.isSyncing} onClick={handleSyncSelected}>
            📅 Sync {selectedIds.size} events
          </button>
        </div>
      )}

      {/* ── Nav bar ── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <button className="btn btn-ghost" onClick={goBack} style={{padding:"6px 12px"}}>←</button>
        <button className="btn" onClick={goToday} style={{fontSize:"0.78rem",padding:"6px 12px"}}>Today</button>
        <button className="btn btn-ghost" onClick={goForward} style={{padding:"6px 12px"}}>→</button>
        <div style={{fontWeight:700,fontSize:"1rem",color:"var(--text)",marginLeft:4}}>
          {view==="week"?weekLabel:monthYear}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <button className="btn btn-ghost" onClick={()=>setShowLegend(s=>!s)} style={{fontSize:"0.75rem",padding:"6px 10px"}}>
            {showLegend ? "Hide legend" : "Show legend"}
          </button>
        </div>
      </div>

      {/* ── Source filter chips ── */}
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:"0.7rem",color:"var(--hint)",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginRight:4}}>
          Show
        </span>
        {[
          { key:"course",           palette:SOURCE_COLORS.course },
          { key:"google-calendar",  palette:SOURCE_COLORS["google-calendar"] },
          { key:"ai",               palette:SOURCE_COLORS.ai.default },
          { key:"manual",           palette:SOURCE_COLORS.manual },
        ].map(({key,palette})=>{
          const on = visibleSources.has(key);
          return (
            <button key={key}
              onClick={()=>setVisibleSources(prev=>{
                const n = new Set(prev);
                n.has(key) ? n.delete(key) : n.add(key);
                return n;
              })}
              style={{
                padding:"4px 10px",borderRadius:999,cursor:"pointer",
                fontSize:"0.72rem",fontWeight:600,
                background: on ? palette.bg : "transparent",
                color:      on ? "#fff"     : "var(--muted)",
                border: `1px solid ${on ? palette.border : "var(--border)"}`,
                opacity: on ? 1 : 0.55,
                transition: "all 0.15s",
                display:"inline-flex",alignItems:"center",gap:5,
              }}>
              <span>{palette.icon}</span>
              <span>{palette.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Legend panel ── */}
      {showLegend && (
        <div className="card" style={{marginBottom:14,padding:"14px 16px",background:"rgba(255,255,255,0.02)"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16}}>
            <div>
              <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--text)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                Background = source
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:"0.78rem",color:"var(--muted)"}}>
                {[
                  SOURCE_COLORS.course,
                  SOURCE_COLORS["google-calendar"],
                  SOURCE_COLORS.ai.default,
                  SOURCE_COLORS.manual,
                ].map(p => (
                  <div key={p.label} style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:14,height:14,borderRadius:3,background:p.bg,border:`1px solid ${p.border}`}}/>
                    <span>{p.icon} {p.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--text)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                Left stripe = priority
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:"0.78rem",color:"var(--muted)"}}>
                {[
                  {label:"High",   color:PRIORITY_STRIPE.high},
                  {label:"Medium", color:PRIORITY_STRIPE.medium},
                  {label:"Low",    color:PRIORITY_STRIPE.low},
                ].map(p=>(
                  <div key={p.label} style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:4,height:14,borderRadius:2,background:p.color}}/>
                    <span>{p.label} priority</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--text)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                Relationships
              </div>
              <div style={{fontSize:"0.78rem",color:"var(--muted)",lineHeight:1.55}}>
                Click any event to highlight its related AI study blocks. A Blackboard submission
                and the AI-scheduled blocks that prep for it will glow together.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view==="week"&&(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"52px repeat(7,1fr)",
            borderBottom:"1px solid var(--border)",background:"rgba(255,255,255,0.02)"}}>
            <div/>
            {weekDates.map((d,i)=>{
              const todayFlag = isToday(d);
              return (
                <div key={i} style={{padding:"10px 6px",textAlign:"center",
                  borderLeft:"1px solid var(--border)"}}>
                  <div style={{fontSize:"0.68rem",color:i>=5?"var(--amber)":"var(--hint)",fontWeight:600,
                    textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                    {DAY_LABELS[d.getDay()]}
                  </div>
                  <div style={{
                    width:28,height:28,borderRadius:"50%",margin:"0 auto",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    background:todayFlag?"var(--purple)":"transparent",
                    fontSize:"0.85rem",fontWeight:todayFlag?700:500,
                    color:todayFlag?"white":i>=5?"var(--amber)":"var(--text)",
                    boxShadow:todayFlag?"var(--glow-purple)":"none",
                  }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div ref={scrollRef} style={{overflowY:"auto",maxHeight:"calc(100vh - 300px)",position:"relative"}}>
            <div style={{display:"grid",gridTemplateColumns:"52px repeat(7,1fr)",
              position:"relative",minHeight:(END_HOUR-START_HOUR)*HOUR_HEIGHT}}>

              {/* Hour labels + horizontal lines */}
              {HOURS.map((h,i)=>(
                <React.Fragment key={h}>
                  <div style={{
                    position:"absolute",top:i*HOUR_HEIGHT,left:0,width:"100%",
                    borderTop:"1px solid rgba(255,255,255,0.05)",pointerEvents:"none",zIndex:0,
                  }}/>
                  <div style={{
                    position:"absolute",top:i*HOUR_HEIGHT-8,left:0,width:48,
                    fontSize:"0.6rem",color:"var(--hint)",textAlign:"right",
                    paddingRight:6,fontFamily:"JetBrains Mono",zIndex:1,
                  }}>{fmtHour(h)}</div>
                </React.Fragment>
              ))}

              {/* Current time line */}
              {weekDates.some(d=>isToday(d))&&(()=>{
                const now = new Date();
                const mins = (now.getHours()-START_HOUR)*60+now.getMinutes();
                const top  = (mins/60)*HOUR_HEIGHT;
                const colIdx = weekDates.findIndex(d=>isToday(d));
                if (top<0) return null;
                return (
                  <div style={{
                    position:"absolute",top,left:`calc(52px + ${colIdx/7*100}%)`,
                    width:`${100/7}%`,zIndex:10,pointerEvents:"none",
                    display:"flex",alignItems:"center",
                  }}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"var(--red)",flexShrink:0,marginLeft:-4}}/>
                    <div style={{flex:1,height:1.5,background:"var(--red)",opacity:0.8}}/>
                  </div>
                );
              })()}

              {/* Day columns */}
              {weekDates.map((d,di)=>{
                const dateStr = getDateStr(d);
                const dayEvs  = eventsByDate[dateStr]||[];
                const layout  = layoutEvents(dayEvs);
                const allDay  = dayEvs.filter(e=>!e.startTime||!e.endTime);

                return (
                  <div key={di} style={{
                    gridColumn:di+2,gridRow:1,
                    borderLeft:"1px solid rgba(255,255,255,0.05)",
                    position:"relative",
                    height:(END_HOUR-START_HOUR)*HOUR_HEIGHT,
                  }}>
                    {/* Weekend shade */}
                    {di>=5&&<div style={{position:"absolute",inset:0,background:"rgba(251,191,36,0.03)",pointerEvents:"none"}}/>}

                    {/* All-day events (no time) at top as chips */}
                    {allDay.length>0&&(
                      <div style={{position:"absolute",top:2,left:2,right:2,zIndex:5,display:"flex",flexDirection:"column",gap:2}}>
                        {allDay.slice(0,3).map((ev,i)=>(
                          <div key={i} onClick={()=>setSelectedEv(ev)}
                            style={{fontSize:"0.65rem",fontWeight:600,padding:"2px 5px",borderRadius:4,
                              background:{high:"rgba(248,113,113,0.2)",medium:"rgba(251,191,36,0.2)",low:"rgba(74,222,128,0.2)"}[ev.priority]||"rgba(255,255,255,0.1)",
                              color:{high:"var(--red)",medium:"var(--amber)",low:"var(--green)"}[ev.priority]||"var(--muted)",
                              cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timed event blocks */}
                    {layout.map(({ev,col,totalCols},i)=>{
                      const startMins = timeToMinutes(ev.startTime);
                      const endMins   = timeToMinutes(ev.endTime);
                      if (startMins==null||endMins==null) return null;

                      const topPx    = ((startMins/60)-START_HOUR)*HOUR_HEIGHT;
                      const heightPx = Math.max(((endMins-startMins)/60)*HOUR_HEIGHT, 22);
                      const colW     = 100/totalCols;

                      // Source drives bg + icon; priority drives stripe
                      const src      = resolveSource(ev);
                      const ec       = src.palette;
                      const stripe   = PRIORITY_STRIPE[ev.priority] || ec.border;
                      const isShort  = heightPx < 40;

                      // Highlight if this event is related to the selected one.
                      // "Related" = same parent task (course-tolerant match),
                      // but a different scheduled slot.
                      const myEK  = eventKey(ev);
                      const selEK = eventKey(selectedEv);
                      const isSelected = selEK && selEK === myEK;
                      const isRelated  = !isSelected && selectedEv && sameParent(ev, selectedEv);

                      if (topPx < 0 || topPx > (END_HOUR-START_HOUR)*HOUR_HEIGHT) return null;

                      return (
                        <div key={i}
                          onClick={()=>setSelectedEv(isSelected ? null : ev)}
                          title={`${ec.label}${ev.priority?` · ${ev.priority} priority`:""}`}
                          style={{
                            position:"absolute",
                            top:topPx+1, left:`${col*colW+1}%`,
                            width:`${colW-1.5}%`, height:heightPx-2,
                            background:ec.bg,
                            borderTop:`1px solid ${isRelated ? stripe : ec.border}`,
                            borderRight:`1px solid ${isRelated ? stripe : ec.border}`,
                            borderBottom:`1px solid ${isRelated ? stripe : ec.border}`,
                            borderLeft:`4px solid ${stripe}`,
                            borderRadius:6, padding:isShort?"3px 6px":"6px 8px",
                            cursor:"pointer", overflow:"hidden",
                            zIndex:isSelected?8:5,
                            boxShadow: isSelected
                              ? `0 0 0 2px ${stripe}, 0 4px 12px rgba(0,0,0,0.35)`
                              : isRelated
                                ? `0 0 0 2px ${stripe}`
                                : "none",
                            transition:"box-shadow 0.15s, transform 0.15s",
                            opacity: src.kind === "google-calendar" ? 0.88 : 1,
                            transform: isRelated ? "translateX(1px)" : "none",
                          }}>
                          {/* Task title — always visible and prominent */}
                          <div style={{
                            fontSize: isShort?"0.72rem":"0.8rem",
                            fontWeight:700,
                            color:"#ffffff",
                            overflow:"hidden",
                            textOverflow:"ellipsis",
                            whiteSpace: isShort?"nowrap":"normal",
                            lineHeight:1.3,
                            marginBottom: isShort?0:4,
                            display:"-webkit-box",
                            WebkitLineClamp: isShort?1:3,
                            WebkitBoxOrient:"vertical",
                            textShadow:"0 1px 2px rgba(0,0,0,0.4)",
                          }}>
                            <span style={{marginRight:4,fontSize:"0.9em"}}>{ec.icon}</span>
                            {ev.title}
                          </div>

                          {/* Time — only if tall enough */}
                          {!isShort&&(
                            <div style={{fontSize:"0.65rem",color:"rgba(255,255,255,0.75)",
                              fontFamily:"JetBrains Mono",marginBottom:2}}>
                              {ev.startTime}–{ev.endTime}
                            </div>
                          )}
                          {!isShort&&(
                            <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.65)",fontWeight:600,
                              display:"flex",alignItems:"center",gap:4}}>
                              <span>{ec.label}</span>
                              {ev.priority && (
                                <span style={{
                                  display:"inline-block",width:6,height:6,borderRadius:"50%",
                                  background:stripe,
                                }}/>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view==="month"&&(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",
            borderBottom:"1px solid var(--border)"}}>
            {DAY_LABELS.map(d=>(
              <div key={d} style={{padding:"8px 0",textAlign:"center",fontSize:"0.7rem",
                color:"var(--hint)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                {d}
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array.from({length:firstOfMon}).map((_,i)=>(
              <div key={`e${i}`} style={{minHeight:90,borderRight:"1px solid var(--border)",
                borderBottom:"1px solid var(--border)",background:"rgba(255,255,255,0.01)"}}/>
            ))}
            {Array.from({length:daysInMon},(_,i)=>i+1).map(day=>{
              const dateStr  = isoDate(refDate.getFullYear(),refDate.getMonth(),day);
              const dayEvs   = eventsByDate[dateStr]||[];
              const d        = new Date(refDate.getFullYear(),refDate.getMonth(),day);
              const todayFlg = isToday(d);
              const isWknd   = d.getDay()===0||d.getDay()===6;
              const timedEvs = dayEvs.sort((a,b)=>
                timeToMinutes(a.startTime)-timeToMinutes(b.startTime));

              return (
                <div key={day} style={{
                  minHeight:90,padding:"6px 4px",
                  borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",
                  background:isWknd?"rgba(251,191,36,0.02)":"transparent",
                }}>
                  <div style={{
                    width:22,height:22,borderRadius:"50%",marginBottom:4,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    background:todayFlg?"var(--purple)":"transparent",
                    fontSize:"0.72rem",fontWeight:todayFlg?700:400,
                    color:todayFlg?"white":isWknd?"var(--amber)":"var(--text)",
                  }}>{day}</div>

                  {/* Timed blocks */}
                  {timedEvs.slice(0,3).map((ev,i)=>{
                    const src = resolveSource(ev);
                    const ec  = src.palette;
                    const stripe = PRIORITY_STRIPE[ev.priority] || ec.border;
                    return (
                      <div key={i} onClick={()=>setSelectedEv(ev)}
                        title={`${ec.label}${ev.priority?` · ${ev.priority}`:""}`}
                        style={{
                          fontSize:"0.6rem",fontWeight:600,padding:"2px 5px",
                          borderRadius:4,marginBottom:2,cursor:"pointer",
                          background:ec.bg,borderLeft:`3px solid ${stripe}`,
                          color:ec.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                        }}>
                        <span style={{marginRight:3}}>{ec.icon}</span>
                        {ev.startTime&&<span style={{fontFamily:"JetBrains Mono",marginRight:3,opacity:0.8}}>{ev.startTime}</span>}
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvs.length>3&&<div style={{fontSize:"0.58rem",color:"var(--hint)",paddingLeft:3}}>+{dayEvs.length-3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Event detail popup ── */}
      {selectedEv&&(() => {
        const src = resolveSource(selectedEv);
        const popStripe = PRIORITY_STRIPE[selectedEv.priority] || src.palette.border;
        // Related blocks: any event that same-parents the selected one but
        // is scheduled at a different slot. Uses course-tolerant matching so
        // a Fordham deadline and a courseless AI study block link up.
        const selEK = eventKey(selectedEv);
        const relatedBlocks = events.filter(e => {
          if (!parentKey(selectedEv)) return false;
          if (eventKey(e) === selEK) return false;
          return sameParent(e, selectedEv);
        });
        return (
        <div style={{
          position:"fixed",bottom:28,right:28,zIndex:200,
          width:320,background:"var(--surface)",
          borderTop:`1px solid ${src.palette.border}`,
          borderRight:`1px solid ${src.palette.border}`,
          borderBottom:`1px solid ${src.palette.border}`,
          borderLeft:`4px solid ${popStripe}`,
          borderRadius:14,padding:"18px 20px",
          boxShadow:"0 8px 40px rgba(0,0,0,0.5)",
          animation:"slideUp 0.2s ease",
        }}>
          <style>{`@keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

          {/* Source pill */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{
              display:"inline-flex",alignItems:"center",gap:4,
              padding:"2px 8px",borderRadius:999,fontSize:"0.68rem",fontWeight:700,
              background:src.palette.bg,color:"#fff",
            }}>
              {src.palette.icon} {src.palette.label}
            </span>
            {selectedEv.priority && (
              <span style={{
                display:"inline-flex",alignItems:"center",gap:4,
                padding:"2px 8px",borderRadius:999,fontSize:"0.68rem",fontWeight:700,
                background:`${popStripe}22`,color:popStripe,border:`1px solid ${popStripe}55`,
              }}>
                ● {selectedEv.priority}
              </span>
            )}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:"0.95rem",color:"var(--text)",flex:1,paddingRight:8}}>
              {selectedEv.title || selectedEv.taskTitle || "Untitled"}
            </div>
            <button onClick={()=>setSelectedEv(null)}
              style={{background:"none",border:"none",color:"var(--hint)",cursor:"pointer",fontSize:"1rem",lineHeight:1}}>✕</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:"0.78rem",color:"var(--muted)"}}>
            {selectedEv.startTime&&(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span>⏰</span>
                <span style={{fontFamily:"JetBrains Mono",color:"var(--text)"}}>
                  {selectedEv.startTime} – {selectedEv.endTime}
                </span>
                {selectedEv.estimatedHours&&<span style={{color:"var(--hint)"}}>({selectedEv.estimatedHours}h)</span>}
              </div>
            )}
            {(selectedEv.date||selectedEv.dueDate)&&(
              <div style={{display:"flex",gap:6}}>
                <span>📅</span>
                <span>{selectedEv.date||selectedEv.dueDate}</span>
              </div>
            )}
            {selectedEv.course&&<div style={{display:"flex",gap:6}}><span>📚</span><span>{selectedEv.course}</span></div>}
            {selectedEv.energyMatch&&(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span>{selectedEv.energyMatch==="peak"?"🔥":selectedEv.energyMatch==="low"?"🌊":"⚡"}</span>
                <span style={{color:"var(--text)",fontWeight:600,textTransform:"capitalize"}}>
                  {selectedEv.energyMatch} energy slot
                </span>
              </div>
            )}
            {selectedEv.rationale&&(
              <div style={{marginTop:6,padding:"7px 10px",background:"rgba(124,111,247,0.08)",
                border:"1px solid rgba(124,111,247,0.15)",borderRadius:8,fontSize:"0.72rem",
                color:"var(--purple-l)",fontStyle:"italic",lineHeight:1.5}}>
                💡 {selectedEv.rationale}
              </div>
            )}

            {/* Related blocks (study slots for a deadline, or vice versa) */}
            {relatedBlocks.length > 0 && (
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
                <div style={{fontSize:"0.68rem",fontWeight:700,color:"var(--hint)",
                  textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                  {src.kind === "ai" ? "Works toward" : "AI study blocks for this"}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {relatedBlocks.slice(0,4).map((rb,ri) => {
                    const rbSrc = resolveSource(rb);
                    return (
                      <div key={ri} onClick={()=>setSelectedEv(rb)} style={{
                        display:"flex",alignItems:"center",gap:6,padding:"5px 8px",
                        borderRadius:6,cursor:"pointer",
                        background:"rgba(255,255,255,0.03)",
                        border:"1px solid var(--border)",
                      }}>
                        <span style={{fontSize:"0.75rem"}}>{rbSrc.palette.icon}</span>
                        <span style={{fontSize:"0.74rem",color:"var(--text)",fontWeight:500,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {rb.title || rb.taskTitle}
                        </span>
                        <span style={{fontFamily:"JetBrains Mono",fontSize:"0.65rem",color:"var(--hint)"}}>
                          {(rb.date||rb.dueDate||"").slice(5)} {rb.startTime||""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
