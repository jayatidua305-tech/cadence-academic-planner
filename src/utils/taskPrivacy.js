// Per-task public/private visibility. Keyed by a stable task id.
// "private" = hours spent are hidden from leaderboard / companion stats.

const KEY = "smart_cal_task_privacy_v1";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function save(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getPrivacy(taskId) {
  const map = load();
  // Default: public. Users opt events into private.
  return map[taskId] === "private" ? "private" : "public";
}

export function setPrivacy(taskId, value) {
  const map = load();
  if (value === "private") map[taskId] = "private";
  else delete map[taskId];
  save(map);
}

export function togglePrivacy(taskId) {
  const cur = getPrivacy(taskId);
  const next = cur === "private" ? "public" : "private";
  setPrivacy(taskId, next);
  return next;
}

// Convenience to derive a stable ID from a task-ish object
export function taskIdOf(task) {
  if (!task) return null;
  return (
    task.id ||
    task.uid ||
    `${task.title || task.taskTitle || "untitled"}::${task.dueDate || task.date || task.startTime || ""}`
  );
}
