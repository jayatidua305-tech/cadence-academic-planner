const STORE_KEY = "smart_cal_companion_v1";
const DEFAULT_CHALLENGE_MINUTES = 30;

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(d) {
  return d.toISOString().split("T")[0];
}

function safeParse() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function createInitialState() {
  const meId = uid("me");
  const defaultCircleId = uid("circle");
  const code = makeInviteCode();
  return {
    profile: {
      id: meId,
      name: "You",
      shareTaskNames: false,
    },
    circles: [
      {
        id: defaultCircleId,
        name: "Focus Circle",
        code,
        members: [
          { id: meId, name: "You", joinedAt: new Date().toISOString(), role: "owner" },
        ],
        createdAt: new Date().toISOString(),
      },
    ],
    currentCircleId: defaultCircleId,
    friendProfiles: [],
    sessions: [],
    groupBlockers: [],
    calendarCache: {},
    challenge: {
      id: "consistency_7_day",
      active: true,
      minutesTarget: DEFAULT_CHALLENGE_MINUTES,
      startedAt: todayStr(),
    },
  };
}

function normalize(state) {
  const fallback = createInitialState();
  if (!state) return fallback;

  const profile = {
    ...fallback.profile,
    ...(state.profile || {}),
  };

  const circles = Array.isArray(state.circles) && state.circles.length
    ? state.circles.map((c) => ({
      ...c,
      members: Array.isArray(c.members) ? c.members : [],
      code: c.code || makeInviteCode(),
      id: c.id || uid("circle"),
      name: c.name || "Focus Circle",
      createdAt: c.createdAt || new Date().toISOString(),
    }))
    : fallback.circles;

  const hasMe = circles.some((c) => c.members.some((m) => m.id === profile.id));
  if (!hasMe) {
    circles[0].members.push({ id: profile.id, name: profile.name || "You", role: "owner", joinedAt: new Date().toISOString() });
  }

  return {
    profile,
    circles,
    currentCircleId: state.currentCircleId || circles[0].id,
    friendProfiles: Array.isArray(state.friendProfiles) ? state.friendProfiles : [],
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    groupBlockers: Array.isArray(state.groupBlockers) ? state.groupBlockers : [],
    calendarCache: state.calendarCache || {},
    challenge: {
      ...fallback.challenge,
      ...(state.challenge || {}),
    },
  };
}

function save(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("companionUpdated"));
}

export function loadCompanionState() {
  return normalize(safeParse());
}

export function updateProfileName(name) {
  const state = loadCompanionState();
  state.profile.name = name?.trim() || "You";
  state.circles = state.circles.map((circle) => ({
    ...circle,
    members: circle.members.map((member) => (
      member.id === state.profile.id ? { ...member, name: state.profile.name } : member
    )),
  }));
  save(state);
  return state;
}

export function setShareTaskNames(enabled) {
  const state = loadCompanionState();
  state.profile.shareTaskNames = !!enabled;
  save(state);
  return state;
}

export function createCircle(name) {
  const state = loadCompanionState();
  const circle = {
    id: uid("circle"),
    name: name?.trim() || `Circle ${state.circles.length + 1}`,
    code: makeInviteCode(),
    members: [{ id: state.profile.id, name: state.profile.name, role: "owner", joinedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  };
  state.circles = [circle, ...state.circles];
  state.currentCircleId = circle.id;
  save(state);
  return state;
}

export function setCurrentCircle(circleId) {
  const state = loadCompanionState();
  if (!state.circles.some((c) => c.id === circleId)) return state;
  state.currentCircleId = circleId;
  save(state);
  return state;
}

function deterministicScore(seed, min, max) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 10000) / 10000;
  return Math.round(min + (max - min) * normalized);
}

export function joinCircle(inviteCode, friendName) {
  const state = loadCompanionState();
  const code = (inviteCode || "").trim().toUpperCase();
  const name = (friendName || "").trim();
  if (!code || !name) {
    throw new Error("Enter both invite code and friend name.");
  }

  const circle = state.circles.find((c) => c.code.toUpperCase() === code);
  if (!circle) {
    throw new Error("Invite code not found in this app instance.");
  }

  const existing = circle.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (existing) return state;

  const friendId = uid("friend");
  circle.members.push({ id: friendId, name, role: "member", joinedAt: new Date().toISOString() });
  state.friendProfiles.push({ id: friendId, name, joinedViaCode: code });
  save(state);
  
  // Auto-generate group focus blocks when new member joins
  autoSuggestGroupBlockers(circle.id);
  
  return state;
}

export function inviteMemberByEmail(circleId, email, displayName) {
  const state = loadCompanionState();
  const cid = circleId || state.currentCircleId;
  const circle = state.circles.find(c => c.id === cid);
  if (!circle) throw new Error("Circle not found");
  
  const cleanEmail = (email || "").trim().toLowerCase();
  const name = (displayName || "").trim() || cleanEmail.split("@")[0];
  
  if (!cleanEmail.includes("@")) throw new Error("Invalid email address");
  
  const existing = circle.members.find(m => m.email?.toLowerCase() === cleanEmail);
  
  // If already invited, just return - will send email again below
  if (existing) {
    return { memberId: existing.id, email: cleanEmail, isResend: true };
  }
  
  const memberId = uid("member");
  circle.members.push({
    id: memberId,
    name,
    email: cleanEmail,
    role: "member",
    joinedAt: new Date().toISOString(),
    googleCalendarToken: null, // Will be set when they authenticate
  });
  
  save(state);
  return { memberId, email: cleanEmail, isResend: false };
}

export function setMemberGoogleCalendarToken(circleId, memberId, token) {
  const state = loadCompanionState();
  const circle = state.circles.find(c => c.id === circleId);
  if (!circle) throw new Error("Circle not found");
  
  const member = circle.members.find(m => m.id === memberId);
  if (!member) throw new Error("Member not found");
  
  member.googleCalendarToken = token;
  save(state);
  return state;
}

export function setCalendarEvents(circleId, memberId, events) {
  const state = loadCompanionState();
  if (!state.calendarCache) state.calendarCache = {};
  state.calendarCache[`${circleId}:${memberId}`] = events;
  save(state);
  return state;
}

export function getCalendarEvents(circleId, memberId) {
  const state = loadCompanionState();
  if (!state.calendarCache) return [];
  return state.calendarCache[`${circleId}:${memberId}`] || [];
}

export function addDemoMembers(circleId) {
  const state = loadCompanionState();
  const circle = state.circles.find((c) => c.id === circleId || c.id === state.currentCircleId);
  if (!circle) return state;

  ["Maya", "Leo", "Noah"].forEach((name) => {
    const exists = circle.members.some((m) => m.name === name);
    if (exists) return;
    const id = uid("friend");
    circle.members.push({ id, name, role: "member", joinedAt: new Date().toISOString() });
    state.friendProfiles.push({ id, name, joinedViaCode: circle.code });
  });

  save(state);
  
  // Auto-generate group focus blocks based on members' focus patterns
  autoSuggestGroupBlockers(circle.id);
  
  return state;
}

export function logFocusSession({ minutes, isGroup = false, circleId = null }) {
  const state = loadCompanionState();
  const targetCircleId = circleId || state.currentCircleId;
  const session = {
    id: uid("session"),
    memberId: state.profile.id,
    memberName: state.profile.name,
    circleId: targetCircleId,
    minutes: Math.max(1, Math.round(minutes || 0)),
    isGroup: !!isGroup,
    date: todayStr(),
    at: new Date().toISOString(),
  };
  state.sessions = [...state.sessions, session].slice(-500);
  save(state);
  return session;
}

export function setChallengeActive(active) {
  const state = loadCompanionState();
  state.challenge.active = !!active;
  if (active && !state.challenge.startedAt) state.challenge.startedAt = todayStr();
  save(state);
  return state;
}

export function suggestGroupBlocker(circleId = null, title = "Group Focus Block", date = null, startTime = "14:00", duration = 60) {
  const state = loadCompanionState();
  const cid = circleId || state.currentCircleId;
  const circle = state.circles.find(c => c.id === cid);
  if (!circle) throw new Error("Circle not found");
  
  const blockDate = date || todayStr();
  const endTime = addMinutesToTime(startTime, duration);
  
  const blocker = {
    id: uid("blocker"),
    circleId: cid,
    title,
    date: blockDate,
    startTime,
    endTime,
    duration,
    suggestedBy: state.profile.id,
    suggestedAt: new Date().toISOString(),
    acceptances: [],
    status: "pending",
  };
  
  state.groupBlockers = [...state.groupBlockers, blocker];
  save(state);
  return blocker;
}

export function acceptGroupBlocker(blockerId, memberId = null) {
  const state = loadCompanionState();
  const mid = memberId || state.profile.id;
  const blocker = state.groupBlockers.find(b => b.id === blockerId);
  if (!blocker) throw new Error("Blocker not found");
  
  const existing = blocker.acceptances.find(a => a.memberId === mid);
  if (existing) return state;
  
  blocker.acceptances.push({ memberId: mid, acceptedAt: new Date().toISOString() });
  
  // If all members accepted, mark as confirmed
  const circle = state.circles.find(c => c.id === blocker.circleId);
  if (circle && blocker.acceptances.length === circle.members.length) {
    blocker.status = "confirmed";
  }
  
  save(state);
  return state;
}

export function rejectGroupBlocker(blockerId) {
  const state = loadCompanionState();
  const blocker = state.groupBlockers.find(b => b.id === blockerId);
  if (!blocker) throw new Error("Blocker not found");
  blocker.status = "rejected";
  save(state);
  return state;
}

export function renameGroupBlocker(blockerId, newTitle) {
  const state = loadCompanionState();
  const blocker = state.groupBlockers.find(b => b.id === blockerId);
  if (!blocker) throw new Error("Blocker not found");
  blocker.title = newTitle.trim() || blocker.title;
  save(state);
  return state;
}

export function reorderCircle(circleId, direction) {
  const state = loadCompanionState();
  const idx = state.circles.findIndex(c => c.id === circleId);
  if (idx === -1) return state;
  const newIdx = direction === "up" ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= state.circles.length) return state;
  const circles = [...state.circles];
  [circles[idx], circles[newIdx]] = [circles[newIdx], circles[idx]];
  state.circles = circles;
  save(state);
  return state;
}

export function getCommonAvailabilityBlocks(circleId = null) {
  const state = loadCompanionState();
  const cid = circleId || state.currentCircleId;
  const circle = state.circles.find(c => c.id === cid);
  if (!circle) return [];
  
  // For now, return suggested blockers in the circle (this would integrate with friend calendars)
  return state.groupBlockers.filter(b => b.circleId === cid && b.status === "pending");
}

export function autoSuggestGroupBlockers(circleId = null, userCalendarEvents = []) {
  const state = loadCompanionState();
  const cid = circleId || state.currentCircleId;
  const circle = state.circles.find(c => c.id === cid);
  if (!circle || circle.members.length < 2) return [];

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];

  // If calendar events provided (from Google Calendar), use them to find free slots
  if (userCalendarEvents && userCalendarEvents.length > 0) {
    return suggestFromCalendarData(state, circle, userCalendarEvents);
  }

  // Fallback: Analyze focus session history
  const focusHours = {};
  state.sessions
    .filter(s => s.circleId === cid && s.date >= twoWeeksAgoStr)
    .forEach(s => {
      const time = new Date(s.at);
      const hour = time.getHours();
      focusHours[hour] = (focusHours[hour] || 0) + 1;
    });

  const topHours = Object.entries(focusHours)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([h]) => parseInt(h));

  if (topHours.length === 0) {
    topHours.push(9, 14, 16);
  }

  const suggestions = [];
  const now2 = new Date();
  const nextWeek = 7;
  let suggestionCount = 0;
  const MAX_SUGGESTIONS = 3;

  // Generate only 2-3 suggestions for the week
  for (let dayOffset = 1; dayOffset <= nextWeek && suggestionCount < MAX_SUGGESTIONS; dayOffset++) {
    const suggestDate = new Date(now2.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const suggestDateStr = suggestDate.toISOString().split("T")[0];

    const hourIndex = dayOffset % topHours.length;
    const hour = topHours[hourIndex];
    const startTime = `${String(hour).padStart(2, "0")}:00`;

    const alreadySuggested = state.groupBlockers.some(
      b => b.circleId === cid && b.date === suggestDateStr && b.startTime === startTime && b.status !== "rejected"
    );

    if (!alreadySuggested) {
      const blocker = {
        id: uid("blocker"),
        circleId: cid,
        title: "Group Focus Session",
        date: suggestDateStr,
        startTime,
        endTime: addMinutesToTime(startTime, 60),
        duration: 60,
        suggestedBy: state.profile.id,
        suggestedAt: new Date().toISOString(),
        acceptances: [],
        status: "pending",
        autoGenerated: true,
      };
      state.groupBlockers.push(blocker);
      suggestions.push(blocker);
      suggestionCount++;
    }
  }

  save(state);
  return suggestions;
}

function suggestFromCalendarData(state, circle, userCalendarEvents) {
  const suggestions = [];
  const now = new Date();
  const MAX_SUGGESTIONS = 3;
  const FOCUS_SLOT_DURATION = 60; // 60 minutes

  // Build busy times map from calendar events
  const busyTimes = {};
  userCalendarEvents.forEach(event => {
    const eventDate = event.start.dateTime 
      ? event.start.dateTime.split("T")[0]
      : event.start.date;
    
    if (!busyTimes[eventDate]) busyTimes[eventDate] = [];
    
    const startHour = new Date(event.start.dateTime || event.start.date).getHours();
    const endHour = new Date(event.end.dateTime || event.end.date).getHours();
    
    for (let h = startHour; h < endHour; h++) {
      busyTimes[eventDate].push(h);
    }
  });

  // Find free slots for next 7 days
  for (let dayOffset = 1; dayOffset <= 7 && suggestions.length < MAX_SUGGESTIONS; dayOffset++) {
    const checkDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const checkDateStr = checkDate.toISOString().split("T")[0];
    const dayOfWeek = checkDate.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const busyHours = busyTimes[checkDateStr] || [];

    // Suggest good focus hours (9 AM, 2 PM, 4 PM) if free
    const preferredHours = [9, 14, 16];
    for (const hour of preferredHours) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;

      const isBusy = busyHours.includes(hour);
      if (isBusy) continue;

      const startTime = `${String(hour).padStart(2, "0")}:00`;
      const alreadySuggested = state.groupBlockers.some(
        b => b.circleId === circle.id && b.date === checkDateStr && b.startTime === startTime && b.status !== "rejected"
      );

      if (!alreadySuggested) {
        const blocker = {
          id: uid("blocker"),
          circleId: circle.id,
          title: "Group Focus Session",
          date: checkDateStr,
          startTime,
          endTime: addMinutesToTime(startTime, FOCUS_SLOT_DURATION),
          duration: FOCUS_SLOT_DURATION,
          suggestedBy: state.profile.id,
          suggestedAt: new Date().toISOString(),
          acceptances: [],
          status: "pending",
          autoGenerated: true,
        };
        state.groupBlockers.push(blocker);
        suggestions.push(blocker);
      }
    }
  }

  save(state);
  return suggestions;
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function getUserDailyMinutes(state, circleId, days = 7) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  const daily = {};
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    daily[toDateString(d)] = 0;
  }

  state.sessions
    .filter((s) => s.memberId === state.profile.id && (!circleId || s.circleId === circleId))
    .forEach((s) => {
      if (daily[s.date] !== undefined) daily[s.date] += s.minutes;
    });

  return daily;
}

function computeStreakFromDaily(dailyMap, threshold = 1) {
  const dates = Object.keys(dailyMap).sort();
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    if ((dailyMap[dates[i]] || 0) >= threshold) streak += 1;
    else break;
  }
  return streak;
}

export function getCompanionSummary(options = {}) {
  const { state: providedState, completed = 0 } = options;
  const state = providedState || loadCompanionState();
  const currentCircle = state.circles.find((c) => c.id === state.currentCircleId) || state.circles[0];

  const ws = weekStart();
  const wsStr = toDateString(ws);

  const userWeekSessions = state.sessions.filter((s) => (
    s.memberId === state.profile.id
    && s.circleId === currentCircle.id
    && s.date >= wsStr
  ));

  const userFocusMinutes = userWeekSessions.reduce((sum, s) => sum + s.minutes, 0);
  const userDaily = getUserDailyMinutes(state, currentCircle.id, 7);
  const userStreak = computeStreakFromDaily(userDaily, 1);

  const members = currentCircle.members.map((member) => {
    if (member.id === state.profile.id) {
      return {
        id: member.id,
        name: member.name,
        focusMinutes: userFocusMinutes,
        tasksCompleted: completed || 0,
        streak: userStreak,
        isYou: true,
      };
    }

    const seed = `${member.name}-${wsStr}-${currentCircle.code}`;
    return {
      id: member.id,
      name: member.name,
      focusMinutes: deterministicScore(`${seed}-focus`, 90, 520),
      tasksCompleted: deterministicScore(`${seed}-tasks`, 3, 24),
      streak: deterministicScore(`${seed}-streak`, 1, 7),
      isYou: false,
    };
  });

  const leaderboard = members.sort((a, b) => {
    if (b.focusMinutes !== a.focusMinutes) return b.focusMinutes - a.focusMinutes;
    if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted;
    return b.streak - a.streak;
  });

  const challengeTarget = state.challenge.minutesTarget || DEFAULT_CHALLENGE_MINUTES;
  const challengeDays = Object.entries(userDaily).map(([date, minutes]) => ({
    date,
    minutes,
    met: minutes >= challengeTarget,
  }));

  const completedChallengeDays = challengeDays.filter((d) => d.met).length;

  return {
    state,
    currentCircle,
    leaderboard,
    userFocusMinutes,
    challengeDays,
    completedChallengeDays,
    challengeTarget,
    activity: state.sessions
      .filter((s) => s.circleId === currentCircle.id)
      .slice(-8)
      .reverse(),
  };
}

export function removeMemberFromCircle(circleId, memberId) {
  const state = loadCompanionState();
  const circle = state.circles.find(c => c.id === circleId);
  if (!circle) throw new Error("Circle not found");
  
  // Check if current user is admin (owner)
  const userMember = circle.members.find(m => m.id === state.profile.id);
  if (!userMember || userMember.role !== "owner") {
    throw new Error("Only circle admin can remove members");
  }
  
  // Prevent removing the owner
  const memberToRemove = circle.members.find(m => m.id === memberId);
  if (memberToRemove?.role === "owner") {
    throw new Error("Cannot remove circle owner");
  }
  
  // Remove the member
  circle.members = circle.members.filter(m => m.id !== memberId);
  
  // Remove from friend profiles
  state.friendProfiles = state.friendProfiles.filter(f => f.id !== memberId);
  
  save(state);
  return state;
}

export function leaveCircle(circleId) {
  const state = loadCompanionState();
  const circle = state.circles.find(c => c.id === circleId);
  if (!circle) throw new Error("Circle not found");
  
  const userMember = circle.members.find(m => m.id === state.profile.id);
  if (!userMember) throw new Error("You are not a member of this circle");
  
  // Prevent owner from leaving if they're the only owner
  if (userMember.role === "owner") {
    const otherOwners = circle.members.filter(m => m.role === "owner" && m.id !== state.profile.id);
    if (otherOwners.length === 0) {
      throw new Error("Circle owner cannot leave - transfer ownership first or delete the circle");
    }
  }
  
  // Remove user from circle
  circle.members = circle.members.filter(m => m.id !== state.profile.id);
  
  // If leaving current circle, switch to another circle if available
  if (state.currentCircleId === circleId) {
    const otherCircles = state.circles.filter(c => c.members.some(m => m.id === state.profile.id));
    if (otherCircles.length > 0) {
      state.currentCircleId = otherCircles[0].id;
    } else {
      // User has no other circles, create a default one
      const newCircle = {
        id: uid("circle"),
        name: "Focus Circle",
        code: makeInviteCode(),
        members: [{ id: state.profile.id, name: state.profile.name, role: "owner", joinedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      };
      state.circles.unshift(newCircle);
      state.currentCircleId = newCircle.id;
    }
  }
  
  save(state);
  return state;
}

export function deleteCircle(circleId) {
  const state = loadCompanionState();
  const circle = state.circles.find(c => c.id === circleId);
  if (!circle) throw new Error("Circle not found");

  const userMember = circle.members.find(m => m.id === state.profile.id);
  if (!userMember || userMember.role !== "owner") {
    throw new Error("Only the circle owner can delete it");
  }

  state.circles = state.circles.filter(c => c.id !== circleId);
  state.sessions = state.sessions.filter(s => s.circleId !== circleId);

  if (state.currentCircleId === circleId) {
    if (state.circles.length > 0) {
      state.currentCircleId = state.circles[0].id;
    } else {
      const newCircle = {
        id: uid("circle"),
        name: "Focus Circle",
        code: makeInviteCode(),
        members: [{ id: state.profile.id, name: state.profile.name, role: "owner", joinedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      };
      state.circles.push(newCircle);
      state.currentCircleId = newCircle.id;
    }
  }

  save(state);
  return state;
}
