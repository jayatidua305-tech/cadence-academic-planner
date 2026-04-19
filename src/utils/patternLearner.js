// src/utils/patternLearner.js
// Learns from actual work sessions and builds a personal productivity model

// ── Storage helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = "smart_calendar_sessions";

export function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function logSession(session) {
  const sessions = loadSessions();
  sessions.push({
    ...session,
    id: Date.now(),
    loggedAt: new Date().toISOString(),
  });
  saveSessions(sessions);
  return sessions;
}

// ── Pattern analysis ──────────────────────────────────────────────────────────
// Analyzes logged sessions → builds hourly productivity model per task complexity

export function analyzePattern(sessions) {
  if (!sessions || sessions.length === 0) return null;

  // Group sessions by hour and task complexity
  const byHour = {};
  const byComplexity = { high: {}, medium: {}, low: {} };

  // Normalize any unexpected complexity labels (e.g. "quiz", "assignment"
  // stamped by logSession's older call sites) to one of the three buckets
  // we actually track. Prevents "Cannot read properties of undefined".
  const normalizeComplexity = (c) => {
    const v = String(c || "").toLowerCase();
    if (v === "high" || v === "medium" || v === "low") return v;
    if (v === "exam" || v === "project" || v === "nlp" || v === "coding") return "high";
    if (v === "reading" || v === "review")  return "low";
    return "medium";
  };

  for (const s of sessions) {
    const hour = s.hour; // 0-23
    if (hour == null || hour < 0 || hour > 23) continue; // defensive: skip malformed
    const complexity   = normalizeComplexity(s.complexity);
    const productivity = s.productivity || 5; // 1-10

    // Overall hourly average
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(productivity);

    // Complexity-specific hourly average (bucket is guaranteed to exist now)
    if (!byComplexity[complexity][hour]) byComplexity[complexity][hour] = [];
    byComplexity[complexity][hour].push(productivity);
  }

  // Compute averages
  const hourlyAvg = {};
  for (let h = 0; h < 24; h++) {
    hourlyAvg[h] = byHour[h]
      ? byHour[h].reduce((a, b) => a + b, 0) / byHour[h].length
      : null;
  }

  const complexityHourlyAvg = {};
  for (const complexity of ["high", "medium", "low"]) {
    complexityHourlyAvg[complexity] = {};
    for (let h = 0; h < 24; h++) {
      const arr = byComplexity[complexity][h];
      complexityHourlyAvg[complexity][h] = arr
        ? arr.reduce((a, b) => a + b, 0) / arr.length
        : null;
    }
  }

  // Find best hours per complexity
  const bestHours = {};
  for (const complexity of ["high", "medium", "low"]) {
    const hours = Object.entries(complexityHourlyAvg[complexity])
      .filter(([, v]) => v !== null)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => parseInt(h));
    bestHours[complexity] = hours;
  }

  // Determine archetype
  const filledHours = Object.entries(hourlyAvg).filter(([, v]) => v !== null);
  const nightScore = filledHours.filter(([h]) => h >= 20 || h <= 4).reduce((s, [, v]) => s + v, 0);
  const mornScore  = filledHours.filter(([h]) => h >= 5 && h <= 11).reduce((s, [, v]) => s + v, 0);
  const aftScore   = filledHours.filter(([h]) => h >= 12 && h <= 18).reduce((s, [, v]) => s + v, 0);

  let archetype = "Flexible";
  if (nightScore > mornScore && nightScore > aftScore) archetype = "Night Owl";
  else if (mornScore > nightScore && mornScore > aftScore) archetype = "Morning Person";
  else if (aftScore > mornScore) archetype = "Afternoon Peak";

  // Build insights from actual data
  const insights = [];
  const totalSessions = sessions.length;

  if (bestHours.high.length > 0) {
    const h = bestHours.high[0];
    insights.push(`Your best hours for complex work (NLP, coding, problem sets) are around ${fmt(h)} — based on ${sessions.filter(s => s.complexity === "high").length} logged sessions`);
  }
  if (bestHours.low.length > 0) {
    const h = bestHours.low[0];
    insights.push(`Light tasks like readings are most comfortable around ${fmt(h)} for you`);
  }

  const avgProductivity = sessions.reduce((s, sess) => s + (sess.productivity || 5), 0) / sessions.length;
  insights.push(`Your average productivity score is ${avgProductivity.toFixed(1)}/10 across ${totalSessions} logged sessions`);

  return {
    hourlyAvg,
    complexityHourlyAvg,
    bestHours,
    archetype,
    insights,
    totalSessions,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Suggest best slot for a task ─────────────────────────────────────────────
export function suggestBestSlot(taskComplexity, learnedPattern, existingSchedule = []) {
  if (!learnedPattern) return null;

  const complexity = taskComplexity || "medium";
  const hourlyData = learnedPattern.complexityHourlyAvg[complexity];

  // Get hours with data, sorted by productivity
  const rankedHours = Object.entries(hourlyData)
    .filter(([, v]) => v !== null && v >= 4)
    .sort(([, a], [, b]) => b - a)
    .map(([h]) => parseInt(h));

  // Filter out hours already heavily booked
  const bookedHours = new Set(existingSchedule.map(e => {
    const h = e.startTime?.split(":")?.[0];
    return h ? parseInt(h) : null;
  }).filter(Boolean));

  const available = rankedHours.filter(h => !bookedHours.has(h));
  return available.length > 0 ? available[0] : rankedHours[0] || null;
}

function fmt(h) {
  if (h === 0) return "midnight";
  if (h < 12) return `${h}am`;
  if (h === 12) return "noon";
  return `${h - 12}pm`;
}

export { fmt };
