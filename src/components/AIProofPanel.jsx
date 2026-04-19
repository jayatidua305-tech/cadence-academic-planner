import React, { useEffect, useMemo, useState } from "react";
import { clearAIEvents, loadAIEvents, summarizeAIEvents } from "../utils/aiAudit";
import {
  clearAIPlanningRuns,
  getManualBaselineMinutes,
  loadAIPlanningRuns,
  setManualBaselineMinutes,
  summarizePlanningEfficiency,
} from "../utils/plannerMetrics";

function formatLatency(ms) {
  if (!Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AIProofPanel() {
  const [events, setEvents] = useState(loadAIEvents());
  const [planningRuns, setPlanningRuns] = useState(loadAIPlanningRuns());
  const [baselineInput, setBaselineInput] = useState(String(getManualBaselineMinutes()));

  useEffect(() => {
    const sync = () => {
      setEvents(loadAIEvents());
      setPlanningRuns(loadAIPlanningRuns());
      setBaselineInput(String(getManualBaselineMinutes()));
    };

    window.addEventListener("aiAuditUpdated", sync);
    window.addEventListener("plannerMetricsUpdated", sync);
    return () => {
      window.removeEventListener("aiAuditUpdated", sync);
      window.removeEventListener("plannerMetricsUpdated", sync);
    };
  }, []);

  const aiSummary = useMemo(() => summarizeAIEvents(events), [events]);
  const planningSummary = useMemo(
    () => summarizePlanningEfficiency(planningRuns, getManualBaselineMinutes()),
    [planningRuns, baselineInput]
  );

  return (
    <div>
      <div className="card">
        <div className="card-title">🤖 AI Proof Center</div>
        <div className="card-sub">
          Evidence this app uses AI: call audit logs, recommendation traces, and measurable planning-time savings.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <MetricCard label="AI Calls" value={aiSummary.total} sub={`${aiSummary.successRate}% success`} tone="purple" />
          <MetricCard label="Avg Latency" value={formatLatency(aiSummary.avgLatencyMs)} sub="Across all calls" tone="blue" />
          <MetricCard label="AI Features" value={aiSummary.uniqueFeatures} sub="Syllabus, chat, voice, scheduler" tone="green" />
          <MetricCard
            label="Est. Time Saved"
            value={`${planningSummary.totalEstimatedMinutesSaved}m`}
            sub={`${planningSummary.timeSavedPerPlan}m per plan`}
            tone="amber"
          />
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>⏱️ Manual vs AI Planning</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              Baseline is your typical manual planning time. AI runtime is measured from live scheduler builds.
            </div>
          </div>
          <button className="btn" style={{ fontSize: "0.74rem" }} onClick={clearAIPlanningRuns}>Clear run history</button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label htmlFor="manualBaseline" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Manual planning baseline (minutes)
          </label>
          <input
            id="manualBaseline"
            className="input"
            type="number"
            min={5}
            max={240}
            value={baselineInput}
            onChange={(e) => setBaselineInput(e.target.value)}
            style={{ width: 100 }}
          />
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.74rem" }}
            onClick={() => setManualBaselineMinutes(baselineInput)}
          >
            Save baseline
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <StatBlock label="Manual Baseline" value={`${planningSummary.baselineMinutes}m`} />
          <StatBlock label="Avg AI Build Time" value={`${planningSummary.avgAIMinutes}m`} />
          <StatBlock label="Avg Slots Per Plan" value={planningSummary.avgSlotsPerPlan} />
        </div>

        {planningRuns.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {planningRuns.slice(-5).reverse().map((run) => (
              <div key={run.id} style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: "0.76rem",
              }}>
                <span style={{ color: "var(--muted)" }}>{new Date(run.at).toLocaleString()}</span>
                <span style={{ color: "var(--text)" }}>{run.feature}</span>
                <span style={{ color: "var(--purple-l)", fontFamily: "JetBrains Mono" }}>{formatLatency(run.durationMs)}</span>
                <span style={{ color: "var(--hint)" }}>{run.outputCount ?? 0} slots</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📜 AI Audit Log</div>
          <button className="btn" style={{ fontSize: "0.74rem" }} onClick={clearAIEvents}>Clear logs</button>
        </div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Timestamped prompt/response summaries from live model calls.
        </div>

        {aiSummary.byFeature.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {aiSummary.byFeature.slice(0, 6).map((f) => (
              <span key={f.feature} style={{
                background: "rgba(124,111,247,0.12)",
                color: "var(--purple-l)",
                border: "1px solid rgba(124,111,247,0.24)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: "0.7rem",
                fontWeight: 600,
              }}>
                {f.feature} · {f.count}
              </span>
            ))}
          </div>
        )}

        {events.length === 0 ? (
          <div style={{ fontSize: "0.82rem", color: "var(--hint)" }}>
            No AI logs yet. Use Syllabus Parser, Smart Scheduler, Voice, or AI Chat to generate entries.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto", paddingRight: 4 }}>
            {events.slice().reverse().map((entry) => (
              <div key={entry.id} style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.03)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--blue-l)" }}>{entry.feature}</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--hint)", fontFamily: "JetBrains Mono" }}>{entry.provider}</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--hint)", fontFamily: "JetBrains Mono" }}>{entry.model}</span>
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                    {new Date(entry.at).toLocaleString()} · {formatLatency(entry.latencyMs)}
                  </div>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>
                  <strong style={{ color: "var(--text)" }}>Prompt:</strong> {entry.promptPreview || "-"}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Response:</strong> {entry.responsePreview || "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, tone }) {
  return (
    <div className={`kpi-card ${tone}`} style={{ padding: "14px 16px" }}>
      <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.3rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--hint)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function StatBlock({ label, value }) {
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid var(--border)",
      padding: "10px 12px",
      background: "rgba(255,255,255,0.03)",
    }}>
      <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--hint)", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: "1rem", fontFamily: "JetBrains Mono", fontWeight: 700, color: "var(--text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}
