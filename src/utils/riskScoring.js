// src/utils/riskScoring.js
// Deadline risk scoring + overload detection

import { loadSessions } from "./patternLearner";

// ── Check for overlapping time slots ───────────────────────────────────────
// Detects if two time slots overlap on the same day
export function hasOverlap(slot1, slot2) {
  // Check if slot1 and slot2 overlap in time
  if (slot1.date !== slot2.date) return false; // Different days
  if (!slot1.startTime || !slot1.endTime || !slot2.startTime || !slot2.endTime) {
    return false; // Missing time info
  }

  const [s1Start, s1StartM] = slot1.startTime.split(":").map(Number);
  const [s1End, s1EndM] = slot1.endTime.split(":").map(Number);
  const [s2Start, s2StartM] = slot2.startTime.split(":").map(Number);
  const [s2End, s2EndM] = slot2.endTime.split(":").map(Number);

  const s1StartMin = s1Start * 60 + (s1StartM || 0);
  const s1EndMin = s1End * 60 + (s1EndM || 0);
  const s2StartMin = s2Start * 60 + (s2StartM || 0);
  const s2EndMin = s2End * 60 + (s2EndM || 0);

  return s1StartMin < s2EndMin && s2StartMin < s1EndMin;
}

// Find all Google Calendar events that overlap with a scheduled slot
export function findOverlaps(scheduledSlot, googleCalendarEvents) {
  if (!googleCalendarEvents || googleCalendarEvents.length === 0) return [];
  return googleCalendarEvents.filter((gcalEvent) => hasOverlap(scheduledSlot, gcalEvent));
}

// ── Risk score per event ─────────────────────────────────────────────────────
// Score 0-100: higher = more at risk of missing deadline
export function computeRiskScore(event, completedKeys = new Set()) {
  const today = new Date();
  const due   = new Date((event.dueDate || event.date) + "T23:59:00");
  const daysLeft = Math.max(0, (due - today) / 86400000);
  const hours    = event.estimatedHours || 1;

  // Base risk from time pressure
  let risk = 0;

  // Days left factor (exponential urgency)
  if (daysLeft <= 1)       risk += 60;
  else if (daysLeft <= 2)  risk += 45;
  else if (daysLeft <= 3)  risk += 30;
  else if (daysLeft <= 7)  risk += 15;
  else                     risk += 5;

  // Hours factor — more work = more risk
  risk += Math.min(hours * 5, 25);

  // Historical completion rate for this task type
  const sessions   = loadSessions();
  const typeHistory = sessions.filter(s =>
    s.taskType === event.type || s.taskName?.toLowerCase().includes(event.type)
  );
  if (typeHistory.length >= 3) {
    const avgProd = typeHistory.reduce((s, x) => s + (x.productivity || 5), 0) / typeHistory.length;
    // Low historical productivity → higher risk
    if (avgProd < 5) risk += 15;
    else if (avgProd >= 8) risk -= 10;
  }

  // Priority override
  if (event.priority === "high")   risk += 10;
  if (event.priority === "low")    risk -= 10;

  return Math.min(100, Math.max(0, Math.round(risk)));
}

export function riskLabel(score) {
  if (score >= 70) return { label: "High Risk",   color: "var(--red)",   emoji: "🔴", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)" };
  if (score >= 40) return { label: "Medium Risk",  color: "var(--amber)", emoji: "🟡", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.25)" };
  return              { label: "On Track",         color: "var(--green)", emoji: "🟢", bg: "rgba(74,222,128,0.10)",  border: "rgba(74,222,128,0.25)" };
}

// ── Overload detection ────────────────────────────────────────────────────────
export function detectOverload(scheduleSlots, learnedPattern) {
  const avgCapacity = learnedPattern
    ? Math.min(learnedPattern.totalSessions > 5
        ? learnedPattern.insights?.find(i => i.includes("average"))?.match(/[\d.]+/)?.[0] * 1 || 4
        : 4, 10)
    : 4; // default 4h/day

  const byDay = {};
  for (const slot of (scheduleSlots || [])) {
    if (!slot.date) continue;
    if (!byDay[slot.date]) byDay[slot.date] = [];
    byDay[slot.date].push(slot);
  }

  const warnings = [];
  for (const [date, slots] of Object.entries(byDay)) {
    const totalHours = slots.reduce((sum, s) => {
      if (!s.startTime || !s.endTime) return sum + 1;
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      return sum + Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
    }, 0);

    if (totalHours > avgCapacity * 1.2) {
      const d = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" });
      warnings.push({
        date, label: d,
        totalHours: Math.round(totalHours * 10) / 10,
        capacity: avgCapacity,
        slots: slots.length,
        likelyComplete: Math.floor(avgCapacity / (totalHours / slots.length)),
      });
    }
  }
  return warnings;
}

// ── Recovery buffer suggestion ────────────────────────────────────────────────
export function addRecoveryBuffers(slots) {
  if (!slots?.length) return slots;
  const result = [];
  const sorted = [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || "").localeCompare(b.startTime || "");
  });

  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (!next || next.date !== curr.date) continue;
    if (curr.complexity === "high" && next.complexity === "high") {
      // Insert 15-min buffer
      const [eh, em] = (curr.endTime || "12:00").split(":").map(Number);
      const bufEnd   = `${String(eh).padStart(2,"0")}:${String(em + 15).padStart(2,"0")}`;
      result.push({
        taskTitle:   "🧘 Recovery break",
        date:        curr.date,
        startTime:   curr.endTime,
        endTime:     bufEnd,
        energyMatch: "low",
        complexity:  "low",
        isBuffer:    true,
        rationale:   "Auto-added recovery break between two high-complexity tasks",
      });
    }
  }
  return result;
}

// ── Best days analysis ────────────────────────────────────────────────────────
export function analyzeBestDays(sessions) {
  const byDay = { 0:"Sun",1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat" };
  const dayStats = {};

  for (const s of sessions) {
    if (!s.date) continue;
    const dow = new Date(s.date + "T00:00:00").getDay();
    if (!dayStats[dow]) dayStats[dow] = [];
    dayStats[dow].push(s.productivity || 5);
  }

  return Object.entries(dayStats).map(([dow, prods]) => ({
    day: byDay[dow],
    dow: parseInt(dow),
    avg: prods.reduce((a, b) => a + b, 0) / prods.length,
    count: prods.length,
  })).sort((a, b) => b.avg - a.avg);
}

// ── Semester analytics ────────────────────────────────────────────────────────
export function computeSemesterStats(sessions, completedKeys, totalSlots) {
  const totalSessions  = sessions.length;
  const completedCount = completedKeys.size;
  const completionRate = totalSlots > 0 ? Math.round(completedCount / totalSlots * 100) : 0;

  // Task type breakdown
  const byType = {};
  for (const s of sessions) {
    const t = s.taskType || "Other";
    if (!byType[t]) byType[t] = { count:0, totalProd:0, totalDuration:0 };
    byType[t].count++;
    byType[t].totalProd    += s.productivity || 5;
    byType[t].totalDuration += s.duration || 1;
  }
  const typeStats = Object.entries(byType).map(([type, d]) => ({
    type, count: d.count,
    avgProd:     Math.round(d.totalProd / d.count * 10) / 10,
    avgDuration: Math.round(d.totalDuration / d.count * 10) / 10,
  })).sort((a, b) => b.avgDuration - a.avgDuration);

  const avgProductivity = totalSessions > 0
    ? Math.round(sessions.reduce((s, x) => s + (x.productivity || 5), 0) / totalSessions * 10) / 10
    : 0;

  const bestDays = analyzeBestDays(sessions);

  return { totalSessions, completedCount, completionRate, typeStats, avgProductivity, bestDays };
}
