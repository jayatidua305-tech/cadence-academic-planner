// src/utils/completionStore.js
// Persistent cross-day task completion tracking
// Stores: { "taskTitle_lowercase": { completedAt, date, productivity, key } }

const STORE_KEY = "smart_cal_completions";

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}

function save(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Mark a task as complete */
export function markDone(slotKey, taskTitle, productivity = null) {
  const store = load();
  const titleKey = (taskTitle || extractTitle(slotKey)).toLowerCase().trim();
  store[titleKey] = {
    slotKey,
    taskTitle,
    completedAt: new Date().toISOString(),
    date: new Date().toISOString().split("T")[0],
    productivity,
  };
  // Also keep legacy key for backward compat
  addLegacyKey(slotKey);
  save(store);
}

/** Unmark a task as complete */
export function markUndone(slotKey, taskTitle) {
  const store = load();
  const titleKey = (taskTitle || extractTitle(slotKey)).toLowerCase().trim();
  delete store[titleKey];
  removeLegacyKey(slotKey);
  save(store);
}

/** Check if a task title is completed */
export function isCompleted(taskTitle) {
  const store = load();
  return !!(store[(taskTitle || "").toLowerCase().trim()]);
}

/** Get all completed titles as a Set */
export function getCompletedTitles() {
  const store = load();
  return new Set(Object.keys(store));
}

/** Get all completed slot keys (for backward compat with today_done) */
export function getCompletedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"));
  } catch { return new Set(); }
}

/** Load as an object { slotKey: true } for SmartScheduler state */
export function loadCompletedMap() {
  // Merge legacy keys + new title-based store
  const legacyKeys = getCompletedKeys();
  const store = load();
  const map = {};
  legacyKeys.forEach(k => { map[k] = true; });
  // Also add title-keyed entries back as slot keys if available
  Object.values(store).forEach(entry => {
    if (entry.slotKey) map[entry.slotKey] = true;
  });
  return map;
}

/** Get completion stats */
export function getStats() {
  const store = load();
  const entries = Object.values(store);
  return {
    total: entries.length,
    today: entries.filter(e => e.date === new Date().toISOString().split("T")[0]).length,
    withRating: entries.filter(e => e.productivity !== null).length,
    avgProductivity: entries.filter(e => e.productivity).length > 0
      ? entries.filter(e => e.productivity).reduce((s, e) => s + e.productivity, 0) /
        entries.filter(e => e.productivity).length
      : null,
  };
}

/** Clear all completions */
export function clearAll() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem("smart_cal_today_done");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractTitle(slotKey) {
  // "YYYY-MM-DD-idx-taskTitle" → "taskTitle"
  return (slotKey || "").replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "");
}

function addLegacyKey(slotKey) {
  try {
    const keys = new Set(JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"));
    keys.add(slotKey);
    localStorage.setItem("smart_cal_today_done", JSON.stringify([...keys]));
  } catch {}
}

function removeLegacyKey(slotKey) {
  try {
    const keys = new Set(JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"));
    keys.delete(slotKey);
    localStorage.setItem("smart_cal_today_done", JSON.stringify([...keys]));
  } catch {}
}
