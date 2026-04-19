// src/utils/scheduleFeedback.js
// Persists schedule across sessions and collects slot-level feedback

const SCHEDULE_KEY  = "smart_cal_schedule";
const FEEDBACK_KEY  = "smart_cal_feedback";

// ── Schedule persistence ──────────────────────────────────────────────────────
export function saveSchedule(schedule) {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify({
      ...schedule,
      savedAt: new Date().toISOString(),
    }));
  } catch {}
}

export function loadSchedule() {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "null");
  } catch { return null; }
}

export function clearSchedule() {
  localStorage.removeItem(SCHEDULE_KEY);
}

// ── Feedback storage ──────────────────────────────────────────────────────────
export function saveFeedback(feedbackList) {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbackList));
  } catch {}
}

export function loadFeedback() {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
  } catch { return []; }
}

export function addFeedback(entry) {
  const existing = loadFeedback();
  // Keep last 50 feedback entries
  const updated = [...existing, { ...entry, at: new Date().toISOString() }].slice(-50);
  saveFeedback(updated);
  return updated;
}

export function clearFeedback() {
  localStorage.removeItem(FEEDBACK_KEY);
}

// ── Summarize feedback for AI prompt ─────────────────────────────────────────
export function summarizeFeedback(feedbackList) {
  if (!feedbackList || feedbackList.length === 0) return null;

  const rejected  = feedbackList.filter(f => f.type === "reject");
  const moved     = feedbackList.filter(f => f.type === "move");
  const accepted  = feedbackList.filter(f => f.type === "accept");

  const lines = [];

  if (rejected.length > 0) {
    lines.push("User has rejected these scheduling patterns:");
    rejected.forEach(f => {
      lines.push(`- "${f.taskTitle}" at ${f.originalTime} was rejected: ${f.reason}`);
    });
  }

  if (moved.length > 0) {
    lines.push("User has manually moved these slots:");
    moved.forEach(f => {
      lines.push(`- "${f.taskTitle}" moved from ${f.originalTime} to ${f.newTime}: ${f.reason || "no reason given"}`);
    });
  }

  if (accepted.length > 0) {
    // Find patterns in accepted slots
    const peakAccepted = accepted.filter(f => f.energyMatch === "peak");
    if (peakAccepted.length > 0) {
      const hours = peakAccepted.map(f => f.startTime?.split(":")?.[0]).filter(Boolean);
      if (hours.length > 0) {
        lines.push(`User consistently accepts peak slots around: ${[...new Set(hours)].map(h => `${h}:00`).join(", ")}`);
      }
    }
  }

  // Common rejection reasons
  const reasons = rejected.map(f => f.reason).filter(Boolean);
  if (reasons.length > 0) {
    lines.push(`Common feedback themes: ${reasons.slice(0, 5).join("; ")}`);
  }

  return lines.join("\n");
}
