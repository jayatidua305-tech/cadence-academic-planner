// src/components/TaskDetailModal.jsx
// Click a task → focus session + privacy toggle + recent sessions for this task.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { logSession, loadSessions } from "../utils/patternLearner";
import { getPrivacy, setPrivacy as setPrivacyKV, taskIdOf } from "../utils/taskPrivacy";
import { getRelatedEvents, eventRole } from "../utils/eventLinks";

// ── Session state machine ────────────────────────────────────────────────────
function useFocusTimer() {
  const [state, setState]   = useState("idle");   // idle | running | paused | stopped
  const [startMs, setStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);      // seconds (closed intervals)
  const [tick, setTick]     = useState(0);        // rerender pulse while running
  const intervalsRef        = useRef([]);         // [{start:ms, end:ms|null}]
  const rafRef              = useRef(null);

  useEffect(() => {
    if (state !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    rafRef.current = id;
    return () => clearInterval(id);
  }, [state]);

  const closedSeconds = () =>
    intervalsRef.current.reduce((sum, iv) => iv.end ? sum + (iv.end - iv.start) / 1000 : sum, 0);

  const liveSeconds = () => {
    const last = intervalsRef.current[intervalsRef.current.length - 1];
    if (state === "running" && last && last.end == null) {
      return closedSeconds() + (Date.now() - last.start) / 1000;
    }
    return closedSeconds();
  };

  const start = () => {
    const now = Date.now();
    intervalsRef.current = [{ start: now, end: null }];
    setStart(now);
    setState("running");
    setElapsed(0);
  };
  const pause = () => {
    const now = Date.now();
    const last = intervalsRef.current[intervalsRef.current.length - 1];
    if (last && last.end == null) last.end = now;
    setState("paused");
  };
  const resume = () => {
    intervalsRef.current.push({ start: Date.now(), end: null });
    setState("running");
  };
  const stop = () => {
    const now = Date.now();
    const last = intervalsRef.current[intervalsRef.current.length - 1];
    if (last && last.end == null) last.end = now;
    const secs = closedSeconds();
    setElapsed(secs);
    setState("stopped");
    return {
      startMs,
      endMs: now,
      durationSeconds: Math.round(secs),
      intervals: intervalsRef.current.slice(),
    };
  };
  const reset = () => {
    intervalsRef.current = [];
    setStart(null);
    setElapsed(0);
    setState("idle");
  };

  return { state, tick, start, pause, resume, stop, reset, liveSeconds };
}

function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TaskDetailModal({ task, open, onClose, allEvents = [], onOpenRelated }) {
  const timer = useFocusTimer();
  const taskId = useMemo(() => taskIdOf(task), [task]);
  const [privacy, setPrivacy] = useState(() => (taskId ? getPrivacy(taskId) : "public"));
  const [sessions, setSessions] = useState([]);

  // Events that share the same parent task but are scheduled at a different
  // slot (the deadline itself, or AI-generated study blocks working toward it).
  // Clicking one swaps the currently-open modal via `onOpenRelated`.
  const related = useMemo(
    () => (task ? getRelatedEvents(task, allEvents) : []),
    [task, allEvents]
  );

  // Load sessions for this task whenever it opens.
  useEffect(() => {
    if (!open || !taskId) return;
    const all = loadSessions();
    setSessions(all.filter((s) => s.taskId === taskId).reverse().slice(0, 10));
    timer.reset();
    setPrivacy(getPrivacy(taskId));
  }, [open, taskId]); // eslint-disable-line

  if (!open || !task) return null;

  const title = task.title || task.taskTitle || "Untitled task";
  const due = task.dueDate || task.date || null;
  const estHours = task.estimatedHours || task.estHours || null;
  const complexity = task.complexity || task.type || "medium";
  const isPrivate = privacy === "private";

  const togglePrivacyClick = () => {
    const next = isPrivate ? "public" : "private";
    setPrivacy(next);
    if (taskId) setPrivacyKV(taskId, next);
  };

  const onStop = () => {
    const result = timer.stop();
    if (result && result.durationSeconds > 0 && taskId) {
      const startDate = new Date(result.startMs || Date.now());
      logSession({
        taskId,
        taskTitle: title,
        hour: startDate.getHours(),
        complexity,
        productivity: null, // left unset — user can rate later on the EoD popup
        startMs: result.startMs,
        endMs: result.endMs,
        durationSeconds: result.durationSeconds,
        privacy, // snapshot at time of logging
      });
      const all = loadSessions();
      setSessions(all.filter((s) => s.taskId === taskId).reverse().slice(0, 10));
    }
  };

  const live = timer.liveSeconds();
  const stateLabel =
    timer.state === "running" ? "Running" :
    timer.state === "paused"  ? "Paused"  :
    timer.state === "stopped" ? "Saved"   : "Idle";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(26, 10, 0, 0.28)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "fade-in 160ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 560, width: "100%", padding: 24, maxHeight: "88vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sec-label" style={{ marginBottom: 4 }}>Task</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {title}
            </h3>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {due && <span>Due {due}</span>}
              {estHours != null && <span>· ~{estHours}h estimated</span>}
              <span>· {complexity} complexity</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Timer */}
        <div style={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
            <div>
              <div className="sec-label" style={{ marginBottom: 4 }}>Focus session</div>
              <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 36, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {fmtHMS(live)}
              </div>
            </div>
            <StateChip state={timer.state} label={stateLabel} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {timer.state === "idle" && (
              <button type="button" className="btn btn-primary" onClick={timer.start}>▶ Start</button>
            )}
            {timer.state === "running" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={timer.pause}>❚❚ Pause</button>
                <button type="button" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={onStop}>■ Stop & save</button>
              </>
            )}
            {timer.state === "paused" && (
              <>
                <button type="button" className="btn btn-primary" onClick={timer.resume}>▶ Resume</button>
                <button type="button" className="btn btn-ghost" onClick={onStop}>■ Stop & save</button>
              </>
            )}
            {timer.state === "stopped" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={timer.reset}>Log another</button>
              </>
            )}
          </div>
        </div>

        {/* Privacy */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Leaderboard visibility</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {isPrivate
                ? "Private — hours on this task are hidden from friends."
                : "Public — hours on this task count toward your rank."}
            </div>
          </div>
          <button type="button" onClick={togglePrivacyClick} aria-pressed={isPrivate}
            style={{
              position: "relative", width: 44, height: 24, borderRadius: 999,
              border: "none", cursor: "pointer",
              background: isPrivate ? "var(--fordham-maroon)" : "var(--border2)",
              transition: "background .18s",
              flexShrink: 0,
            }}>
            <span style={{
              position: "absolute", top: 2, left: isPrivate ? 22 : 2,
              width: 20, height: 20, borderRadius: "50%",
              background: "#fff",
              transition: "left .18s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
            }} />
          </button>
        </div>

        {/* Related events — deadline ↔ study blocks linking */}
        {related.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="sec-label" style={{ marginBottom: 8 }}>
              {eventRole(task) === "deadline"
                ? `Working toward this · ${related.length} block${related.length !== 1 ? "s" : ""}`
                : eventRole(task) === "study"
                  ? "Works toward"
                  : `Related · ${related.length}`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {related.map((rb, i) => {
                const role = eventRole(rb);
                const when = `${(rb.date || rb.dueDate || "").slice(5)} ${rb.startTime || ""}`.trim();
                const isDeadline = role === "deadline";
                const isStudy    = role === "study";
                const pill = isDeadline
                  ? { label: "Deadline", bg: "rgba(144,0,40,0.12)",  fg: "#c41e3a", border: "rgba(144,0,40,0.3)" }
                  : isStudy
                    ? { label: "Study block", bg: "rgba(99,102,241,0.12)", fg: "#818cf8", border: "rgba(99,102,241,0.3)" }
                    : { label: "Related", bg: "rgba(255,255,255,0.06)", fg: "var(--muted)", border: "var(--border)" };
                const icon = isDeadline ? "🎓" : isStudy ? "🧠" : "🔗";
                return (
                  <div
                    key={i}
                    onClick={() => onOpenRelated && onOpenRelated(rb)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: onOpenRelated ? "pointer" : "default",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (onOpenRelated) e.currentTarget.style.borderColor = pill.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    <span style={{ fontSize: "1rem", flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 600, color: "var(--text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {rb.title || rb.taskTitle || "Untitled"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--hint)", marginTop: 1 }}>
                        {when || "No date"}
                        {rb.endTime && ` – ${rb.endTime}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                      background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}`,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {pill.label}
                    </span>
                    {onOpenRelated && (
                      <span style={{ fontSize: 14, color: "var(--hint)", flexShrink: 0 }}>→</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent sessions for this task */}
        <div>
          <div className="sec-label" style={{ marginBottom: 8 }}>Sessions on this task</div>
          {sessions.length === 0 ? (
            <div style={{ padding: "14px 16px", background: "var(--bg-deep)", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              No sessions yet. Hit Start to log your first one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sessions.map((s) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", fontSize: 12.5,
                }}>
                  <div>
                    <div style={{ color: "var(--text)", fontWeight: 500 }}>
                      {s.startMs ? new Date(s.startMs).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "(unknown time)"}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                      {s.privacy === "private" ? "Private" : "Public"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontWeight: 700, color: "var(--text)" }}>
                    {fmtDuration(s.durationSeconds ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StateChip({ state, label }) {
  const palette = {
    idle:    { bg: "var(--bg-deep)",        color: "var(--muted)",   dot: "#a0a0a0", pulse: false },
    running: { bg: "rgba(4,120,87,0.1)",    color: "var(--green-d)", dot: "#16a34a", pulse: true  },
    paused:  { bg: "rgba(212,160,23,0.14)", color: "var(--fordham-gold-d)", dot: "#ca8a04", pulse: false },
    stopped: { bg: "rgba(4,120,87,0.08)",   color: "var(--green-d)", dot: "#047857", pulse: false },
  }[state] || {};
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: palette.bg, color: palette.color, whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: palette.dot,
        animation: palette.pulse ? "pulse-dot 1.3s ease-in-out infinite" : "none",
      }} />
      {label}
    </span>
  );
}
