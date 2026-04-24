// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import LoginPage from "./components/LoginPage";
import SyllabusUploader from "./components/SyllabusUploader";
import EnergyTracker from "./components/EnergyTracker";
import SmartScheduler from "./components/SmartScheduler";
import CalendarView from "./components/CalendarView";
import BlackboardImport from "./components/BlackboardImport";
import ActivityLogger from "./components/ActivityLogger";
import TodayView from "./components/TodayView";
import CompanionMode from "./components/CompanionMode";
import CompanionInsights from "./components/CompanionInsights";
import { useGoogleCalendar } from "./hooks/useGoogleCalendar";
import { useBlackboard } from "./hooks/useBlackboard";
import { loadSessions } from "./utils/patternLearner";
import { loadSyllabi, deleteSyllabus } from "./utils/syllabusStore";
import "./App.css";

// Flat, two-group nav: daily flow + one-time setup.
// Intentionally only 5 daily items to reduce cognitive load.
const STUDENT_NAV = [
  { section: "Workspace" },
  { id:"today",      icon:"☀", label:"Today",        badge: null },
  { id:"schedule",   icon:"◐", label:"Schedule",     badge: null },
  { id:"calendar",   icon:"▦", label:"Calendar",     badge: null },
  { id:"dashboard",  icon:"▲", label:"Insights",     badge: null },
  { id:"activity",   icon:"●", label:"Sessions",     badge: null },

  { section: "Setup" },
  { id:"upload",     icon:"⎘", label:"Syllabi",        badge: null },
  { id:"blackboard", icon:"⌂", label:"Blackboard",     badge: null },
  { id:"energy",     icon:"⚡", label:"Focus Profile",  badge: null },
];

const COMPANION_NAV = [
  { section: "Workspace" },
  { id:"companion",          icon:"◈", label:"Focus Circle",  badge: null },
  { id:"companion-insights", icon:"🏆", label:"Leaderboard",   badge: null },
];

export default function App() {
  // Authentication state
  // Hydrate from localStorage so sign-in survives reloads.
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("smart_cal_user_authenticated") === "true";
  });
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem("smart_cal_user_email") || "";
  });

  // App state
  const [appMode, setAppMode]               = useState(() => localStorage.getItem("smart_cal_mode") || "student");
  const [activeTab, setActiveTab]           = useState(() => (localStorage.getItem("smart_cal_mode") === "companion" ? "companion" : "today"));
  const [collapsedSections, setCollapsedSections] = useState(() => ({
    "Workspace": false,
    "Setup": true,
  }));
  // Hydrate extractedEvents by deriving them from the persisted allEvents list
  // (anything that isn't a Google Calendar pull and isn't an AI-scheduled slot).
  // This keeps SmartScheduler + sidebar event count honest after a reload.
  const [extractedEvents, setExtractedEvents] = useState(() => {
    try {
      const all = JSON.parse(localStorage.getItem("smart_cal_all_events") || "[]");
      return all.filter(e => e.source !== "google-calendar" && !e.aiScheduled);
    } catch { return []; }
  });
  // Hydrate energy pattern from localStorage so Insights heatmap + sidebar type
  // work on first render without needing to visit Focus Profile first.
  const [energyPattern, setEnergyPattern]   = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem("smart_cal_energy_pattern") || "null");
      return p && p._version === "v2" ? p : null;
    } catch { return null; }
  });
  const [learnedPattern, setLearnedPattern] = useState(null);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [schedule, setSchedule] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smart_cal_schedule") || "null"); }
    catch { return null; }
  });
  const [allEvents, setAllEvents]           = useState(() => {
    try { return JSON.parse(localStorage.getItem("smart_cal_all_events") || "[]"); }
    catch { return []; }
  });

  // Persist schedule + events so they survive reloads.
  useEffect(() => {
    if (schedule) localStorage.setItem("smart_cal_schedule", JSON.stringify(schedule));
  }, [schedule]);
  useEffect(() => {
    localStorage.setItem("smart_cal_all_events", JSON.stringify(allEvents));
  }, [allEvents]);

  const gcal = useGoogleCalendar();

  // ── Fetch Google Calendar events when connected ──────────────────────────────
  // Guarded with a ref so completion of the fetch (which flips isSyncing) does
  // NOT retrigger the effect → previously caused an infinite "Syncing…" loop.
  const gcalFetchedRef = useRef(false);
  useEffect(() => {
    if (!gcal.isConnected) {
      gcalFetchedRef.current = false;
      return;
    }
    if (gcalFetchedRef.current) return;
    gcalFetchedRef.current = true;
    // Small delay to let token settle
    const timeoutId = setTimeout(() => {
      gcal.fetchCalendarEvents();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [gcal.isConnected]); // eslint-disable-line

  // ── Merge Google Calendar events into allEvents ──────────────────────────────
  // Previously this clobbered ALL existing google-calendar events with the
  // freshly-pulled set. Now we also drop any local copies of events that
  // round-tripped through Google (identifiable by the title+date+time hash),
  // so course deadlines don't appear twice after a sync-pull-sync cycle.
  useEffect(() => {
    if (gcal.fetchedEvents && gcal.fetchedEvents.length > 0) {
      const pulledKeys = new Set(
        gcal.fetchedEvents.map(e =>
          `${(e.title||"").toLowerCase().trim()}|${e.date||""}|${e.startTime||""}`
        )
      );
      setAllEvents((prev) => {
        // Drop: 1) any prior google-calendar copies (they're being replaced), and
        //       2) any local copies whose identity matches a pulled event AND
        //          whose pulled version carries a cadenceSource tag (meaning
        //          Google's view is the authoritative copy of our push).
        const filtered = prev.filter((e) => {
          if (e.source === "google-calendar") return false;
          const myKey = `${(e.title||e.taskTitle||"").toLowerCase().trim()}|${e.date||""}|${e.startTime||""}`;
          const pulled = gcal.fetchedEvents.find(p => {
            const pk = `${(p.title||"").toLowerCase().trim()}|${p.date||""}|${p.startTime||""}`;
            return pk === myKey && p.source && p.source !== "google-calendar";
          });
          return !pulled;
        });
        return [...filtered, ...gcal.fetchedEvents];
      });
    }
  }, [gcal.fetchedEvents]);

  const handleBBEvents = (events) => {
    // Accept both legacy "blackboard" and new unified "course" sources on
    // filter so pre-merge state doesn't cause duplicates.
    const isCourse = (e) => e.source === "course" || e.source === "blackboard";
    setExtractedEvents(prev => [...prev.filter(e=>!isCourse(e)), ...events]);
    setAllEvents(prev => [...prev.filter(e=>!isCourse(e)), ...events]);
  };
  const bb = useBlackboard(handleBBEvents);

  useEffect(() => {
    const handler = (e) => setLearnedPattern(e.detail);
    window.addEventListener("patternUpdated", handler);
    return () => window.removeEventListener("patternUpdated", handler);
  }, []);

  const handleEventsExtracted = (events) => {
    setExtractedEvents(prev => [...prev, ...events]);
    setAllEvents(prev => [...prev, ...events]);
  };
  const handleBlackboardImport = (events) => {
    // Accept both legacy "blackboard" and unified "course" tags so events
    // from an older localStorage shape don't duplicate with fresh imports.
    const isCourse = (e) => e.source === "course" || e.source === "blackboard";
    setExtractedEvents(prev => [...prev.filter(e => !isCourse(e)), ...events]);
    setAllEvents(prev => [...prev.filter(e => !isCourse(e)), ...events]);
  };
  const handleScheduleBuilt = (schedule) => {
    setSchedule(schedule);
    setScheduledEvents(schedule.schedule || []);
    setAllEvents(prev => {
      const existing = prev.filter(e => !e.aiScheduled);
      return [...existing, ...(schedule.schedule||[]).map(e=>({...e,aiScheduled:true}))];
    });
  };

  // Login handlers
  const handleLogin = (email) => {
    setUserEmail(email);
    setIsAuthenticated(true);
    localStorage.setItem("smart_cal_user_authenticated", "true");
    localStorage.setItem("smart_cal_user_email", email);

    // First-time user? Route straight to the Focus Profile quiz.
    const hasEnergyPattern = Boolean(localStorage.getItem("smart_cal_energy_pattern"));
    if (!hasEnergyPattern && localStorage.getItem("smart_cal_mode") !== "companion") {
      setActiveTab("energy");
      setCollapsedSections((prev) => ({ ...prev, Setup: false }));
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("smart_cal_user_authenticated");
    localStorage.removeItem("smart_cal_user_email");
    setIsAuthenticated(false);
    setUserEmail("");
  };

  // Switch between Student and Companion modes
  const switchMode = (mode) => {
    setAppMode(mode);
    localStorage.setItem("smart_cal_mode", mode);
    setActiveTab(mode === "student" ? "today" : "companion");
  };

  // Save app mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("smart_cal_mode", appMode);
  }, [appMode]);

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Select navigation based on mode
  const navBase = appMode === "student" ? STUDENT_NAV : COMPANION_NAV;

  // Badge counts for nav
  const navWithBadges = navBase.map(item => {
    if (item.id === "blackboard" && bb.events?.length) return {...item, badge: bb.events.length};
    if (item.id === "schedule"   && scheduledEvents.length) return {...item, badge: scheduledEvents.length};
    return item;
  });

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <img
              src="/fordham-logo.png"
              alt="Fordham University"
              style={{
                display: "block",
                height: 42,
                width: "auto",
                borderRadius: 8,
              }}
            />
            <div className="brand-fordham" style={{ margin: 0, lineHeight: 1.2 }}>
              FORDHAM<br />UNIVERSITY
            </div>
          </div>
          <div className="brand-title">Cadence</div>
          <div className="brand-sub">Adaptive Academic Planner</div>
        </div>

        {/* User info and sign-out */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: "12px",
        }}>
          <div style={{
            fontSize: "0.75rem",
            color: "#8b90b0",
            marginBottom: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontWeight: 600,
          }}>
            Logged In
          </div>
          <div style={{
            fontSize: "0.85rem",
            color: "#a89ef8",
            marginBottom: "10px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}>
            {userEmail}
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: "100%",
              padding: "7px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#f87171",
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(248,113,113,0.2)";
              e.target.style.borderColor = "rgba(248,113,113,0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(248,113,113,0.1)";
              e.target.style.borderColor = "rgba(248,113,113,0.25)";
            }}
          >
            Sign out
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mode-toggle-wrap">
          <button
            onClick={() => switchMode("student")}
            className={`mode-toggle-btn ${appMode === "student" ? "active" : ""}`}
          >
            Student
          </button>
          <button
            onClick={() => switchMode("companion")}
            className={`mode-toggle-btn ${appMode === "companion" ? "active-pink" : ""}`}
          >
            Companion
          </button>
        </div>

        {/* Sync status (Student mode only) */}
        {appMode === "student" && (
          <div className="sync-status">
            <div className={`sync-pill ${gcal.isConnected?"connected":gcal.isConnecting?"connecting":""}`}
              onClick={() => {
                if (gcal.isConnecting) return;
                if (gcal.isConnected) { setActiveTab("calendar"); return; }
                gcal.connect();
              }}
              style={{ cursor: gcal.isConnecting ? "wait" : "pointer" }}
              title={gcal.isConnected ? "Open Calendar view" : "Connect your Google Calendar"}>
              <div className={`sync-dot ${gcal.isConnecting?"pulse":""}`}/>
              {gcal.isConnected ? "Google Calendar · connected" : gcal.isConnecting ? "Connecting…" : "Connect Google Cal"}
            </div>
            <div className={`sync-pill ${bb.isConnected?"connected":bb.status==="syncing"?"connecting":""}`}
              onClick={() => setActiveTab("blackboard")} style={{ cursor:"pointer" }}>
              <div className={`sync-dot ${bb.status==="syncing"?"pulse":""}`}/>
              {bb.isConnected ? `Blackboard · ${bb.lastSyncLabel||"synced"}` : bb.status==="syncing" ? "Syncing BB..." : "Connect Blackboard"}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {navWithBadges.map((item, i) => {
            if (item.section) {
              const isCollapsed = collapsedSections[item.section];
              return (
                <div key={i}>
                  <div 
                    className="nav-section-label"
                    style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onClick={() => setCollapsedSections(prev => ({...prev, [item.section]: !prev[item.section]}))}
                  >
                    {item.section}
                    <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                  </div>
                  {!isCollapsed && <div key={`${item.section}-items`} />}
                </div>
              );
            }
            // Skip items if their section is collapsed
            const prevSection = navWithBadges.slice(0, i).reverse().find(x => x.section)?.section;
            if (prevSection && collapsedSections[prevSection]) return null;
            
            return (
              <div key={item.id} className={`nav-item ${activeTab===item.id?"active":""}`}
                onClick={() => setActiveTab(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </div>
            );
          })}
        </nav>

        {/* Stats hidden */}
      </aside>

      {/* ── Main ── */}
      <main className="app-main">
        {activeTab === "companion"          && <CompanionMode />}
        {activeTab === "companion-insights" && <CompanionInsights />}
        {activeTab === "today"      && <TodayView schedule={schedule} events={allEvents} energyPattern={energyPattern} learnedPattern={learnedPattern} onScheduleUpdate={handleScheduleBuilt} onNavigate={setActiveTab} />}
        {activeTab === "blackboard" && <BlackboardImport bb={bb} onEventsImported={handleBlackboardImport} />}
        {activeTab === "upload"     && <SyllabusUploader onEventsExtracted={handleEventsExtracted} />}
        {activeTab === "energy"     && <EnergyTracker onPatternSaved={setEnergyPattern} onNavigate={setActiveTab} hasEvents={(extractedEvents?.length || 0) > 0} />}
        {activeTab === "activity"   && <ActivityLogger onPatternUpdated={setLearnedPattern} />}
        {activeTab === "schedule"   && <SmartScheduler extractedEvents={extractedEvents} energyPattern={energyPattern} learnedPattern={learnedPattern} onScheduleBuilt={handleScheduleBuilt} onNavigate={setActiveTab} />}
        {activeTab === "calendar"   && <CalendarView events={allEvents} onEventsChange={setAllEvents} gcal={gcal} />}
        {activeTab === "dashboard"  && (
          <ReportDashboard
            events={allEvents}
            extractedEvents={extractedEvents}
            scheduledEvents={scheduledEvents}
            energyPattern={energyPattern}
            learnedPattern={learnedPattern}
            gcal={gcal}
            bb={bb}
            onNavigate={setActiveTab}
          />
        )}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function ReportDashboard({ events, extractedEvents, scheduledEvents, energyPattern, learnedPattern, gcal, bb, onNavigate }) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const sessions = loadSessions();

  // Upcoming (today through next 7 days). Day-granularity compare so that
  // events due today still show, and anything strictly earlier is excluded.
  const upcoming = events.filter(e => {
    const dateStr = (e.date || e.dueDate || "").slice(0, 10);
    if (!dateStr) return false;
    if (dateStr < todayStr) return false;
    const diffDays = (new Date(dateStr + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000;
    return diffDays >= 0 && diffDays <= 7;
  }).sort((a, b) => (a.date || a.dueDate).localeCompare(b.date || b.dueDate));

  // Priority breakdown
  const high   = events.filter(e=>e.priority==="high").length;
  const medium = events.filter(e=>e.priority==="medium").length;
  const low    = events.filter(e=>e.priority==="low").length;
  const total  = events.length || 1;

  // Type breakdown
  const typeCounts = events.reduce((acc,e) => { acc[e.type||"other"]=(acc[e.type||"other"]||0)+1; return acc; }, {});

  // Avg productivity from sessions
  const avgProd = sessions.length
    ? (sessions.reduce((s,x)=>s+(x.productivity||5),0)/sessions.length).toFixed(1)
    : "—";

  // Completion rate
  const completed = events.filter(e=>e.completed).length;
  const compRate  = events.length ? Math.round(completed/events.length*100) : 0;

  const typeEmoji = (t) => ({exam:"📝",assignment:"📋",quiz:"✏️",project:"🏗️",reading:"📖"}[t]||"📌");
  const priorityColor = (p) => ({high:"var(--red)",medium:"var(--amber)",low:"var(--green)"}[p]||"var(--hint)");

  // SVG donut chart
  const DonutChart = ({ data, size=80 }) => {
    const r = 30; const cx = 40; const cy = 40;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const segments = data.map(d => {
      const dash = (d.pct/100) * circumference;
      const gap  = circumference - dash;
      const seg  = { ...d, dash, gap, offset };
      offset += dash;
      return seg;
    });
    return (
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10}/>
        {segments.map((seg, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={10}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            style={{ transform:"rotate(-90deg)", transformOrigin:"center", transition:"stroke-dasharray 0.5s ease" }}
          />
        ))}
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="central"
          style={{ fill:"var(--text)", fontSize:14, fontWeight:700, fontFamily:"JetBrains Mono" }}>
          {events.length}
        </text>
      </svg>
    );
  };

  const donutData = [
    { label:"High",   pct: Math.round(high/total*100),   color:"var(--red)" },
    { label:"Medium", pct: Math.round(medium/total*100), color:"var(--amber)" },
    { label:"Low",    pct: Math.round(low/total*100),    color:"var(--green)" },
  ];

  // Heatmap data from energy pattern
  const heatmap = energyPattern?.hourlyAvg
    ? Object.entries(energyPattern.hourlyAvg).map(([h,v]) => ({ h:parseInt(h), v }))
    : [];

  const heatColor = (v) => {
    if (v===null||v===undefined) return "rgba(255,255,255,0.04)";
    if (v>=8) return "var(--purple)";
    if (v>=6) return "#4f9fff";
    if (v>=4) return "#2dd4bf";
    return "rgba(255,255,255,0.08)";
  };

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">Insights</div>
        <div className="dash-sub">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · Powered by Groq</div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <div className="kpi-card purple">
          <div className="kpi-label">Total Events</div>
          <div className="kpi-val">{events.length}</div>
          <div className="kpi-sub">{upcoming.length} due this week</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">AI Scheduled</div>
          <div className="kpi-val">{scheduledEvents.length}</div>
          <div className="kpi-sub">{energyPattern?.archetype||"No pattern yet"}</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Avg Focus</div>
          <div className="kpi-val">{avgProd}</div>
          <div className="kpi-sub">{sessions.length} sessions logged</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">From Blackboard</div>
          <div className="kpi-val">{bb.events?.length||0}</div>
          <div className="kpi-sub">{bb.isConnected?`Synced ${bb.lastSyncLabel||"just now"}`:"Not connected"}</div>
        </div>
      </div>

      {/* Report grid */}
      <div className="report-grid">
        {/* Priority breakdown */}
        <div className="report-card">
          <div className="report-card-title">Priority Breakdown</div>
          <div className="donut-wrapper">
            <DonutChart data={donutData}/>
            <div className="donut-legend">
              {[{l:"High priority",v:high,c:"var(--red)"},{l:"Medium",v:medium,c:"var(--amber)"},{l:"Low priority",v:low,c:"var(--green)"}].map(d=>(
                <div key={d.l} className="donut-leg-item">
                  <div className="donut-leg-dot" style={{background:d.c}}/>
                  <span className="donut-leg-label">{d.l}</span>
                  <span className="donut-leg-val">{d.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Event types */}
        <div className="report-card">
          <div className="report-card-title">Event Types</div>
          {Object.entries(typeCounts).sort(([,a],[,b])=>b-a).slice(0,5).map(([type,count])=>(
            <div key={type} className="mini-bar-row">
              <div className="mini-bar-label">{typeEmoji(type)} {type}</div>
              <div className="mini-bar-track">
                <div className="mini-bar-fill" style={{
                  width:`${Math.round(count/Math.max(...Object.values(typeCounts))*100)}%`,
                  background:"var(--grad-purple)"
                }}/>
              </div>
              <div className="mini-bar-val">{count}</div>
            </div>
          ))}
          {Object.keys(typeCounts).length===0&&<div style={{color:"var(--hint)",fontSize:"0.82rem"}}>No events yet</div>}
        </div>

        {/* Energy heatmap */}
        <div className="report-card">
          <div className="report-card-title">Energy Heatmap (24h)</div>
          {heatmap.length>0 ? (
            <>
              <div className="heatmap-row">
                <div className="heatmap-label"/>
                {[0,6,12,18,23].map(h=>(
                  <div key={h} style={{flex:1,fontSize:"0.6rem",color:"var(--hint)",textAlign:"center"}}>
                    {h===0?"12a":h<12?`${h}a`:h===12?"12p":`${h-12}p`}
                  </div>
                ))}
              </div>
              <div className="heatmap-row">
                <div className="heatmap-label" style={{fontSize:"0.65rem",color:"var(--hint)"}}>Focus</div>
                {heatmap.map(({h,v})=>(
                  <div key={h} className="heatmap-cell"
                    title={`${h}:00 — Energy: ${v?.toFixed(1)||"n/a"}`}
                    style={{background:heatColor(v)}}/>
                ))}
              </div>
              <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                {[{c:"var(--purple)",l:"Peak"},{c:"var(--blue)",l:"Good"},{c:"var(--teal)",l:"Low"},{c:"rgba(255,255,255,0.08)",l:"Rest"}].map(x=>(
                  <div key={x.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.65rem",color:"var(--muted)"}}>
                    <div style={{width:10,height:10,borderRadius:2,background:x.c}}/>
                    {x.l}
                  </div>
                ))}
              </div>
            </>
          ):(
            <div style={{color:"var(--hint)",fontSize:"0.82rem",textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:"1.5rem",marginBottom:6}}>⚡</div>
              Log your energy pattern to see heatmap
              <br/>
              <button className="btn" style={{marginTop:8,fontSize:"0.75rem"}} onClick={()=>onNavigate("energy")}>
                Go to Energy tab →
              </button>
            </div>
          )}
        </div>

        {/* Session productivity */}
        <div className="report-card">
          <div className="report-card-title">Recent Focus Sessions</div>
          {sessions.length>0 ? (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[...sessions].reverse().slice(0,5).map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{
                    width:32,height:32,borderRadius:8,flexShrink:0,
                    background: s.productivity>=8?"rgba(124,111,247,0.2)":s.productivity>=5?"rgba(251,191,36,0.15)":"rgba(79,159,255,0.1)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"JetBrains Mono",fontSize:"0.82rem",fontWeight:700,
                    color:s.productivity>=8?"var(--purple-l)":s.productivity>=5?"var(--amber)":"var(--blue)",
                  }}>
                    {s.productivity}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"0.78rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text)"}}>
                      {s.taskName}
                    </div>
                    <div style={{fontSize:"0.68rem",color:"var(--hint)"}}>
                      {s.hour}:00 · {s.duration}h · {s.complexity}
                    </div>
                  </div>
                  {s.autoLogged && <span style={{fontSize:"0.6rem",background:"rgba(124,111,247,0.12)",color:"var(--purple-l)",padding:"1px 5px",borderRadius:4}}>auto</span>}
                </div>
              ))}
            </div>
          ):(
            <div style={{color:"var(--hint)",fontSize:"0.82rem",textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:"1.5rem",marginBottom:6}}>📝</div>
              Complete tasks in the Schedule tab to auto-log sessions
            </div>
          )}
        </div>
      </div>

      {/* Due this week + Syllabus Summaries — side by side */}
      <div style={{display:"flex",gap:16,alignItems:"stretch"}}>

        {/* Upcoming this week */}
        <div className="card" style={{flex:"1 1 0",minWidth:0,maxHeight:320,overflowY:"auto"}}>
          <div className="card-title">Due this week</div>
          <div className="card-sub">Next 7 days — sorted by urgency</div>
          {upcoming.length===0 ? (
            <div style={{color:"var(--hint)",fontSize:"0.85rem",textAlign:"center",padding:"20px 0"}}>
              Nothing due in the next 7 days.
            </div>
          ):(
            <div className="event-list">
              {upcoming.slice(0,8).map((ev,i)=>{
                const daysLeft = Math.ceil((new Date((ev.date||ev.dueDate)+"T00:00:00")-today)/86400000);
                return (
                  <div key={i} className={`event-item ${ev.priority}`}>
                    <span style={{fontSize:"1.1rem"}}>{typeEmoji(ev.type)}</span>
                    <div style={{flex:1}}>
                      <div className="event-title">{ev.title}</div>
                      <div className="event-meta">
                        {ev.course&&<span style={{marginRight:8}}>📚 {ev.course}</span>}
                        <span>📅 {ev.date||ev.dueDate}</span>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <span className={`badge badge-${ev.priority}`}>{ev.priority}</span>
                      <div style={{fontSize:"0.68rem",marginTop:3,color:daysLeft<=1?"var(--red)":daysLeft<=3?"var(--amber)":"var(--hint)"}}>
                        {daysLeft===0?"today":daysLeft===1?"tomorrow":`${daysLeft}d left`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {upcoming.length>8&&<button onClick={()=>onNavigate("calendar")} style={{fontSize:"0.78rem",color:"var(--accent)",textAlign:"center",padding:"8px 0",background:"none",border:"none",cursor:"pointer",width:"100%"}}>+{upcoming.length-8} more — view all</button>}
            </div>
          )}
        </div>

        {/* Syllabus Summaries */}
        {(() => {
          const syllabi = loadSyllabi();
          return (
            <div className="card" style={{flex:"1 1 0",minWidth:0,maxHeight:320,overflowY:"auto"}}>
              <div className="card-title">Syllabus Summaries</div>
              <div className="card-sub">{syllabi.length} course{syllabi.length !== 1 ? 's' : ''} uploaded</div>
              {syllabi.length === 0 ? (
                <p style={{color:"var(--hint)",fontSize:"0.82rem",margin:"8px 0 0"}}>No syllabi uploaded yet. Use the Syllabus tab to add one.</p>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:8}}>
                  {syllabi.map((s, idx) => (
                    <div key={idx} style={{background:"var(--bg2)",borderRadius:8,padding:"12px 14px"}}>
                      {/* Header row */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:"0.95rem"}}>{s.courseName || "Untitled Course"}</div>
                          <div style={{fontSize:"0.78rem",color:"var(--hint)",marginTop:2,display:"flex",gap:10,flexWrap:"wrap"}}>
                            {s.instructor && <span>👨‍🏫 {s.instructor}</span>}
                            <span>📌 {s.eventCount || 0} events</span>
                          </div>
                        </div>
                        <button onClick={() => { deleteSyllabus(s.courseCode); window.location.reload(); }} style={{background:"none",border:"none",color:"var(--hint)",cursor:"pointer",fontSize:"1rem",padding:"0 4px",flexShrink:0}}>🗑️</button>
                      </div>

                      {/* Key facts chips */}
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                        {s.grading && s.grading !== "Not provided" && (
                          <span style={{background:"rgba(99,102,241,0.15)",color:"var(--purple)",borderRadius:6,padding:"3px 8px",fontSize:"0.73rem",fontWeight:500}}>
                            🎯 {s.grading.length > 40 ? s.grading.substring(0,40)+"…" : s.grading}
                          </span>
                        )}
                        {s.requirements && s.requirements.slice(0,1).map((r, ri) => (
                          <span key={ri} style={{background:"rgba(45,212,191,0.12)",color:"#2dd4bf",borderRadius:6,padding:"3px 8px",fontSize:"0.73rem",fontWeight:500}}>
                            📖 {r.length > 35 ? r.substring(0,35)+"…" : r}
                          </span>
                        ))}
                        {s.policies && s.policies.slice(0,1).map((p, pi) => (
                          <span key={pi} style={{background:"rgba(251,191,36,0.12)",color:"var(--amber)",borderRadius:6,padding:"3px 8px",fontSize:"0.73rem",fontWeight:500}}>
                            📋 {p.length > 35 ? p.substring(0,35)+"…" : p}
                          </span>
                        ))}
                        {s.keyDates && s.keyDates.slice(0,1).map((d, di) => (
                          <span key={di} style={{background:"rgba(248,113,113,0.12)",color:"var(--red)",borderRadius:6,padding:"3px 8px",fontSize:"0.73rem",fontWeight:500}}>
                            🗓️ {d.length > 35 ? d.substring(0,35)+"…" : d}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* Quick actions */}
      <div className="card">
        <div className="card-title">Quick actions</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[
            {icon:"🎓",label:"Import Blackboard",tab:"blackboard"},
            {icon:"⚡",label:"Set energy pattern",tab:"energy"},
            {icon:"🧠",label:"Build AI schedule",tab:"schedule"},
            {icon:"🗓️",label:"Sync to Google Cal",tab:"calendar"},
            {icon:"🎤",label:"Voice update",tab:"voice"},
          ].map(a=>(
            <button key={a.tab} className="btn" onClick={()=>onNavigate(a.tab)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
