// src/components/EodCheckin.jsx
// End-of-day sweep — shown automatically at 9pm or when user opens app after scheduled tasks

import React, { useState, useEffect } from "react";
import { addFeedback, loadFeedback } from "../utils/scheduleFeedback";
import { logSession, loadSessions, analyzePattern } from "../utils/patternLearner";

const CHECKIN_KEY = "smart_cal_last_checkin";

function getToday() { return new Date().toISOString().split("T")[0]; }

function shouldShowCheckin(todaySlots) {
  const lastCheckin = localStorage.getItem(CHECKIN_KEY);
  if (lastCheckin === getToday()) return false; // already done today
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  // Hard floor: never show before 6pm regardless of schedule state. An
  // "end of day check-in" at 2pm is not end of day.
  if (hour < 18) return false;
  // After 8pm, always show.
  if (hour >= 20) return true;
  // Between 6–8pm, only show if EVERY scheduled slot has already ended.
  if (!todaySlots.length) return false;
  const nowMin = hour * 60 + minute;
  return todaySlots.every(s => {
    const end = (s.endTime || s.startTime || "23:59").split(":").map(Number);
    const endMin = (end[0] || 0) * 60 + (end[1] || 0);
    return endMin <= nowMin;
  });
}

export default function EodCheckin({ todaySlots, completedKeys, onComplete, onDismiss }) {
  const [checked,   setChecked]   = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [visible,   setVisible]   = useState(false);

  useEffect(() => {
    if (shouldShowCheckin(todaySlots) && todaySlots.length > 0) {
      setVisible(true);
      // Pre-check already completed slots
      setChecked(new Set([...completedKeys].filter(k =>
        todaySlots.some((s, i) => `${s.date}-${i}-${s.taskTitle}` === k)
      )));
    }
  }, [todaySlots.length]);

  if (!visible || submitted) return null;

  const toggle = (key) => {
    setChecked(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const handleSubmit = () => {
    // Log each completed task as a session
    todaySlots.forEach((slot, i) => {
      const key = `${slot.date}-${i}-${slot.taskTitle}`;
      if (checked.has(key)) {
        logSession({
          taskName:   slot.taskTitle,
          taskType:   "Assignment",
          complexity: slot.complexity || "medium",
          hour:       parseInt((slot.startTime || "20").split(":")[0]),
          duration:   calcDuration(slot.startTime, slot.endTime),
          productivity: 7, // default — good
          date:       slot.date,
          autoLogged: true,
          notes:      "Logged via end-of-day check-in",
        });
        addFeedback({ type:"accept", taskTitle:slot.taskTitle,
          originalTime:`${slot.date} ${slot.startTime}`, energyMatch:slot.energyMatch });
      } else {
        addFeedback({ type:"reject", taskTitle:slot.taskTitle,
          originalTime:`${slot.date} ${slot.startTime}`, reason:"Not completed today" });
      }
    });

    localStorage.setItem(CHECKIN_KEY, getToday());
    setSubmitted(true);

    const updated = loadSessions();
    if (updated.length >= 3) {
      window.dispatchEvent(new CustomEvent("patternUpdated", { detail: analyzePattern(updated) }));
    }
    if (onComplete) onComplete(checked);
  };

  function calcDuration(start, end) {
    if (!start || !end) return 1;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return Math.max(0.5, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
  }

  const completedCount = checked.size;
  const totalCount     = todaySlots.length;

  return (
    <div style={{
      position:"fixed", bottom:24, right:24, zIndex:1000,
      width:380, background:"var(--surface)",
      border:"1px solid rgba(124,111,247,0.4)",
      borderRadius:16, padding:"20px 22px",
      boxShadow:"0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,111,247,0.15)",
      animation:"slideUp 0.3s ease",
    }}>
      <style>{`@keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:"0.95rem",color:"var(--text)",marginBottom:3}}>
            🌙 End of day check-in
          </div>
          <div style={{fontSize:"0.75rem",color:"var(--muted)"}}>
            Which tasks did you complete today?
          </div>
        </div>
        <button onClick={onDismiss} style={{background:"none",border:"none",color:"var(--hint)",
          cursor:"pointer",fontSize:"1rem",padding:0,lineHeight:1}}>✕</button>
      </div>

      {/* Progress bar */}
      <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:14,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:2,background:"var(--grad-purple)",
          width:`${totalCount>0?completedCount/totalCount*100:0}%`,transition:"width 0.3s ease"}}/>
      </div>

      {/* Task list */}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:240,overflowY:"auto"}}>
        {todaySlots.map((slot, i) => {
          const key       = `${slot.date}-${i}-${slot.taskTitle}`;
          const isChecked = checked.has(key);
          return (
            <div key={key} onClick={() => toggle(key)}
              style={{
                display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                borderRadius:10,cursor:"pointer",transition:"all 0.12s",
                background:isChecked?"rgba(74,222,128,0.1)":"rgba(255,255,255,0.03)",
                border:`1px solid ${isChecked?"rgba(74,222,128,0.3)":"var(--border)"}`,
              }}>
              <div style={{
                width:20,height:20,borderRadius:6,flexShrink:0,
                border:`2px solid ${isChecked?"var(--green)":"rgba(255,255,255,0.2)"}`,
                background:isChecked?"var(--green)":"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"0.7rem",color:"white",fontWeight:700,transition:"all 0.15s",
              }}>{isChecked&&"✓"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"0.82rem",fontWeight:500,color:"var(--text)",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                  textDecoration:isChecked?"line-through":"none",opacity:isChecked?0.7:1}}>
                  {slot.taskTitle}
                </div>
                <div style={{fontSize:"0.68rem",color:"var(--hint)"}}>
                  {slot.startTime}–{slot.endTime}
                </div>
              </div>
              <span style={{fontSize:"0.65rem",fontWeight:600,padding:"2px 7px",borderRadius:20,
                background:{peak:"rgba(124,111,247,0.2)",medium:"rgba(79,159,255,0.18)",low:"rgba(45,212,191,0.15)"}[slot.energyMatch]||"rgba(255,255,255,0.06)",
                color:{peak:"var(--purple-l)",medium:"var(--blue-l)",low:"var(--teal)"}[slot.energyMatch]||"var(--muted)"}}>
                {slot.energyMatch}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={handleSubmit} style={{
          flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
          background:"var(--grad-purple)",color:"white",fontWeight:700,fontSize:"0.85rem",
          boxShadow:"var(--glow-purple)",
        }}>
          ✅ Done — {completedCount}/{totalCount} completed
        </button>
      </div>
    </div>
  );
}
