const BASELINE_KEY = "smart_cal_manual_planning_minutes";
const RUNS_KEY = "smart_cal_ai_planning_runs_v1";
const MAX_RUNS = 200;

export function getManualBaselineMinutes() {
  const raw = Number(localStorage.getItem(BASELINE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return 45;
  return Math.round(raw);
}

export function setManualBaselineMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return getManualBaselineMinutes();
  const rounded = Math.round(parsed);
  localStorage.setItem(BASELINE_KEY, String(rounded));
  window.dispatchEvent(new CustomEvent("plannerMetricsUpdated"));
  return rounded;
}

export function loadAIPlanningRuns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAIPlanningRuns() {
  localStorage.removeItem(RUNS_KEY);
  window.dispatchEvent(new CustomEvent("plannerMetricsUpdated"));
}

export function recordAIPlanningRun(run) {
  const runs = loadAIPlanningRuns();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    feature: run.feature || "smart_schedule",
    durationMs: Number.isFinite(run.durationMs) ? run.durationMs : null,
    outputCount: Number.isFinite(run.outputCount) ? run.outputCount : null,
  };

  const updated = [...runs, entry].slice(-MAX_RUNS);
  localStorage.setItem(RUNS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("plannerMetricsUpdated"));
  return entry;
}

export function summarizePlanningEfficiency(runs = loadAIPlanningRuns(), baselineMinutes = getManualBaselineMinutes()) {
  if (!runs.length) {
    return {
      runs: 0,
      baselineMinutes,
      avgAIMinutes: 0,
      timeSavedPerPlan: 0,
      totalEstimatedMinutesSaved: 0,
      avgSlotsPerPlan: 0,
    };
  }

  const validDurations = runs
    .map((r) => r.durationMs)
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((ms) => ms / 60000);

  const avgAIMinutes = validDurations.length
    ? validDurations.reduce((sum, v) => sum + v, 0) / validDurations.length
    : 0;

  const validCounts = runs
    .map((r) => r.outputCount)
    .filter((v) => Number.isFinite(v) && v >= 0);

  const avgSlotsPerPlan = validCounts.length
    ? Math.round((validCounts.reduce((sum, v) => sum + v, 0) / validCounts.length) * 10) / 10
    : 0;

  const timeSavedPerPlan = Math.max(0, baselineMinutes - avgAIMinutes);

  return {
    runs: runs.length,
    baselineMinutes,
    avgAIMinutes: Math.round(avgAIMinutes * 10) / 10,
    timeSavedPerPlan: Math.round(timeSavedPerPlan * 10) / 10,
    totalEstimatedMinutesSaved: Math.round(timeSavedPerPlan * runs.length),
    avgSlotsPerPlan,
  };
}
