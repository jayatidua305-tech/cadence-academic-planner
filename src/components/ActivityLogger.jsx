// src/components/ActivityLogger.jsx
// Logs actual work sessions so the AI can learn real productivity patterns

import React, { useState, useEffect } from "react";
import { Button, TextField, RatingScale, OptionGrid } from "./UILibrary";
import { logSession, loadSessions, analyzePattern, fmt } from "../utils/patternLearner";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const COMPLEXITY_OPTIONS = [
  { value: "high",   label: "🔴 Complex",  desc: "NLP assignment, coding, math, writing" },
  { value: "medium", label: "🟡 Medium",   desc: "Case studies, short assignments, quizzes" },
  { value: "low",    label: "🟢 Light",    desc: "Readings, lecture review, extra credit" },
];

const TASK_TYPES = [
  "Assignment", "Reading", "Quiz prep", "Exam prep",
  "Project work", "Coding", "Writing", "Research", "Other"
];

export default function ActivityLogger({ onPatternUpdated }) {
  const [sessions, setSessions]         = useState([]);
  const [pattern, setPattern]           = useState(null);
  const [activeTab, setActiveTab]       = useState("log"); // "log" or "history"
  const [saved, setSaved]               = useState(false);

  // Form state
  const [taskName, setTaskName]         = useState("");
  const [taskType, setTaskType]         = useState("Assignment");
  const [complexity, setComplexity]     = useState("medium");
  const [hour, setHour]                 = useState(new Date().getHours());
  const [duration, setDuration]         = useState(1);
  const [productivity, setProductivity] = useState(7);
  const [notes, setNotes]               = useState("");

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored);
    if (stored.length >= 3) {
      const p = analyzePattern(stored);
      setPattern(p);
      if (onPatternUpdated) onPatternUpdated(p);
    }
  }, []);

  const handleLog = () => {
    if (!taskName.trim()) return;

    const session = {
      taskName: taskName.trim(),
      taskType,
      complexity,
      hour,
      duration,
      productivity,
      notes,
      date: new Date().toISOString().split("T")[0],
    };

    const updated = logSession(session);
    setSessions(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Update pattern
    if (updated.length >= 3) {
      const p = analyzePattern(updated);
      setPattern(p);
      if (onPatternUpdated) onPatternUpdated(p);
    }

    // Reset form
    setTaskName("");
    setNotes("");
    setProductivity(7);
  };

  const clearAll = () => {
    localStorage.removeItem("smart_calendar_sessions");
    setSessions([]);
    setPattern(null);
    if (onPatternUpdated) onPatternUpdated(null);
  };

  // Build heatmap — productivity by hour and complexity
  const heatmapData = HOURS.map(h => {
    const vals = sessions.filter(s => s.hour === h).map(s => s.productivity);
    return {
      hour: h,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      count: vals.length,
    };
  });

  const maxAvg = Math.max(...heatmapData.filter(d => d.avg !== null).map(d => d.avg), 1);

  function heatColor(avg) {
    if (avg === null) return "#f1f5f9";
    const ratio = avg / 10;
    if (ratio >= 0.8) return "#f97316";
    if (ratio >= 0.6) return "#fbbf24";
    if (ratio >= 0.4) return "#6ee7b7";
    return "#bfdbfe";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab Navigation */}
      <div style={{
        display: "flex", gap: 8,
        background: "#f0ebfe",
        padding: "8px",
        borderRadius: "12px",
        border: "1px solid #e0d5f5",
      }}>
        {["log", "history", "insights"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              background: activeTab === tab 
                ? "var(--grad-purple)" 
                : "transparent",
              color: activeTab === tab ? "white" : "var(--text-muted)",
              transition: "all 0.2s",
            }}>
            {tab === "log" && "📝 Log Session"}
            {tab === "history" && `📜 History (${sessions.length})`}
            {tab === "insights" && "🧠 AI Insights"}
          </button>
        ))}
      </div>

      {/* LOG TAB */}
      {activeTab === "log" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}>
          {/* Left column: Task info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>What & When</div>
            
            <TextField 
              label="Task"
              placeholder="e.g. NLP Assignment 3..."
              value={taskName} 
              onChange={e => setTaskName(e.target.value)} 
              style={{ marginBottom: 10 }}
            />
            
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize:"0.78rem", color:"#64748b", display:"block", marginBottom:4 }}>Type</label>
              <select className="input" value={taskType} onChange={e => setTaskType(e.target.value)}
                style={{ background: "#ffffff", borderColor: "#e0dff0" }}>
                {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <OptionGrid 
              options={COMPLEXITY_OPTIONS}
              value={complexity}
              onChange={setComplexity}
              label="Complexity"
              style={{ marginBottom: 12 }}
            />

            <TextField 
              label="Notes"
              placeholder="e.g. Had coffee, perfect focus..."
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              type="textarea"
            />
          </div>

          {/* Right column: Time & Productivity */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>When & How</div>
            
            {/* Time */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize:"0.78rem", color:"#64748b", display:"block", marginBottom:6, fontWeight: 600 }}>
                Time: <span style={{ color: "var(--purple-l)" }}>{fmt(hour)}</span>
              </label>
              <input type="range" min={0} max={23} value={hour}
                onChange={e => setHour(parseInt(e.target.value))}
                style={{ width:"100%", accentColor: "var(--purple-l)" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.65rem", color:"#94a3b8", marginTop: 4 }}>
                <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
              </div>
            </div>

            {/* Duration */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize:"0.78rem", color:"#64748b", display:"block", marginBottom:6, fontWeight: 600 }}>
                Duration: <span style={{ color: "var(--blue-l)" }}>{duration}h</span>
              </label>
              <input type="range" min={0.5} max={6} step={0.5} value={duration}
                onChange={e => setDuration(parseFloat(e.target.value))}
                style={{ width:"100%", accentColor: "var(--blue-l)" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.65rem", color:"#94a3b8", marginTop: 4 }}>
                <span>30m</span><span>2h</span><span>4h</span><span>6h</span>
              </div>
            </div>

            {/* Productivity */}
            <div>
              <RatingScale 
                value={productivity}
                onChange={setProductivity}
                label="Productivity"
                labels={["😴", "😐", "😊", "🔥"]}
              />
            </div>

            <Button 
              variant="primary"
              onClick={handleLog} 
              disabled={!taskName.trim()}
              style={{ width: "100%", marginTop: 14 }}>
              {saved ? "✅ Logged!" : "📝 Log Session"}
            </Button>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div className="card">
          {sessions.length > 0 ? (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div className="card-title" style={{ marginBottom:0 }}>
                  {sessions.length} Session{sessions.length!==1?"s":""} Logged
                </div>
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={clearAll}>
                  Clear
                </Button>
              </div>

              {/* Heatmap */}
              {sessions.length > 0 && (
                <>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 8, fontWeight: 600 }}>
                    📊 Productivity by Hour
                  </div>
                  <div style={{ display:"flex", gap:2, marginBottom:16, alignItems:"flex-end", padding: "12px", background: "#f0ebfe", borderRadius: 8 }}>
                    {heatmapData.map(d => (
                      <div key={d.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                        <div title={d.avg ? `${d.avg.toFixed(1)}/10` : "No data"}
                          style={{
                            width:"100%", height: d.avg ? Math.max(12, d.avg * 5) : 4,
                            background: heatColor(d.avg),
                            borderRadius:2,
                          }}/>
                        {d.hour % 6 === 0 && (
                          <div style={{ fontSize:"0.55rem", color:"#94a3b8", marginTop: 2 }}>{fmt(d.hour)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Session List */}
              <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 8, fontWeight: 600 }}>
                📜 Recent Sessions
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:400, overflowY:"auto" }}>
                {[...sessions].reverse().map((s, i) => (
                  <div key={i} style={{
                    display:"flex", gap:10, alignItems:"center",
                    padding:"10px 12px", background:"#f8f9fc",
                    borderRadius:8, border:"1px solid #e8e6f0", fontSize:"0.8rem",
                  }}>
                    <div style={{
                      width:40, height:40, borderRadius:8, flexShrink:0,
                      background: s.productivity>=8?"rgba(249,115,22,0.2)":s.productivity>=5?"rgba(251,191,36,0.2)":"rgba(59,130,246,0.2)",
                      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontWeight: 700,
                      color: s.productivity>=8?"#f97316":s.productivity>=5?"#ca8a04":"#3b82f6",
                    }}>
                      {s.productivity}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: "var(--text)" }}>
                        {s.taskName}
                      </div>
                      <div style={{ fontSize:"0.7rem", color:"#94a3b8", marginTop: 2 }}>
                        {fmt(s.hour)} · {s.duration}h · {s.date}
                      </div>
                    </div>
                    <span style={{
                      fontSize:"0.65rem", fontWeight:700, padding:"4px 8px", borderRadius:20,
                      background: s.complexity==="high"?"#ec4899":s.complexity==="medium"?"#f59e0b":"#10b981",
                      color: "white",
                    }}>
                      {s.complexity}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"2rem", color: "#94a3b8" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>📝</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>No sessions yet</div>
              <div style={{ fontSize:"0.82rem" }}>Log your first session to see history</div>
            </div>
          )}
        </div>
      )}

      {/* INSIGHTS TAB */}
      {activeTab === "insights" && (
        <>
          {pattern ? (
            <>
              {/* Heatmap */}
              {sessions.length > 0 && (
                <div className="card">
                  <div className="card-title">🔥 Peak Productivity Hours</div>
                  <div style={{ display:"flex", gap:2, alignItems:"flex-end", padding: "16px", background: "#f0ebfe", borderRadius: 8 }}>
                    {heatmapData.map(d => (
                      <div key={d.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        <div title={d.avg ? `${d.avg.toFixed(1)}/10 (${d.count})` : "No data"}
                          style={{
                            width:"100%", height: d.avg ? Math.max(20, d.avg * 8) : 6,
                            background: heatColor(d.avg),
                            borderRadius:3, transition:"height 0.3s",
                          }}/>
                        {d.hour % 6 === 0 && (
                          <div style={{ fontSize:"0.6rem", color:"#94a3b8" }}>{fmt(d.hour)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pattern Analysis */}
              <div className="card" style={{ background:"#f0ebfe", borderColor:"#e0d5f5" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:"1.4rem" }}>🧠</span>
                  <div>
                    <div style={{ fontWeight:700, color: "var(--text)", fontSize: "0.95rem" }}>{pattern.archetype}</div>
                    <div style={{ fontSize:"0.7rem", color:"#94a3b8" }}>Based on {pattern.totalSessions} sessions</div>
                  </div>
                </div>

                {/* Best hours grid */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
                  {[
                    { key:"high",   label:"🔴 Complex", desc:"NLP, coding, math" },
                    { key:"medium", label:"🟡 Medium",  desc:"Assignments" },
                    { key:"low",    label:"🟢 Light",   desc:"Readings" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} style={{ background:"#f8f9fc", borderRadius:8, padding:"10px 12px", border:"1px solid #e8e6f0" }}>
                      <div style={{ fontSize:"0.75rem", fontWeight:700, color:"var(--text)", marginBottom:2 }}>{label}</div>
                      <div style={{ fontSize:"0.65rem", color:"#94a3b8", marginBottom:6 }}>{desc}</div>
                      {pattern.bestHours[key]?.length > 0 ? (
                        <div style={{ fontFamily:"monospace", fontSize:"0.8rem", fontWeight:700, color:"var(--purple-l)" }}>
                          {pattern.bestHours[key].slice(0,2).map(h => fmt(h)).join(", ")}
                        </div>
                      ) : (
                        <div style={{ fontSize:"0.7rem", color:"#94a3b8" }}>Need more data</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Insights */}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {pattern.insights.map((insight, i) => (
                    <div key={i} style={{ display:"flex", gap:8, fontSize:"0.82rem", color:"var(--text)" }}>
                      <span style={{ flexShrink: 0 }}>💡</span>
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign:"center", padding:"2rem", color: "#94a3b8" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>📊</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>Log 5+ sessions first</div>
              <div style={{ fontSize:"0.82rem" }}>AI insights unlock after you log enough data</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
