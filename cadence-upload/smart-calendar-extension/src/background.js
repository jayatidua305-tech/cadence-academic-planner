// src/background.js
// Service worker — notifications + Blackboard syllabus parsing + Google Calendar sync.

const APP_URL = "http://localhost:3000";
const AI_PROXY_URL = "http://localhost:3001/api/ai";
const CAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  updateBadge();
});

function setupAlarms() {
  chrome.alarms.create("check-tasks", { periodInMinutes: 1 });
  chrome.alarms.create("update-badge", { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-tasks") checkUpcomingTasks();
  if (alarm.name === "update-badge") updateBadge();
});

function getAppData(callback) {
  chrome.tabs.query({ url: APP_URL + "/*" }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_DATA" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          chrome.storage.local.get(["schedule", "completedKeys", "events", "googleToken", "googleExpiry"], callback);
        } else {
          callback(response);
        }
      });
    } else {
      chrome.storage.local.get(["schedule", "completedKeys", "events", "googleToken", "googleExpiry"], callback);
    }
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function executeContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: ["src/content.js"] },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(true);
      }
    );
  });
}

function queryAppTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: APP_URL + "/*" }, (tabs) => resolve(tabs || []));
  });
}

async function ensureAppBridge(tabId) {
  try {
    const data = await sendMessageToTab(tabId, { type: "GET_DATA" });
    return data || null;
  } catch (err) {
    if (!String(err.message || "").includes("Receiving end does not exist")) throw err;
    await executeContentScript(tabId);
    const data = await sendMessageToTab(tabId, { type: "GET_DATA" });
    return data || null;
  }
}

async function getLatestAppData() {
  const tabs = await queryAppTabs();
  if (!tabs.length) return null;
  const tab = tabs[0];
  try {
    return await ensureAppBridge(tab.id);
  } catch {
    return null;
  }
}

async function importEventsViaApp(events) {
  let tabs = await queryAppTabs();
  let targetTab = tabs[0];

  // If app isn't open, open it and wait briefly for load + content script.
  if (!targetTab) {
    targetTab = await new Promise((resolve) => {
      chrome.tabs.create({ url: APP_URL }, (tab) => resolve(tab));
    });
    await new Promise((r) => setTimeout(r, 1800));
  }

  try {
    await ensureAppBridge(targetTab.id);
    const resp = await sendMessageToTab(targetTab.id, { type: "IMPORT_EVENTS", events });
    return resp || { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function updateBadge() {
  getAppData((data) => {
    if (!data?.schedule?.schedule) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const completedKeys = new Set(data.completedKeys || []);
    const completedTitles = new Set(
      [...completedKeys].map((k) => String(k).replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "").toLowerCase())
    );

    const todaySlots = (data.schedule.schedule || []).filter((s) => {
      if (s.date !== today || s.isBuffer) return false;
      const title = (s.taskTitle || s.title || "").toLowerCase();
      return !completedTitles.has(title);
    });

    const count = todaySlots.length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({
      color: count > 3 ? "#f87171" : count > 0 ? "#fbbf24" : "#4ade80",
    });
  });
}

let notifiedSlots = new Set();

function checkUpcomingTasks() {
  getAppData((data) => {
    if (!data?.schedule?.schedule) return;

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const completedKeys = new Set(data.completedKeys || []);
    const completedTitles = new Set(
      [...completedKeys].map((k) => String(k).replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "").toLowerCase())
    );

    const upcoming = (data.schedule.schedule || []).filter((s) => {
      if (s.date !== today || s.isBuffer) return false;
      if (!s.startTime) return false;
      const [h, m] = s.startTime.split(":").map(Number);
      const slotMins = h * 60 + m;
      return slotMins - nowMins >= 9 && slotMins - nowMins <= 11;
    });

    upcoming.forEach((slot) => {
      const key = `${slot.date}-${slot.startTime}-${slot.taskTitle}`;
      if (notifiedSlots.has(key)) return;
      notifiedSlots.add(key);

      const energyEmoji = slot.energyMatch === "peak" ? "🔥" : slot.energyMatch === "low" ? "🌊" : "⚡";

      chrome.notifications.create(key, {
        type: "basic",
        iconUrl: "../icons/icon128.png",
        title: "⏰ Starting in 10 min",
        message: `${energyEmoji} ${slot.taskTitle}\n${slot.startTime} – ${slot.endTime} · ${slot.energyMatch} energy`,
        buttons: [{ title: "✅ Mark Done" }, { title: "Open App" }],
        priority: 2,
      });
    });

    const overdue = (data.schedule.schedule || []).filter((s) => {
      if (s.date !== today || s.isBuffer) return false;
      if (!s.endTime) return false;
      const [h, m] = s.endTime.split(":").map(Number);
      const endMins = h * 60 + m;
      const title = (s.taskTitle || s.title || "").toLowerCase();
      return endMins < nowMins && !completedTitles.has(title);
    });

    overdue.forEach((slot) => {
      const overdueKey = `overdue-${slot.date}-${slot.taskTitle}`;
      if (notifiedSlots.has(overdueKey)) return;
      notifiedSlots.add(overdueKey);

      chrome.notifications.create(overdueKey, {
        type: "basic",
        iconUrl: "../icons/icon128.png",
        title: "⚠️ Slot ended — did you finish?",
        message: `${slot.taskTitle} was scheduled ${slot.startTime}–${slot.endTime}`,
        buttons: [{ title: "✅ Yes, Done!" }, { title: "⏭ Skip" }],
        priority: 1,
      });
    });
  });
}

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (btnIdx === 0) {
    chrome.storage.local.get(["completedKeys"], (data) => {
      const keys = new Set(data.completedKeys || []);
      const taskKey = notifId.replace("overdue-", "");
      keys.add(taskKey);
      chrome.storage.local.set({ completedKeys: [...keys] });

      chrome.tabs.query({ url: APP_URL + "/*" }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "MARK_DONE", key: taskKey });
        }
      });
      updateBadge();
    });
  } else {
    chrome.tabs.create({ url: APP_URL });
  }
  chrome.notifications.clear(notifId);
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});

function stripCodeFences(text) {
  return String(text || "").replace(/```json|```/gi, "").trim();
}

function safeJsonArray(text) {
  const cleaned = stripCodeFences(text);
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

function normalizeEvent(e, fallbackCourse) {
  const title = (e.title || e.taskTitle || "Untitled").trim();
  const type = (e.type || "assignment").toLowerCase();
  const dueDate = e.dueDate || e.date || null;
  if (!dueDate) return null;

  return {
    title,
    type,
    dueDate,
    dueTime: e.dueTime || e.startTime || null,
    date: e.date || e.dueDate || dueDate,
    startTime: e.startTime || e.dueTime || null,
    endTime: e.endTime || null,
    course: e.course || fallbackCourse || "Blackboard",
    priority: (e.priority || "medium").toLowerCase(),
    estimatedHours: Number(e.estimatedHours || 1),
    description: (e.description || "").slice(0, 300),
    source: "blackboard-extension",
  };
}

async function parseBlackboardSyllabus(payload) {
  const systemPrompt = `You are an academic calendar extraction assistant.
Extract assignment/exam/quiz/project/reading deadlines from Blackboard syllabus text.
Return ONLY a valid JSON array.
Each item: {"title":"string","type":"assignment|exam|quiz|project|reading|other","dueDate":"YYYY-MM-DD","dueTime":"HH:MM or null","course":"string","priority":"high|medium|low","estimatedHours":number,"description":"string"}`;

  const userMessage = `Course: ${payload.courseName || "Unknown"}
Page: ${payload.pageTitle || "Blackboard"}
URL: ${payload.pageUrl || "unknown"}
Links: ${JSON.stringify(payload.links || [])}
Today: ${new Date().toISOString().split("T")[0]}

Syllabus/Page Text:
${payload.text || ""}`;

  const response = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt,
      userMessage,
      maxTokens: 3000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "AI parsing failed");
  }

  const data = await response.json();
  const parsed = safeJsonArray(data.text || "");
  const normalized = parsed
    .map((e) => normalizeEvent(e, payload.courseName))
    .filter(Boolean)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  return normalized;
}

async function parseBlackboardPdfSyllabus(payload) {
  const systemPrompt = `You are an academic calendar extraction assistant.
Extract assignment/exam/quiz/project/reading deadlines from a syllabus PDF.
Return ONLY a valid JSON array.
Each item: {"title":"string","type":"assignment|exam|quiz|project|reading|other","dueDate":"YYYY-MM-DD","dueTime":"HH:MM or null","course":"string","priority":"high|medium|low","estimatedHours":number,"description":"string"}`;

  const textPrompt = `Course: ${payload.courseName || "Unknown"}
PDF URL: ${payload.pdfUrl || "unknown"}
Today: ${new Date().toISOString().split("T")[0]}
Extract all actionable deadlines from this PDF.`;

  const response = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt,
      textPrompt,
      hasFile: true,
      mediaType: payload.mediaType || "application/pdf",
      base64Data: payload.base64Data,
      maxTokens: 3000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "AI PDF parsing failed");
  }

  const data = await response.json();
  const parsed = safeJsonArray(data.text || "");
  const normalized = parsed
    .map((e) => normalizeEvent(e, payload.courseName))
    .filter(Boolean)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  return normalized;
}

function addHours(timeStr, hours) {
  const [h, m] = String(timeStr || "09:00").split(":").map(Number);
  const total = h + Math.max(1, Math.ceil(hours || 1));
  return `${String(Math.min(total, 23)).padStart(2, "0")}:${String(Number.isNaN(m) ? 0 : m).padStart(2, "0")}`;
}

function formatEventForGCal(event) {
  const date = event.date || event.dueDate;
  const startTime = event.startTime || event.dueTime || "09:00";
  const endTime = event.endTime || addHours(startTime, event.estimatedHours || 1);

  const descParts = [];
  if (event.description) descParts.push(event.description);
  if (event.course) descParts.push(`Course: ${event.course}`);
  if (event.priority) descParts.push(`Priority: ${event.priority}`);
  descParts.push("— Added by Smart Calendar Blackboard Extension");

  return {
    summary: event.title,
    description: descParts.join("\n"),
    colorId: ({ high: "11", medium: "5", low: "2" })[event.priority] || "1",
    start: {
      dateTime: `${date}T${startTime}:00`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: `${date}T${endTime}:00`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

async function syncEventsToGoogleCalendar(events, token) {
  const results = { success: [], failed: [] };

  for (const event of events) {
    try {
      const payload = formatEventForGCal(event);
      const response = await fetch(CAL_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || "Failed to create event");
      }

      const created = await response.json();
      results.success.push({ title: event.title, link: created.htmlLink });
    } catch (err) {
      results.failed.push({ title: event.title, error: err.message });
    }
  }

  return results;
}

function importEventsIntoApp(events, callback) {
  importEventsViaApp(events).then((result) => callback(result));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SYNC_DATA") {
    chrome.storage.local.set({
      schedule: msg.schedule,
      completedKeys: msg.completedKeys,
      events: msg.events,
      energyPattern: msg.energyPattern,
      googleToken: msg.googleToken || null,
      googleExpiry: msg.googleExpiry || 0,
      lastSync: new Date().toISOString(),
    });
    updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "UPDATE_BADGE") {
    updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "PARSE_BLACKBOARD_SYLLABUS") {
    parseBlackboardSyllabus(msg.payload || {})
      .then((events) => {
        chrome.storage.local.set({ lastParsedSyllabusEvents: events, lastParsedAt: new Date().toISOString() });
        sendResponse({ ok: true, events });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "PARSE_BLACKBOARD_PDF_BASE64") {
    parseBlackboardPdfSyllabus(msg.payload || {})
      .then((events) => sendResponse({ ok: true, events }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "SYNC_PARSED_TO_GCAL") {
    chrome.storage.local.get(["googleToken", "googleExpiry"], async (data) => {
      let token = data.googleToken;
      let expiry = Number(data.googleExpiry || 0);

      // Refresh token cache from app tab if available (handles extension reload cases).
      if (!token || (expiry && Date.now() >= expiry)) {
        const appData = await getLatestAppData();
        if (appData?.googleToken) {
          token = appData.googleToken;
          expiry = Number(appData.googleExpiry || 0);
          chrome.storage.local.set({ googleToken: token, googleExpiry: expiry });
        }
      }

      if (!token || (expiry && Date.now() >= expiry)) {
        sendResponse({
          ok: false,
          error: "Google token missing/expired. Open Smart Calendar app, reconnect Google Calendar, then retry.",
        });
        return;
      }

      try {
        const events = Array.isArray(msg.events) ? msg.events : [];
        const results = await syncEventsToGoogleCalendar(events, token);
        sendResponse({ ok: true, results });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (msg.type === "IMPORT_EVENTS_TO_APP") {
    importEventsIntoApp(msg.events || [], (result) => sendResponse(result));
    return true;
  }

  if (msg.type === "OPEN_APP") {
    chrome.tabs.create({ url: APP_URL });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
