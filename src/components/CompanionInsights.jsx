import React, { useMemo, useState } from "react";
import { getStats } from "../utils/completionStore";
import {
  getCompanionSummary,
  loadCompanionState,
  setChallengeActive,
  setCurrentCircle,
} from "../utils/companionStore";

function shortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export default function CompanionInsights() {
  const [state, setState] = useState(loadCompanionState);
  const [summary, setSummary] = useState(() => getCompanionSummary({ state: loadCompanionState(), completed: getStats().total }));
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const refresh = () => {
    const s = loadCompanionState();
    setState(s);
    setSummary(getCompanionSummary({ state: s, completed: getStats().total }));
  };

  const standings = summary.leaderboard || [];

  const todayChallengeMet = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return summary.challengeDays.find((d) => d.date === today)?.met || false;
  }, [summary.challengeDays]);

  // Insights data
  const totalGroupMinutes = standings.reduce((s, m) => s + m.focusMinutes, 0);
  const avgMinutes = standings.length ? Math.round(totalGroupMinutes / standings.length) : 0;
  const leader = standings[0];
  const you = standings.find((m) => m.isYou);
  const yourRank = standings.findIndex((m) => m.isYou) + 1;
  const maxFocus = leader?.focusMinutes || 1;
  const minutesToFirst = you && yourRank > 1 ? leader.focusMinutes - you.focusMinutes : 0;

  let momentumText = "";
  if (totalGroupMinutes >= 1000) momentumText = "🔥 Your circle is crushing it this week!";
  else if (totalGroupMinutes >= 400) momentumText = "💪 Solid group effort — keep the momentum going.";
  else momentumText = "⚡ Time to get the circle fired up — log a group session!";

  let yourInsight = "";
  if (yourRank === 1) yourInsight = "👑 You're leading the circle this week. Keep it up!";
  else if (yourRank === 2) yourInsight = `🥈 You're in 2nd — ${minutesToFirst}m away from the top spot.`;
  else yourInsight = `You're ranked #${yourRank}. ${leader ? `${leader.name} leads with ${leader.focusMinutes}m — log a session to close the gap.` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div className="dash-header" style={{ marginBottom: 0 }}>
          <div className="dash-title">🏆 Leaderboard</div>
          <div className="dash-sub">
            {summary.currentCircle?.name} · {standings.length} members ·{" "}
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* Circle Dropdown */}
        {summary.currentCircle && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "5px 12px 5px 10px", borderRadius: 8,
                border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.10)",
                cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                color: "#c4b5fd", transition: "background 0.15s",
              }}
            >
              <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Circle</span>
              <span style={{ width: 1, height: 10, background: "rgba(167,139,250,0.4)", display: "inline-block", borderRadius: 2 }} />
              <span>🎯 {summary.currentCircle.name}</span>
              <span style={{ fontSize: "0.65rem", color: "#818cf8", background: "rgba(99,102,241,0.18)", borderRadius: 20, padding: "1px 7px" }}>
                {summary.currentCircle.members?.length ?? 0}
              </span>
              <span style={{ fontSize: "0.65rem", color: "var(--muted)", marginLeft: 2 }}>{dropdownOpen ? "▲" : "▼"}</span>
            </button>

            {dropdownOpen && (
              <div
                onMouseLeave={() => setDropdownOpen(false)}
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  zIndex: 999, background: "#f5f5f7",
                  border: "1px solid #d1d5db", borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  minWidth: 220, overflow: "hidden",
                }}
              >
                <div style={{ padding: "6px 12px 4px", fontSize: "0.65rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
                  Switch Circle
                </div>
                {(state.circles || []).map(c => {
                  const isActive = c.id === summary.currentCircle.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCurrentCircle(c.id);
                        refresh();
                        setDropdownOpen(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        width: "100%", padding: "9px 14px",
                        border: "none", borderBottom: "1px solid #e5e7eb",
                        background: isActive ? "#e0e7ff" : "#f5f5f7",
                        cursor: "pointer", textAlign: "left",
                        color: isActive ? "#4338ca" : "#111827",
                        fontWeight: isActive ? 700 : 400,
                        fontSize: "0.83rem", transition: "background 0.1s",
                      }}
                    >
                      <span style={{ flex: 1 }}>{isActive ? "✓ " : ""}{c.name}</span>
                      <span style={{ fontSize: "0.68rem", color: "#6b7280" }}>{c.members?.length ?? 0} members</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Row 1: Leaderboard + 7-Day Challenge ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Leaderboard */}
        <div className="card">
          <div className="card-title">🏆 Circle Leaderboard</div>
          <div className="card-sub">Ranked by focused minutes, then tasks, then streak.</div>

          <div style={{ display: "grid", gridTemplateColumns: "0.4fr 1.2fr 0.8fr 0.8fr 0.6fr", gap: 8, fontSize: "0.72rem", color: "var(--hint)", padding: "8px 8px 6px" }}>
            <div>#</div><div>Member</div><div>Focus</div><div>Tasks</div><div>Streak</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {standings.map((m, idx) => (
              <div key={m.id} style={{
                display: "grid",
                gridTemplateColumns: "0.4fr 1.2fr 0.8fr 0.8fr 0.6fr",
                gap: 8,
                alignItems: "center",
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: m.isYou ? "rgba(124,111,247,0.13)" : "rgba(255,255,255,0.03)",
              }}>
                <div style={{ fontWeight: 700, color: idx === 0 ? "var(--amber)" : "var(--muted)" }}>{idx + 1}</div>
                <div style={{ fontWeight: 600 }}>{m.name}{m.isYou ? " (you)" : ""}</div>
                <div style={{ fontFamily: "JetBrains Mono", color: "var(--blue-l)" }}>{m.focusMinutes}m</div>
                <div style={{ fontFamily: "JetBrains Mono", color: "var(--green)" }}>{m.tasksCompleted}</div>
                <div style={{ fontFamily: "JetBrains Mono", color: "var(--purple-l)" }}>{m.streak}d</div>
              </div>
            ))}
          </div>
        </div>

        {/* 7-Day Challenge */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>🎯 7-Day Consistency Challenge</div>
              <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Target: {summary.challengeTarget} focused minutes/day</div>
            </div>
            <button
              className="btn"
              style={{ fontSize: "0.74rem" }}
              onClick={() => {
                setChallengeActive(!state.challenge.active);
                window.location.reload();
              }}
            >
              {state.challenge.active ? "Pause Challenge" : "Resume Challenge"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 10 }}>
            {summary.challengeDays.map((d) => (
              <div key={d.date} style={{
                borderRadius: 10,
                border: `1px solid ${d.met ? "rgba(74,222,128,0.35)" : "var(--border)"}`,
                background: d.met ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.03)",
                padding: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "0.68rem", color: "var(--hint)", marginBottom: 4 }}>{shortDate(d.date)}</div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.82rem", color: d.met ? "var(--green)" : "var(--muted)" }}>{d.minutes}m</div>
                <div style={{ fontSize: "0.65rem", color: d.met ? "var(--green)" : "var(--hint)", marginTop: 2 }}>
                  {d.met ? "Met" : "Miss"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: Circle Pulse + Your Standing ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Circle Pulse */}
        <div className="card">
          <div className="card-title">⚡ Circle Pulse</div>
          <div className="card-sub">Combined effort across all {standings.length} members this week.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(99,102,241,0.07)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.6rem", fontWeight: 700, color: "var(--purple-l)" }}>{totalGroupMinutes}m</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>Total Group Focus</div>
            </div>
            <div style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(79,159,255,0.07)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.6rem", fontWeight: 700, color: "var(--blue-l)" }}>{avgMinutes}m</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>Avg Per Member</div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(0,0,0,0.02)", fontSize: "0.84rem", color: "var(--text)" }}>
            {momentumText}
          </div>
        </div>

        {/* Your Standing */}
        <div className="card">
          <div className="card-title">🎯 Your Standing</div>
          <div className="card-sub">How you compare to the rest of the circle.</div>
          <div style={{ marginTop: 12, padding: "14px", borderRadius: 10, border: "1px solid rgba(124,111,247,0.3)", background: "rgba(124,111,247,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "2.2rem", fontWeight: 700, color: "var(--purple-l)" }}>#{yourRank}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.2rem", fontWeight: 600 }}>{you?.focusMinutes || 0}m</div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>your focus this week</div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: "0.84rem", color: "var(--text)" }}>{yourInsight}</div>
          </div>
          {yourRank > 1 && you && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 5 }}>Progress to #1</div>
              <div style={{ background: "var(--border)", borderRadius: 99, height: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: "var(--grad-purple)", width: `${Math.min(100, Math.round((you.focusMinutes / maxFocus) * 100))}%`, transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--hint)", marginTop: 4 }}>{you.focusMinutes}m / {maxFocus}m</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Member Spotlights ── */}
      <div className="card">
        <div className="card-title">👥 Member Spotlights</div>
        <div className="card-sub">Weekly focus breakdown for each circle member.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {standings.map((m, idx) => (
            <div key={m.id} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${m.isYou ? "rgba(124,111,247,0.35)" : "var(--border)"}`, background: m.isYou ? "rgba(124,111,247,0.06)" : "transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem", color: idx === 0 ? "var(--amber)" : "var(--muted)", minWidth: 22 }}>#{idx + 1}</span>
                  <span style={{ fontWeight: 600 }}>{m.name}{m.isYou ? " (you)" : ""}</span>
                  {idx === 0 && <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.15)", color: "var(--amber)", fontWeight: 600 }}>Leader</span>}
                  {m.isYou && idx > 0 && <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 99, background: "rgba(124,111,247,0.15)", color: "var(--purple-l)", fontWeight: 600 }}>You</span>}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", fontFamily: "JetBrains Mono" }}>
                  <span style={{ color: "var(--blue-l)" }}>{m.focusMinutes}m</span>
                  <span style={{ color: "var(--green)" }}>{m.tasksCompleted} tasks</span>
                  <span style={{ color: "var(--purple-l)" }}>{m.streak}d streak</span>
                </div>
              </div>
              <div style={{ background: "var(--border)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: idx === 0 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "var(--grad-purple)", width: `${Math.round((m.focusMinutes / maxFocus) * 100)}%`, transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--hint)", marginTop: 4 }}>{Math.round((m.focusMinutes / maxFocus) * 100)}% of group max</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
