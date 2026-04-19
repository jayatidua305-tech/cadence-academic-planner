// src/utils/goalTracker.js

const GOALS_KEY = "smart_cal_goals";

export function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}
export function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY) || "[]"); } catch { return []; }
}

export function addGoal(goal) {
  const goals = loadGoals();
  const newGoal = {
    id: Date.now(),
    text: goal.text,
    type: goal.type || "completion", // completion | early | streak
    target: goal.target || 100,
    createdAt: new Date().toISOString(),
    deadline: goal.deadline || null,
  };
  goals.push(newGoal);
  saveGoals(goals);
  return goals;
}

export function deleteGoal(id) {
  const goals = loadGoals().filter(g => g.id !== id);
  saveGoals(goals);
  return goals;
}

export function computeGoalProgress(goal, stats) {
  if (goal.type === "completion") {
    return Math.min(100, stats.completionRate || 0);
  }
  if (goal.type === "streak") {
    return Math.min(100, (stats.currentStreak || 0) / (goal.target || 7) * 100);
  }
  return 0;
}
