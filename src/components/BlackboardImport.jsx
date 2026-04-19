// src/components/BlackboardImport.jsx
import React, { useState } from "react";

const HOW_TO_STEPS = [
  { icon:"📅", text:'Go to Blackboard → click "Calendar" in the left sidebar' },
  { icon:"⚙️", text:"Click the gear icon (⚙️) at the top right of the Calendar page" },
  { icon:"🔗", text:'Find "iCal Feed" → copy the URL' },
  { icon:"📋", text:"Paste the URL below and click Connect — it saves automatically" },
];

export default function BlackboardImport({ bb, onEventsImported }) {
  const [inputUrl, setInputUrl] = useState(bb?.url || "");

  const handleConnect = async () => {
    if (!inputUrl.trim()) return;
    await bb.connect(inputUrl.trim());
  };

  const typeEmoji = (t) =>
    ({ exam:"📝", assignment:"📋", quiz:"✏️", project:"🏗️", reading:"📖" }[t] || "📌");

  const byCourse = (bb?.events || []).reduce((acc, e) => {
    const c = e.course || "Other";
    if (!acc[c]) acc[c] = [];
    acc[c].push(e);
    return acc;
  }, {});

  return (
    <div>
      {!bb?.isConnected && (
        <div className="card" style={{ background:"rgba(124,111,247,0.06)", borderColor:"rgba(124,111,247,0.2)" }}>
          <div className="card-title" style={{ color:"var(--purple-l)" }}>
            🎓 How to get your Blackboard iCal URL
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
            {HOW_TO_STEPS.map((step, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:"0.85rem" }}>
                <div style={{ background:"var(--purple)", color:"#fff", borderRadius:"50%", width:22, height:22,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.7rem",
                  fontWeight:600, flexShrink:0, marginTop:1 }}>{i+1}</div>
                <span style={{ color:"var(--muted)" }}>{step.icon} {step.text}</span>
              </div>
            ))}
          </div>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"10px 14px", fontSize:"0.78rem", color:"var(--muted)" }}>
            Your URL looks like:<br/>
            <code style={{ color:"var(--purple-l)", fontSize:"0.72rem" }}>
              https://fordham.blackboard.com/webapps/calendar/calendarFeed/xxxx/learn.ics
            </code>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">🔗 Blackboard Auto-Sync</div>
        <div className="card-sub">
          {bb?.isConnected
            ? "Auto-syncing every 30 minutes. Your Blackboard calendar stays up to date automatically."
            : "Connect once — the app auto-syncs your Blackboard calendar every time you open it."}
        </div>

        {bb?.isConnected ? (
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.25)",
              borderRadius:8, padding:"8px 14px", fontSize:"0.82rem", color:"var(--green)" }}>
              ✅ {bb.events.length} events · Last synced {bb.lastSyncLabel||"just now"}
            </div>
            <button className="btn" onClick={bb.refresh} disabled={bb.status==="syncing"} style={{ fontSize:"0.78rem" }}>
              {bb.status==="syncing" ? <><span className="spinner"/> Syncing...</> : "🔄 Refresh now"}
            </button>
            <button className="btn btn-ghost" onClick={bb.disconnect} style={{ fontSize:"0.72rem", color:"var(--red)" }}>
              Disconnect
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <input type="text" className="input"
              placeholder="https://fordham.blackboard.com/webapps/calendar/calendarFeed/.../learn.ics"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key==="Enter" && handleConnect()}
            />
            <button className="btn btn-primary" onClick={handleConnect}
              disabled={!inputUrl.trim() || bb?.status==="syncing"} style={{ whiteSpace:"nowrap" }}>
              {bb?.status==="syncing" ? <><span className="spinner"/> Connecting...</> : "🔗 Connect"}
            </button>
          </div>
        )}

        {bb?.error && (
          <div style={{ marginTop:12, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.25)",
            borderRadius:8, padding:"10px 14px", color:"var(--red)", fontSize:"0.82rem" }}>
            ⚠️ {bb.error}
          </div>
        )}
        <div style={{ marginTop:8, fontSize:"0.72rem", color:"var(--hint)" }}>
          🔒 Your URL is saved locally and never shared · Auto-refreshes every 30 minutes
        </div>
      </div>

      {bb?.events?.length > 0 && (
        <div className="card">
          <div className="card-title">✅ {bb.events.length} upcoming events from Blackboard</div>
          <div className="card-sub">Go to ⚡ Energy → 🧠 Schedule to build your AI-optimized calendar</div>

          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            {["exam","assignment","quiz","project","reading"].map(type => {
              const count = bb.events.filter(e=>e.type===type).length;
              if (!count) return null;
              return (
                <div key={type} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"8px 14px", textAlign:"center", minWidth:64 }}>
                  <div style={{ fontSize:"1.2rem" }}>{typeEmoji(type)}</div>
                  <div style={{ fontWeight:600, color:"var(--text)" }}>{count}</div>
                  <div style={{ fontSize:"0.7rem", color:"var(--hint)", textTransform:"capitalize" }}>{type}s</div>
                </div>
              );
            })}
          </div>

          {Object.entries(byCourse).map(([course, courseEvents]) => (
            <div key={course} style={{ marginBottom:20 }}>
              <div className="sec-label">{course} — {courseEvents.length} items</div>
              <div className="event-list">
                {courseEvents
                  .sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""))
                  .slice(0,8)
                  .map((event, i) => (
                    <div key={i} className={`event-item ${event.priority}`}>
                      <span style={{ fontSize:"1.1rem" }}>{typeEmoji(event.type)}</span>
                      <div style={{ flex:1 }}>
                        <div className="event-title">{event.title}</div>
                        <div className="event-meta">
                          <span style={{ marginRight:10 }}>📅 {event.dueDate}{event.dueTime?` at ${event.dueTime}`:""}</span>
                          <span>⏱ ~{event.estimatedHours}h</span>
                        </div>
                      </div>
                      <span className={`badge badge-${event.priority}`}>{event.priority}</span>
                    </div>
                  ))}
                {courseEvents.length > 8 && (
                  <div style={{ fontSize:"0.75rem", color:"var(--hint)", padding:"4px 0" }}>
                    +{courseEvents.length - 8} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
