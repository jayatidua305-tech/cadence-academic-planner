// src/components/WeeklySummary.jsx
import React, { useState } from "react";
import { Button } from "./UILibrary";
import { generateWeeklyDigest } from "../api/gemini";

export default function WeeklySummary({ events, energyPattern }) {
  const [status, setStatus]   = useState("idle");
  const [digest, setDigest]   = useState(null);
  const [error, setError]     = useState(null);

  const getWeekEvents = () => {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    return events.filter(e => {
      const d = new Date((e.date || e.dueDate) + "T00:00:00");
      return d >= today && d <= weekEnd;
    });
  };

  const handleGenerate = async () => {
    setStatus("generating");
    setError(null);
    try {
      const weekEvents = getWeekEvents();
      const result = await generateWeeklyDigest(weekEvents, energyPattern || {});
      setDigest(result);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  const weekEvents = getWeekEvents();

  return (
    <div>
      <div className="card">
        <div className="card-title">📊 Weekly Digest</div>
        <div style={{ marginBottom: 8 }}><span className="ai-badge">AI-generated</span></div>
        <div className="card-sub">
          Claude analyzes your upcoming week and writes a personalized briefing — what to prioritize, when to work, and how to stay ahead.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 20, padding: "6px 14px", fontSize: "0.78rem", color: "#166534" }}>
            {weekEvents.length} events this week
          </div>
          {energyPattern && (
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "6px 14px", fontSize: "0.78rem", color: "#9a3412" }}>
              {energyPattern.archetype} · Peak {energyPattern.peakHours}
            </div>
          )}
        </div>

        <Button variant="primary" onClick={handleGenerate} disabled={status === "generating"} style={{fontSize:"0.95rem",padding:"11px 24px"}}>
          {status === "generating" ? <><span className="spinner"/> Claude is writing your digest...</> : "✨ Generate this week's digest"}
        </Button>

        {error && (
          <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: "0.82rem" }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {status === "done" && digest && (
        <>
          {/* Hero */}
          <div className="digest-hero">
            <div className="digest-greeting">👋 {digest.greeting}</div>
            <div className="digest-summary" style={{ marginTop: 8 }}>{digest.weekSummary}</div>
            <div style={{ marginTop: 16, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: "0.72rem", opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Top priority this week</div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>⭐ {digest.topPriority}</div>
            </div>
          </div>

          {/* Day by day */}
          <div className="card">
            <div className="card-title">📅 Day-by-day plan</div>
            {digest.dayByDay?.map((day, i) => (
              <div key={i} className="day-card">
                <div className="day-name">{day.day}</div>
                <div className="day-focus">{day.focus}</div>
                <div className="day-tip">💡 {day.tip}</div>
              </div>
            ))}
          </div>

          {/* Energy tip + close */}
          <div className="card" style={{ background: "#f5f3ff", borderColor: "#c4b5fd" }}>
            <div className="card-title" style={{ color: "#5b21b6" }}>⚡ Energy tip</div>
            <p style={{ fontSize: "0.85rem", color: "#4c1d95", lineHeight: 1.7 }}>{digest.energyTip}</p>
          </div>

          <div className="card" style={{ background: "#f0fdf4", borderColor: "#86efac", textAlign: "center" }}>
            <p style={{ fontSize: "0.9rem", color: "#166534", fontWeight: 500 }}>{digest.motivationalClose}</p>
          </div>
        </>
      )}

      {/* Upcoming list */}
      {weekEvents.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ fontSize: "0.9rem" }}>This week at a glance</div>
          {weekEvents.sort((a,b)=>(a.date||a.dueDate).localeCompare(b.date||b.dueDate)).map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid #f1f5f9", alignItems: "flex-start" }}>
              <div style={{ minWidth: 70, fontSize: "0.72rem", color: "#94a3b8", fontFamily: "monospace", paddingTop: 2 }}>{ev.date || ev.dueDate}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{ev.title}</div>
                {ev.course && <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{ev.course}</div>}
              </div>
              <span className={`badge badge-${ev.priority}`}>{ev.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
