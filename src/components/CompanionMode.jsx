import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./UILibrary";
import { getStats } from "../utils/completionStore";
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
  setChallengeActive,
  setCurrentCircle,
  setMemberGoogleCalendarToken,
  setShareTaskNames,
  suggestGroupBlocker,
  updateProfileName,
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
        {["circles", "focus", "leaderboard", "activity"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: tab === "leaderboard" ? 1 : "0 1 auto",
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
            {tab === "leaderboard" && "🏆 Stats"}
            {tab === "activity" && "🗞 Activity"}
          </button>
        ))}
      </div>

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
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 8 }}>Your circles</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {state.circles.map((circle) => (
                <Button
                  key={circle.id}
                  variant={circle.id === state.currentCircleId ? "primary" : "secondary"}
                  onClick={() => {
                    setCurrentCircle(circle.id);
                    refresh();
                  }}
                  style={{
                    justifyContent:"space-between",
                  }}
                >
                  <span>{circle.name}</span>
                  <span style={{fontSize:"0.68rem",fontFamily:"JetBrains Mono",color:"var(--hint)"}}>
                    code {circle.code}
                  </span>
                </Button>
              ))}
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
                
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      const unconnectedMembers = circle?.members?.filter(m => m.email && !m.googleCalendarToken) || [];
                      if (unconnectedMembers.length > 0) {
                        setToast(`⏳ Waiting for ${unconnectedMembers.length} member(s) to connect Google Calendar...`);
                      } else {
                        const suggestions = autoSuggestGroupBlockers(summary.currentCircle?.id);
                        if (suggestions.length === 0) {
                          setToast("⏳ Suggestions already exist for this week");
                        } else {
                          setToast(`🤖 Generated ${suggestions.length} optimal blocks!`);
                        }
                      }
                      setTimeout(() => setToast(""), 2500);
                      refresh();
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  style={{
                    fontSize: "0.85rem",
                    background: "rgba(99,102,241,0.15)",
                    borderColor: "rgba(99,102,241,0.3)",
                    color: "#6366f1",
                  }}
                >
                  🤖 Auto-Suggest (2-3)
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
                        <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 6 }}>
                          {allAccepted ? "✅" : "⏳"} {blocker.title} {blocker.autoGenerated && <span style={{ fontSize: "0.75rem", color: "#6366f1" }}>🤖</span>}
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

      {/* LEADERBOARD & CHALLENGE TAB */}
      {activeTab === "leaderboard" && (
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
      )}

      {/* ACTIVITY TAB */}
      {activeTab === "activity" && (
      <div className="card">
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
