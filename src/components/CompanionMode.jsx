import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./UILibrary";
import { getStats } from "../utils/completionStore";
import { suggestGroupFocusSlots, suggestDayFocusBlock } from "../api/gemini";
import { getGroupCommonSlots, getCommonFreeBlocks } from "../utils/groupAvailability";
import {
  addDemoMembers,
  acceptGroupBlocker,
  autoSuggestGroupBlockers,
  createCircle,
  getCommonAvailabilityBlocks,
  getCompanionSummary,
  inviteMemberByEmail,
  joinCircle,
  leaveCircle,
  loadCompanionState,
  logFocusSession,
  rejectGroupBlocker,
  removeMemberFromCircle,
  renameGroupBlocker,
  reorderCircle,
  setChallengeActive,
  setCurrentCircle,
  setMemberGoogleCalendarToken,
  setShareTaskNames,
  suggestGroupBlocker,
  updateProfileName,
  deleteCircle,
} from "../utils/companionStore";
import { initEmailJS, sendInvitationEmail, getInviteLink, getConfigurationGuide } from "../utils/emailService";

function formatClock(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function shortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// --- Group Calendar helpers ---
const MEMBER_COLORS = ["#6366f1", "#22c55e", "#7dd3fc", "#ef4444", "#38bdf8", "#a78bfa", "#fb923c"];

function getDemoSchedule(memberId, dateStr) {
  const seed = memberId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const dateSeed = dateStr.replace(/-/g, "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const combined = (seed * 31 + dateSeed) % 64;
  const slots = [
    { startTime: "08:00", endTime: "09:30", title: "Morning class" },
    { startTime: "10:00", endTime: "11:30", title: "Lecture" },
    { startTime: "13:00", endTime: "14:30", title: "Workshop" },
    { startTime: "15:00", endTime: "16:30", title: "Study group" },
    { startTime: "17:00", endTime: "18:00", title: "Office hours" },
    { startTime: "20:00", endTime: "21:30", title: "Evening review" },
  ];
  return slots.filter((_, i) => (combined >> i) & 1).map(s => ({ ...s, date: dateStr }));
}

function buildMemberEventsMap(members, myId, days) {
  let myEvents = [];
  try {
    const all = JSON.parse(localStorage.getItem("smart_cal_all_events") || "[]");
    myEvents = all.filter(e => days.includes(e.date) && e.startTime && e.endTime);
  } catch {}
  const map = {};
  members.forEach(m => {
    map[m.id] = m.id === myId
      ? myEvents
      : days.flatMap(d => getDemoSchedule(m.id, d));
  });
  return map;
}

function next7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
// --- End Group Calendar helpers ---

export default function CompanionMode() {
  const [state, setState] = useState(loadCompanionState());
  const [summary, setSummary] = useState(getCompanionSummary({ state: state, completed: getStats().total }));
  const [activeTab, setActiveTab] = useState("circles");

  const [profileName, setProfileName] = useState(state.profile.name || "You");
  const [newCircleName, setNewCircleName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [friendName, setFriendName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [showManualInvite, setShowManualInvite] = useState(false);
  const [manualInviteCode, setManualInviteCode] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState(null);

  const [duration, setDuration] = useState(25);
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [isGroupSession, setIsGroupSession] = useState(false);

  const [calDay, setCalDay] = useState(0);
  const [editingBlockerId, setEditingBlockerId] = useState(null);
  const [editingBlockerTitle, setEditingBlockerTitle] = useState("");
  const [aiSlots, setAiSlots] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [circleDropdownOpen, setCircleDropdownOpen] = useState(false);
  const [dragOverCircleId, setDragOverCircleId] = useState(null);
  const dragSrcCircleId = React.useRef(null);


  const refresh = () => {
    const currentState = loadCompanionState();
    setState(currentState);
    // Pass the updated state to getCompanionSummary for accurate focus/task/streak calculations
    const updatedSummary = getCompanionSummary({ state: currentState, completed: getStats().total });
    setSummary(updatedSummary);
  };

  useEffect(() => {
    initEmailJS(); // Initialize email service on mount
    const sync = () => refresh();
    window.addEventListener("companionUpdated", sync);
    return () => window.removeEventListener("companionUpdated", sync);
  }, []);

  // Validate that currentCircle exists and has an ID
  const validCircleId = summary?.currentCircle?.id;
  if (!validCircleId && state?.circles?.length > 0) {
    // Auto-fix: if circle is missing, refresh immediately
    setTimeout(() => refresh(), 100);
  }

  useEffect(() => {
    if (running) return;
    setRemainingSec(duration * 60);
  }, [duration]);

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          setRunning(false);
          const session = logFocusSession({
            minutes: duration,
            isGroup: isGroupSession,
            circleId: summary.currentCircle.id,
          });
          setToast(`Logged ${session.minutes} focused minutes${session.isGroup ? " (group)" : ""}.`);
          setTimeout(() => setToast(""), 2800);
          refresh();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, duration, isGroupSession, summary.currentCircle?.id]);

  const standings = summary.leaderboard || [];
  const privacyText = state.profile.shareTaskNames
    ? "Task names are visible to friends."
    : "Stats-only sharing enabled (recommended).";

  const todayChallengeMet = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return summary.challengeDays.find((d) => d.date === today)?.met || false;
  }, [summary.challengeDays]);

  return (
    <div>
      <div className="card">
        <div className="card-title">🤝 Companion Mode</div>
        <div className="card-sub">
          Social accountability like Strava for studying: invite friends, run focus sessions, and compare weekly progress.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <SummaryTile label="Circle" value={summary.currentCircle?.name || "-"} sub={`${summary.currentCircle?.members?.length || 0} members`} tone="purple" />
          <SummaryTile label="Your Focus" value={`${summary.userFocusMinutes}m`} sub="This week" tone="blue" />
          <SummaryTile label="Challenge" value={`${summary.completedChallengeDays}/7`} sub={`${summary.challengeTarget}m daily`} tone="green" />
          <SummaryTile label="Today" value={todayChallengeMet ? "On Track" : "Pending"} sub="Consistency status" tone="amber" />
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>👤 Profile & Privacy</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Default is stats-only sharing; task names stay private.</div>
          </div>
          <Button variant="secondary"
            style={{fontSize:"0.74rem"}}
            onClick={() => {
              setShareTaskNames(!state.profile.shareTaskNames);
              refresh();
            }}
          >
            {state.profile.shareTaskNames ? "Switch to Stats-Only" : "Enable Task-Name Sharing"}
          </Button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your display name"
            style={{ maxWidth: 220 }}
          />
          <Button variant="primary"
            style={{fontSize:"0.74rem"}}
            onClick={() => {
              updateProfileName(profileName);
              refresh();
              setToast("Display name updated.");
              setTimeout(() => setToast(""), 1800);
            }}
          >
            Save name
          </Button>
          <span style={{ fontSize: "0.74rem", color: "var(--hint)" }}>{privacyText}</span>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div style={{
        display: "flex", 
        gap: 8,
        background: "var(--bg-secondary, #f0ebfe)",
        padding: "8px",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        flexWrap: "wrap"
      }}>
        {["circles", "focus", "activity", "calendar"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: "0 1 auto",
              minWidth: "90px",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              background: activeTab === tab 
                ? "var(--grad-purple)" 
                : "transparent",
              color: activeTab === tab ? "white" : "var(--text-muted)",
              transition: "all 0.2s",
            }}>
            {tab === "circles" && "🎯 Circles"}
            {tab === "focus" && "⏲️ Focus"}
            {tab === "activity" && "🗞 Activity"}
            {tab === "calendar" && "📅 Calendar"}
          </button>
        ))}
      </div>

      {/* ACTIVE CIRCLE DROPDOWN */}
      {activeTab !== "circles" && summary.currentCircle && (
        <div style={{ display: "flex", justifyContent: "flex-end", position: "relative", margin: "4px 0 0" }}>
          <button
            onClick={() => setCircleDropdownOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 12px 5px 10px",
              borderRadius: 8,
              border: "1px solid rgba(99,102,241,0.3)",
              background: "rgba(99,102,241,0.10)",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#c4b5fd",
              transition: "background 0.15s",
            }}
          >
            <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Circle</span>
            <span style={{ width: 1, height: 10, background: "rgba(167,139,250,0.4)", display: "inline-block", borderRadius: 2 }} />
            <span>🎯 {summary.currentCircle.name}</span>
            <span style={{ fontSize: "0.65rem", color: "#818cf8", background: "rgba(99,102,241,0.18)", borderRadius: 20, padding: "1px 7px" }}>
              {summary.currentCircle.members?.length ?? 0}
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--muted)", marginLeft: 2 }}>{circleDropdownOpen ? "▲" : "▼"}</span>
          </button>

          {circleDropdownOpen && (
            <div
              onMouseLeave={() => setCircleDropdownOpen(false)}
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 999,
                background: "#f5f5f7",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                minWidth: 220,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "6px 12px 4px", fontSize: "0.65rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
                Switch Circle
              </div>
              {(summary.state?.circles || []).map(c => {
                const isActive = c.id === summary.currentCircle.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCurrentCircle(c.id);
                      refresh();
                      setCircleDropdownOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "9px 14px",
                      border: "none",
                      borderBottom: "1px solid #e5e7eb",
                      background: isActive ? "#e0e7ff" : "#f5f5f7",
                      cursor: "pointer",
                      textAlign: "left",
                      color: isActive ? "#4338ca" : "#111827",
                      fontWeight: isActive ? 700 : 400,
                      fontSize: "0.83rem",
                      transition: "background 0.1s",
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

      {/* CIRCLES TAB */}
      {activeTab === "circles" && (
      <div className="card">
        <div className="card-title">🎯 Focus Circle</div>
        <div className="card-sub">Create a circle, invite friends, and track collective focus sessions & productivity streaks.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Create circle</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Circle name"
                value={newCircleName}
                onChange={(e) => setNewCircleName(e.target.value)}
              />
              <Button variant="primary"
                style={{fontSize:"0.74rem"}}
                onClick={() => {
                  createCircle(newCircleName);
                  setNewCircleName("");
                  refresh();
                }}
              >
                Create
              </Button>
            </div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Join with code</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexDirection: "column" }}>
              <input
                className="input"
                placeholder="Invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={{ marginBottom: 0 }}
              />
              <input
                className="input"
                placeholder="Your name"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button variant="secondary"
              style={{fontSize:"0.74rem"}}
              onClick={() => {
                try {
                  setError(null);
                  joinCircle(joinCode, friendName);
                  setJoinCode("");
                  setFriendName("");
                  refresh();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Join circle
            </Button>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Invite by email</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexDirection: "column" }}>
              <input
                className="input"
                placeholder="friend@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ marginBottom: 0 }}
              />
              <input
                className="input"
                placeholder="Display name"
                value={inviteDisplayName}
                onChange={(e) => setInviteDisplayName(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button variant="success"
              disabled={isInviting}
              style={{fontSize:"0.74rem",opacity:isInviting?0.6:1}}
              onClick={async () => {
                try {
                  console.log("🎯 Send invite clicked");
                  setError(null);
                  setIsInviting(true);
                  
                  // First add the member locally (or get existing)
                  console.log("📝 Adding member locally:", inviteEmail, inviteDisplayName);
                  const memberResult = inviteMemberByEmail(summary.currentCircle?.id, inviteEmail, inviteDisplayName);
                  console.log("📝 Member result:", memberResult);
                  
                  // Try to send email (even if member already existed)
                  console.log("📧 Attempting to send email...");
                  console.log("🔍 Function params:", {
                    email: inviteEmail,
                    name: inviteDisplayName || inviteEmail.split("@")[0],
                    sender: state.profile.name,
                    circle: summary.currentCircle?.name,
                    code: summary.currentCircle?.code
                  });
                  
                  const emailSent = await sendInvitationEmail(
                    inviteEmail,
                    inviteDisplayName || inviteEmail.split("@")[0],
                    state.profile.name,
                    summary.currentCircle?.name,
                    summary.currentCircle?.code
                  );
                  
                  console.log("✅✅✅ RESULT:", emailSent);
                  
                  if (emailSent) {
                    setToast(memberResult.isResend ? "📧 Invitation re-sent!" : "✅ Invitation email sent! Check their inbox.");
                    setManualInviteCode("");
                    setShowManualInvite(false);
                  } else {
                    // Email failed or not configured - show manual option
                    setManualInviteCode(getInviteLink(summary.currentCircle?.name, summary.currentCircle?.code));
                    setShowManualInvite(true);
                    setToast("📋 Email not configured. Share the link manually below.");
                  }
                  
                  setTimeout(() => setToast(""), 3500);
                  setInviteEmail("");
                  setInviteDisplayName("");
                  refresh();
                } catch (err) {
                  console.error("🚨 ERROR IN TRY BLOCK:", err);
                  setError(err.message);
                } finally {
                  setIsInviting(false);
                }
              }}
            >
              {isInviting ? "Sending..." : "📧 Send invite"}
            </Button>
          </div>
        </div>

        {showManualInvite && manualInviteCode && (
          <div style={{ marginTop: 12, border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: "12px", background: "rgba(99,102,241,0.08)" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, color: "#6366f1" }}>📋 Share this link</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>
              Send this to your friend to join:
            </div>
            <div style={{ 
              background: "rgba(0,0,0,0.2)", 
              borderRadius: 6, 
              padding: "10px", 
              marginBottom: 8, 
              fontFamily: "JetBrains Mono",
              fontSize: "0.68rem",
              wordBreak: "break-all",
              color: "#6366f1",
              maxHeight: "60px",
              overflowY: "auto"
            }}>
              {manualInviteCode}
            </div>
            <Button variant="secondary"
              style={{fontSize:"0.72rem",width:"100%"}}
              onClick={() => {
                navigator.clipboard.writeText(manualInviteCode);
                setToast("✅ Link copied to clipboard!");
                setTimeout(() => setToast(""), 2000);
              }}
            >
              📋 Copy link
            </Button>
            <div style={{ fontSize: "0.68rem", color: "var(--hint)", marginTop: 8 }}>
              💡 Alternatively, share the invite code: <span style={{ fontFamily: "JetBrains Mono", color: "#6366f1" }}>{summary.currentCircle?.code}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Your circles <span style={{ fontSize: "0.68rem", color: "var(--hint)" }}>· drag to reorder</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {state.circles.map((circle) => {
                const isOver = dragOverCircleId === circle.id && dragSrcCircleId.current !== circle.id;
                return (
                  <div
                    key={circle.id}
                    draggable
                    onDragStart={() => { dragSrcCircleId.current = circle.id; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverCircleId(circle.id); }}
                    onDragLeave={() => setDragOverCircleId(null)}
                    onDrop={() => {
                      const src = dragSrcCircleId.current;
                      const dst = circle.id;
                      if (src && dst && src !== dst) {
                        const s = loadCompanionState();
                        const srcIdx = s.circles.findIndex(c => c.id === src);
                        const dstIdx = s.circles.findIndex(c => c.id === dst);
                        if (srcIdx !== -1 && dstIdx !== -1) {
                          const circles = [...s.circles];
                          const [moved] = circles.splice(srcIdx, 1);
                          circles.splice(dstIdx, 0, moved);
                          s.circles = circles;
                          // save via reorderCircle logic inline
                          try { localStorage.setItem("smart_cal_companion_v1", JSON.stringify(s)); } catch {}
                          refresh();
                        }
                      }
                      dragSrcCircleId.current = null;
                      setDragOverCircleId(null);
                    }}
                    onDragEnd={() => { dragSrcCircleId.current = null; setDragOverCircleId(null); }}
                    style={{ display: "flex", gap: 8, alignItems: "center", cursor: "grab",
                      borderRadius: 8,
                      outline: isOver ? "2px solid #818cf8" : "2px solid transparent",
                      transition: "outline 0.12s",
                    }}
                  >
                    {/* Drag handle */}
                    <span style={{
                      display: "flex", flexDirection: "column", gap: 3, padding: "4px 2px",
                      color: "#a5b4fc", flexShrink: 0, userSelect: "none", fontSize: "0.7rem", lineHeight: 1,
                    }}>
                      &#x2807;
                    </span>
                    <Button
                      variant={circle.id === state.currentCircleId ? "primary" : "secondary"}
                      onClick={() => { setCurrentCircle(circle.id); refresh(); }}
                      style={{ justifyContent: "space-between", flex: 1, cursor: "pointer" }}
                    >
                      <span>{circle.name}</span>
                      <span style={{ fontSize: "0.68rem", fontFamily: "JetBrains Mono", color: "var(--hint)" }}>
                        code {circle.code}
                      </span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Current circle details</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>{summary.currentCircle?.name}</div>
            <div style={{ fontSize: "0.74rem", color: "var(--hint)", marginBottom: 8 }}>
              Invite code: <span style={{ fontFamily: "JetBrains Mono", color: "var(--purple-l)" }}>{summary.currentCircle?.code}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
              {summary.currentCircle?.members?.map((m) => {
                const isYou = m.id === state.profile.id;
                const isOwner = m.role === "owner";
                const userIsAdmin = summary.currentCircle?.members?.find(member => member.id === state.profile.id)?.role === "owner";
                
                return (
                  <div key={m.id} style={{ 
                    padding: "10px 12px", 
                    border: "1px solid var(--border)", 
                    borderRadius: 8,
                    background: isYou ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--text)" }}>
                        {m.name} {isYou ? "(you)" : ""} {isOwner ? "👑" : ""}
                      </div>
                      {m.email && (
                        <div style={{ fontSize: "0.68rem", color: "var(--hint)", marginTop: 2 }}>
                          {m.email} {m.googleCalendarToken ? "✅" : "⏳"}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {!isYou && userIsAdmin && (
                        <Button 
                          variant="secondary"
                          style={{ fontSize: "0.65rem", padding: "4px 8px", background: "rgba(239,68,68,0.12)", color: "var(--red)" }}
                          onClick={() => {
                            try {
                              removeMemberFromCircle(summary.currentCircle.id, m.id);
                              setToast("✅ Member removed");
                              setTimeout(() => setToast(""), 2000);
                              refresh();
                            } catch (err) {
                              setError(err.message);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button 
              variant="secondary" 
              style={{ fontSize: "0.74rem", width: "100%", marginBottom: 10 }}
              onClick={() => {
                addDemoMembers(summary.currentCircle.id); 
                refresh();
              }}
            >
              Add demo members
            </Button>
            {summary.currentCircle?.members?.find(m => m.id === state.profile.id)?.role !== "owner" && (
              <Button 
                variant="secondary"
                style={{ fontSize: "0.74rem", width: "100%", background: "rgba(239,68,68,0.12)", color: "var(--red)", borderColor: "rgba(239,68,68,0.3)" }}
                onClick={() => {
                  try {
                    leaveCircle(summary.currentCircle.id);
                    setToast("👋 You left the circle");
                    setTimeout(() => setToast(""), 2000);
                    refresh();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Leave circle
              </Button>
            )}
            {summary.currentCircle?.members?.find(m => m.id === state.profile.id)?.role === "owner" && (
              <Button
                variant="secondary"
                style={{ fontSize: "0.74rem", width: "100%", marginTop: 4, background: "rgba(239,68,68,0.12)", color: "var(--red)", borderColor: "rgba(239,68,68,0.3)" }}
                onClick={() => {
                  if (!window.confirm(`Delete "${summary.currentCircle.name}"? This cannot be undone.`)) return;
                  try {
                    deleteCircle(summary.currentCircle.id);
                    setToast("🗑️ Circle deleted");
                    setTimeout(() => setToast(""), 2000);
                    refresh();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                🗑 Delete circle
              </Button>
            )}
          </div>
        </div>

        {error && <div style={{ marginTop: 10, color: "var(--red)", fontSize: "0.76rem" }}>⚠️ {error}</div>}
      </div>
      )}

      {/* FOCUS TAB */}
      {activeTab === "focus" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-title">⏲️ Focus Session</div>
        <div className="card-sub">Run solo or group sessions; completed sessions automatically count toward leaderboard and challenge.</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[25, 45, 60].map((m) => (
            <button
              key={m}
              className="btn"
              style={{
                fontSize: "0.74rem",
                background: duration === m ? "rgba(79,159,255,0.2)" : "rgba(255,255,255,0.03)",
                borderColor: duration === m ? "rgba(79,159,255,0.35)" : "var(--border)",
              }}
              onClick={() => { setDuration(m); setRunning(false); }}
            >
              {m}m
            </button>
          ))}
          <button
            className="btn"
            style={{
              fontSize: "0.74rem",
              background: isGroupSession ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.03)",
              borderColor: isGroupSession ? "rgba(74,222,128,0.35)" : "var(--border)",
            }}
            onClick={() => setIsGroupSession((v) => !v)}
          >
            {isGroupSession ? "👥 Group Session" : "👤 Solo Session"}
          </button>
        </div>

        <div style={{
          fontFamily: "JetBrains Mono",
          fontSize: "2rem",
          fontWeight: 700,
          color: running ? "var(--green)" : "var(--text)",
          marginBottom: 12,
        }}>
          {formatClock(remainingSec)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setRunning((v) => !v)}>
            {running ? "Pause" : remainingSec === 0 ? "Restart" : "Start"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setRunning(false);
              setRemainingSec(duration * 60);
            }}
          >
            Reset
          </button>
          <button
            className="btn btn-success"
            onClick={() => {
              logFocusSession({ minutes: duration, isGroup: isGroupSession, circleId: summary.currentCircle.id });
              refresh();
              setToast(`Logged ${duration}m session.`);
              setTimeout(() => setToast(""), 1800);
            }}
          >
            Log Session Now
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⏱️ Group Focus Blocks</div>
        <div className="card-sub">Collaborative time slots suggested by the system. Accept to sync to your calendar.</div>
        
        {(() => {
          const groupBlockers = getCommonAvailabilityBlocks(summary.currentCircle?.id);
          const circle = state.circles.find(c => c.id === summary.currentCircle?.id);
          
          return (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const tomorrowStr = tomorrow.toISOString().split("T")[0];
                      suggestGroupBlocker(summary.currentCircle?.id, "Group Study Session", tomorrowStr, "15:00", 90);
                      setToast("✅ Focus block suggested!");
                      setTimeout(() => setToast(""), 2000);
                      refresh();
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  style={{ fontSize: "0.85rem", flex: 1 }}
                >
                  + Suggest Group Block
                </button>
              </div>

              {groupBlockers.length === 0 ? (
                <div style={{ fontSize: "0.82rem", color: "var(--muted)", padding: "12px 0", textAlign: "center" }}>
                  No pending group blocks. Create one to organize study time!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupBlockers.map((blocker) => {
                    const acceptedMembers = blocker.acceptances.map(a => {
                      const member = circle?.members.find(m => m.id === a.memberId);
                      return member?.name || "Unknown";
                    });
                    const allAccepted = circle && blocker.acceptances.length === circle.members.length;
                    const iAccepted = blocker.acceptances.some(a => a.memberId === state.profile.id);

                    return (
                      <div
                        key={blocker.id}
                        style={{
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          padding: "10px 12px",
                          background: allAccepted ? "rgba(34,197,94,0.12)" : blocker.autoGenerated ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                          {editingBlockerId === blocker.id ? (
                            <>
                              <input
                                className="input"
                                value={editingBlockerTitle}
                                onChange={e => setEditingBlockerTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    renameGroupBlocker(blocker.id, editingBlockerTitle);
                                    setEditingBlockerId(null);
                                    refresh();
                                  } else if (e.key === "Escape") {
                                    setEditingBlockerId(null);
                                  }
                                }}
                                autoFocus
                                style={{ fontSize: "0.84rem", padding: "3px 8px", maxWidth: 220, height: 28 }}
                              />
                              <button
                                className="btn"
                                style={{ fontSize: "0.7rem", padding: "3px 8px", background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e" }}
                                onClick={() => {
                                  renameGroupBlocker(blocker.id, editingBlockerTitle);
                                  setEditingBlockerId(null);
                                  refresh();
                                }}
                              >Save</button>
                              <button
                                className="btn"
                                style={{ fontSize: "0.7rem", padding: "3px 8px" }}
                                onClick={() => setEditingBlockerId(null)}
                              >Cancel</button>
                            </>
                          ) : (
                            <>
                              <span>{allAccepted ? "✅" : "⏳"} {blocker.title} {blocker.autoGenerated && <span style={{ fontSize: "0.75rem", color: "#6366f1" }}>🤖</span>}</span>
                              <button
                                onClick={() => { setEditingBlockerId(blocker.id); setEditingBlockerTitle(blocker.title); }}
                                style={{ fontSize: "0.68rem", padding: "2px 6px", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "var(--muted)", cursor: "pointer" }}
                              >✏️</button>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--hint)", marginBottom: 8 }}>
                          {blocker.date} • {blocker.startTime}–{blocker.endTime} ({blocker.duration}m)
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>
                          {acceptedMembers.length}/{circle?.members.length || 0} accepted: {acceptedMembers.join(", ")}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {!iAccepted && (
                            <button
                              className="btn"
                              onClick={() => {
                                acceptGroupBlocker(blocker.id, state.profile.id);
                                setToast("✅ Accepted!");
                                setTimeout(() => setToast(""), 1500);
                                refresh();
                              }}
                              style={{
                                fontSize: "0.72rem",
                                padding: "4px 8px",
                                background: "rgba(34,197,94,0.2)",
                                borderColor: "rgba(34,197,94,0.4)",
                                color: "#22c55e",
                              }}
                            >
                              ✓ Accept
                            </button>
                          )}
                          {!iAccepted && (
                            <button
                              onClick={() => {
                                rejectGroupBlocker(blocker.id);
                                setToast("❌ Rejected");
                                setTimeout(() => setToast(""), 1500);
                                refresh();
                              }}
                              style={{
                                fontSize: "0.72rem",
                                padding: "4px 8px",
                                background: "rgba(239,68,68,0.15)",
                                border: "1px solid rgba(239,68,68,0.3)",
                                borderRadius: 6,
                                color: "#ef4444",
                                cursor: "pointer",
                              }}
                            >
                              ✕ Decline
                            </button>
                          )}
                          {allAccepted && (
                            <div style={{ fontSize: "0.72rem", color: "#22c55e", fontWeight: 600 }}>
                              ✅ Added to Calendar
                            </div>
                          )}
                          <button
                            onClick={() => {
                              rejectGroupBlocker(blocker.id);
                              setToast("🗑️ Block removed");
                              setTimeout(() => setToast(""), 1500);
                              refresh();
                            }}
                            style={{
                              fontSize: "0.72rem",
                              padding: "4px 8px",
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 6,
                              color: "var(--muted)",
                              cursor: "pointer",
                              marginLeft: "auto",
                            }}
                          >
                            🗑 Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
      </div>
      )}

      {/* STATS & INSIGHTS — moved to CompanionInsights page */}
      {false && (<>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-sub">Ranked by focused minutes first, then tasks completed, then streak.</div>

        <div style={{ display: "grid", gridTemplateColumns: "0.4fr 1.2fr 0.8fr 0.8fr 0.6fr", gap: 8, fontSize: "0.72rem", color: "var(--hint)", padding: "0 8px 8px" }}>
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
              refresh();
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

      {/* INSIGHTS SECTION */}
      {(() => {
        const totalGroupMinutes = standings.reduce((s, m) => s + m.focusMinutes, 0);
        const avgMinutes = standings.length ? Math.round(totalGroupMinutes / standings.length) : 0;
        const leader = standings[0];
        const you = standings.find(m => m.isYou);
        const yourRank = standings.findIndex(m => m.isYou) + 1;
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Top row: Circle Pulse + Your Standing */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

            {/* Member Spotlights */}
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
      })()}
      </>)}

      {/* GROUP CALENDAR TAB */}
      {activeTab === "calendar" && (() => {
        const members = summary.currentCircle?.members || [];
        const days = next7Days();
        const selectedDateStr = days[calDay];
        const selectedDayMap = buildMemberEventsMap(members, state.profile.id, [selectedDateStr]);
        const freeBlocks = getCommonFreeBlocks(selectedDayMap, selectedDateStr, 8, 22, 45);
        const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8am–9pm

        const allBusyPerHour = HOURS.map(h =>
          members.some(m =>
            (selectedDayMap[m.id] || []).some(e => {
              const s = parseInt((e.startTime || "").split(":")[0] || "0");
              const en = parseInt((e.endTime || "").split(":")[0] || "0");
              return h >= s && h < en;
            })
          )
        );

        const handleAiSuggest = async () => {
          setAiLoading(true);
          setAiSlots(null);
          try {
            const map = buildMemberEventsMap(members, state.profile.id, days);
            const slots = getGroupCommonSlots(map, [days[0], days[6]], 60, 10);
            const result = await suggestGroupFocusSlots(
              summary.currentCircle?.name || "Focus Circle",
              members.map(m => m.name),
              slots
            );
            setAiSlots(result.suggestions || []);
          } catch {
            setAiSlots([]);
          } finally {
            setAiLoading(false);
          }
        };

        return (
          <div className="card">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div className="card-title" style={{ marginBottom: 2 }}>📅 Group Calendar</div>
                <div className="card-sub">Shared availability for <strong>{summary.currentCircle?.name}</strong>. Red = someone blocked.</div>
              </div>
              <button
                className="btn"
                disabled={aiLoading}
                onClick={handleAiSuggest}
                style={{ fontSize: "0.82rem", background: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.4)", color: "#818cf8", minWidth: 150, opacity: aiLoading ? 0.7 : 1 }}
              >
                {aiLoading ? "⏳ Thinking..." : "🤖 AI Suggest Slots"}
              </button>
            </div>

            {/* AI suggestion results */}
            {aiSlots && aiSlots.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#818cf8", marginBottom: 8 }}>🤖 AI Recommended Focus Slots</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {aiSlots.map((s, i) => (
                    <div key={i} style={{ borderRadius: 10, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.09)", padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>
                        Slot {i + 1}: {s.dayName} {s.date} · {s.startTime}–{s.endTime}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--hint)", marginTop: 4 }}>{s.reason}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          className="btn"
                          style={{ fontSize: "0.72rem", background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e" }}
                          onClick={() => {
                            const blocker = suggestGroupBlocker(summary.currentCircle?.id, "AI Group Focus Session", s.date, s.startTime, 90);
                            acceptGroupBlocker(blocker.id, state.profile.id);
                            setAiSlots(prev => prev.filter((_, idx) => idx !== i));
                            refresh();
                            setToast("✅ Added to Focus Blocks!");
                            setTimeout(() => setToast(""), 2000);
                          }}
                        >
                          ✓ Accept
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: "0.72rem", background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}
                          onClick={() => {
                            setAiSlots(prev => prev.filter((_, idx) => idx !== i));
                            setToast("❌ Slot dismissed");
                            setTimeout(() => setToast(""), 1500);
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiSlots && aiSlots.length === 0 && (
              <div style={{ marginBottom: 16, fontSize: "0.8rem", color: "var(--muted)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--border)" }}>
                🤖 AI couldn't find a clear best slot — check the shared free windows below.
              </div>
            )}

            {/* Day selector */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {days.map((d, i) => {
                const dt = new Date(`${d}T00:00:00`);
                const label = i === 0
                  ? "Today"
                  : dt.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
                return (
                  <button
                    key={d}
                    className="btn"
                    onClick={() => setCalDay(i)}
                    style={{
                      fontSize: "0.74rem",
                      padding: "6px 10px",
                      background: calDay === i ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                      borderColor: calDay === i ? "rgba(99,102,241,0.5)" : "var(--border)",
                      color: calDay === i ? "#818cf8" : "var(--text-muted)",
                      fontWeight: calDay === i ? 700 : 400,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Timeline grid */}
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              {/* Hour labels */}
              <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${HOURS.length}, 1fr)`, gap: 2, marginBottom: 4, minWidth: 520 }}>
                <div />
                {HOURS.map(h => (
                  <div key={h} style={{ fontSize: "0.58rem", color: "var(--hint)", textAlign: "center" }}>
                    {h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                  </div>
                ))}
              </div>

              {/* "All free" indicator row */}
              <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${HOURS.length}, 1fr)`, gap: 2, marginBottom: 5, minWidth: 520 }}>
                <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", alignSelf: "center", fontWeight: 600, paddingRight: 4 }}>Blocked</div>
                {HOURS.map((h, hi) => (
                  <div key={h} style={{
                    height: 16,
                    borderRadius: 3,
                    background: allBusyPerHour[hi] ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.07)",
                    border: allBusyPerHour[hi] ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(255,255,255,0.12)",
                  }} />
                ))}
              </div>

              {/* Per-member rows */}
              {members.map((m, mi) => {
                const color = MEMBER_COLORS[mi % MEMBER_COLORS.length];
                return (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: `72px repeat(${HOURS.length}, 1fr)`, gap: 2, marginBottom: 4, minWidth: 520 }}>
                    <div style={{ fontSize: "0.63rem", color, alignSelf: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 4 }} title={m.name}>
                      {m.name.split(" ")[0]}
                    </div>
                    {HOURS.map(h => {
                      const busy = (selectedDayMap[m.id] || []).some(e => {
                        const s = parseInt((e.startTime || "").split(":")[0] || "0");
                        const en = parseInt((e.endTime || "").split(":")[0] || "0");
                        return h >= s && h < en;
                      });
                      return (
                        <div key={h} style={{
                          height: 14,
                          borderRadius: 3,
                          background: busy ? `${color}55` : "rgba(255,255,255,0.04)",
                          border: busy ? `1px solid ${color}88` : "1px solid rgba(255,255,255,0.07)",
                        }} />
                      );
                    })}
                  </div>
                );
              })}

              {/* Legend */}
              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                {members.map((m, mi) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: `${MEMBER_COLORS[mi % MEMBER_COLORS.length]}88` }} />
                    <span style={{ fontSize: "0.67rem", color: "var(--hint)" }}>{m.name} {m.id === state.profile.id ? "(you)" : ""}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }} />
                  <span style={{ fontSize: "0.67rem", color: "#f87171" }}>Blocked by someone</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
                  <span style={{ fontSize: "0.67rem", color: "var(--hint)" }}>All free</span>
                </div>
              </div>
            </div>

            {/* Common free windows for selected day */}
            {freeBlocks.length > 0 ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7dd3fc", marginBottom: 6 }}>✅ Shared free windows</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {freeBlocks.map((b, i) => (
                    <div key={i} style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: 8, background: "rgba(125,211,252,0.22)", border: "1px solid rgba(125,211,252,0.55)", color: "#38bdf8" }}>
                      {b.label} ({Math.round((b.duration / 60) * 10) / 10}h)
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: "0.76rem", color: "var(--muted)" }}>No shared free windows on this day.</div>
            )}
          </div>
        );
      })()}

      {/* ACTIVITY TAB */}
      {activeTab === "activity" && (      <div className="card">
        <div className="card-title">🗞 Circle Activity</div>
        {summary.activity.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--hint)" }}>No sessions logged yet in this circle.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {summary.activity.map((a) => (
              <div key={a.id} style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                fontSize: "0.76rem",
              }}>
                <span>
                  <strong style={{ color: "var(--text)" }}>{a.memberName}</strong> logged {a.minutes}m {a.isGroup ? "group" : "solo"} focus
                </span>
                <span style={{ color: "var(--hint)", fontFamily: "JetBrains Mono" }}>{new Date(a.at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {toast && (
        <div style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(74,222,128,0.35)",
          background: "rgba(74,222,128,0.16)",
          color: "var(--green)",
          fontSize: "0.8rem",
          zIndex: 1200,
        }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, sub, tone }) {
  return (
    <div className={`kpi-card ${tone}`} style={{ padding: "12px 14px" }}>
      <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: "1.2rem" }}>{value}</div>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "0.68rem", color: "var(--hint)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}
