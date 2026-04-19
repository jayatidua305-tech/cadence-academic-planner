const AUDIT_KEY = "smart_cal_ai_audit_v1";
const MAX_EVENTS = 250;

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, limit = 240) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function loadAIEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAIEvents() {
  localStorage.removeItem(AUDIT_KEY);
  window.dispatchEvent(new CustomEvent("aiAuditUpdated"));
}

export function recordAIEvent(event) {
  const events = loadAIEvents();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: nowIso(),
    provider: event.provider || "Groq",
    model: event.model || "llama-3.3-70b-versatile",
    feature: event.feature || "General",
    action: event.action || "ai_call",
    status: event.status || "success",
    latencyMs: Number.isFinite(event.latencyMs) ? event.latencyMs : null,
    promptPreview: safeText(event.promptPreview, 220),
    systemPreview: safeText(event.systemPreview, 180),
    responsePreview: safeText(event.responsePreview, 260),
    metadata: event.metadata || null,
  };

  const updated = [...events, entry].slice(-MAX_EVENTS);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("aiAuditUpdated"));
  return entry;
}

export function summarizeAIEvents(events = loadAIEvents()) {
  if (!events.length) {
    return {
      total: 0,
      successRate: 0,
      avgLatencyMs: 0,
      uniqueFeatures: 0,
      byFeature: [],
      byStatus: { success: 0, error: 0 },
    };
  }

  const total = events.length;
  const success = events.filter((e) => e.status !== "error").length;
  const latencies = events.map((e) => e.latencyMs).filter((v) => Number.isFinite(v) && v >= 0);
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
    : 0;

  const featureMap = new Map();
  events.forEach((e) => {
    featureMap.set(e.feature, (featureMap.get(e.feature) || 0) + 1);
  });

  const byFeature = [...featureMap.entries()]
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    successRate: Math.round((success / total) * 100),
    avgLatencyMs,
    uniqueFeatures: featureMap.size,
    byFeature,
    byStatus: {
      success,
      error: total - success,
    },
  };
}
