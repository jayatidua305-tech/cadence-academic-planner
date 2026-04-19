// src/hooks/useGoogleCalendar.js
// Auto-connects on app load using stored credentials — no manual connect needed after first time

import { useState, useCallback, useEffect, useRef } from "react";

const CLIENT_ID   = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES      = "https://www.googleapis.com/auth/calendar.events";
const CAL_API     = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_KEY   = "smart_cal_google_token";
const EXPIRY_KEY  = "smart_cal_google_expiry";
const REFRESH_MS  = 45 * 60 * 1000; // refresh token every 45 min (expires in 60)

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, Date.now() + 55 * 60 * 1000); // 55 min
}

function loadToken() {
  const token  = localStorage.getItem(TOKEN_KEY);
  const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || "0");
  if (token && Date.now() < expiry) return token;
  return null;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function useGoogleCalendar() {
  const [isConnected,  setIsConnected]  = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing,    setIsSyncing]    = useState(false);
  const [error,        setError]        = useState(null);
  const [syncResult,   setSyncResult]   = useState(null);
  const [fetchedEvents, setFetchedEvents] = useState([]);
  const tokenClientRef                  = useRef(null);
  const refreshTimerRef                 = useRef(null);
  const initTriedRef                    = useRef(false);

  // ── Auto-restore token + setup silent refresh ─────────────────────────────
  useEffect(() => {
    // Check if we have a valid stored token
    const stored = loadToken();
    if (stored) {
      window._googleAccessToken = stored;
      setIsConnected(true);
      setIsConnecting(false);
    }

    let cancelled = false;
    let safetyTimeout = null;

    const initClient = () => {
      if (cancelled) return false;
      if (!window.google?.accounts?.oauth2 || !CLIENT_ID) return false;
      if (tokenClientRef.current) return true;

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          setIsConnecting(false);
          if (response.error) {
            // Silent refresh/manual connect failed — allow retry
            clearToken();
            setIsConnected(false);
            setError(response.error_description || response.error || "Google sign-in failed.");
          } else {
            window._googleAccessToken = response.access_token;
            saveToken(response.access_token);
            setIsConnected(true);
            setError(null);
            scheduleRefresh(client);
          }
        },
      });

      tokenClientRef.current = client;
      return true;
    };

    // Wait for Google Identity Services to load (with safety timeout)
    const interval = setInterval(() => {
      if (!initClient()) return;
      clearInterval(interval);

      const client = tokenClientRef.current;

      // If we have a stored token, set up refresh timer
      if (stored) {
        setIsConnecting(false);
        scheduleRefresh(client);
      } else {
        // First-time users should manually click Connect
        setIsConnecting(false);
      }
    }, 300);

    safetyTimeout = setTimeout(() => {
      if (cancelled) return;
      if (!tokenClientRef.current) {
        setIsConnecting(false);
        setError("Google services not loaded yet. Refresh and try Connect Google Cal.");
      }
    }, 7000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  function scheduleRefresh(client) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      // Silent token refresh — no popup
      try { client.requestAccessToken({ prompt: "" }); } catch {}
    }, REFRESH_MS);
  }

  // ── Manual connect (first time, or after disconnect) ─────────────────────
  const connect = useCallback(() => {
    let client = tokenClientRef.current;
    if (!client && !initTriedRef.current && window.google?.accounts?.oauth2 && CLIENT_ID) {
      initTriedRef.current = true;
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          setIsConnecting(false);
          if (response.error) {
            clearToken();
            setIsConnected(false);
            setError(response.error_description || response.error || "Google sign-in failed.");
          } else {
            window._googleAccessToken = response.access_token;
            saveToken(response.access_token);
            setIsConnected(true);
            setError(null);
            scheduleRefresh(tokenClientRef.current);
          }
        },
      });
      tokenClientRef.current = client;
    }

    if (!client) {
      setError("Google services not loaded yet. Refresh the app and try again.");
      setIsConnecting(false);
      return;
    }
    setIsConnecting(true);
    setError(null);
    client.requestAccessToken({ prompt: "consent" });
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (window._googleAccessToken) {
      window.google?.accounts?.oauth2?.revoke(window._googleAccessToken);
      window._googleAccessToken = null;
    }
    clearToken();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setIsConnected(false);
    setSyncResult(null);
    setError(null);
  }, []);

  // ── Fetch events from Google Calendar ───────────────────────────────────
  const fetchCalendarEvents = useCallback(async () => {
    if (!window._googleAccessToken) {
      setError("Not connected to Google Calendar.");
      return [];
    }

    setIsSyncing(true);
    setError(null);

    try {
      // Fetch events from the past 7 days to today + next 60 days
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 60);

      const response = await fetch(
        `${CAL_API}?` +
        `timeMin=${startDate.toISOString()}&` +
        `timeMax=${endDate.toISOString()}&` +
        `singleEvents=true&` +
        `orderBy=startTime&` +
        `showDeleted=false`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${window._googleAccessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 401) {
        clearToken();
        setIsConnected(false);
        window._googleAccessToken = null;
        throw new Error("Session expired. Please reconnect.");
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to fetch calendar events");
      }

      const data = await response.json();
      const events = (data.items || []).map((event) => {
        // If this event was pushed by Cadence, recover its original source +
        // metadata from extendedProperties. Otherwise it's a genuine Google
        // Calendar event that didn't come from us.
        const priv = event.extendedProperties?.private || {};
        const originalSource = priv.cadenceSource || null;

        return {
          id: event.id,
          title: event.summary || "(No title)",
          // Prefer the original source so a course deadline round-tripped
          // through Google still shows the maroon 🎓 pill.
          source: originalSource || "google-calendar",
          type:       priv.cadenceOriginType || undefined,
          priority:   priv.cadencePriority   || undefined,
          course:     priv.cadenceCourse     || undefined,
          energyMatch: priv.cadenceEnergyMatch || undefined,
          date: event.start.date || event.start.dateTime?.split("T")[0],
          startTime: event.start.dateTime
            ? event.start.dateTime.split("T")[1]?.substring(0, 5)
            : null,
          endTime: event.end.dateTime
            ? event.end.dateTime.split("T")[1]?.substring(0, 5)
            : null,
          isAllDay: !!event.start.date,
          description: event.description || "",
        };
      });

      setFetchedEvents(events);
      setIsSyncing(false);
      return events;
    } catch (err) {
      setError(err.message);
      setIsSyncing(false);
      return [];
    }
  }, []);

  // ── Sync events to Google Calendar (idempotent) ──────────────────────────
  // Each slot gets a deterministic ID derived from title + date + startTime.
  // Re-syncing the same slot UPDATES the existing event instead of creating
  // a duplicate. If the slot is edited (time moved), the update flows through
  // because the title + date part of the ID is stable.
  //
  // If the user changes a slot's start time, the ID changes — the old event
  // is left in place (orphaned) and a new one is created. The "Clean up
  // duplicates" button below sweeps those.
  const syncToCalendar = useCallback(async (events) => {
    if (!window._googleAccessToken) {
      setError("Not connected to Google Calendar.");
      return;
    }
    if (!events?.length) { setError("No events to sync."); return; }

    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    const results = { success: [], failed: [], updated: 0, created: 0 };

    for (const event of events) {
      try {
        const eventId   = slotId(event);
        const gcalEvent = formatEventForGCal(event, eventId);

        // Try PATCH first — succeeds if the event already exists, lets us
        // update title/time/description in place.
        let response = await fetch(`${CAL_API}/${eventId}`, {
          method: "PATCH",
          headers: {
            Authorization:  `Bearer ${window._googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(gcalEvent),
        });

        let wasUpdate = response.ok;

        // 404 = no such event yet → fall through to POST (create).
        if (response.status === 404) {
          response = await fetch(CAL_API, {
            method: "POST",
            headers: {
              Authorization:  `Bearer ${window._googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(gcalEvent),
          });
          wasUpdate = false;
        }

        // 410 = cancelled/tombstoned event → restore with PUT (requires full body + status=confirmed).
        if (response.status === 410) {
          response = await fetch(`${CAL_API}/${eventId}`, {
            method: "PUT",
            headers: {
              Authorization:  `Bearer ${window._googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...gcalEvent, status: "confirmed" }),
          });
          wasUpdate = true;
        }

        if (response.status === 401) {
          clearToken();
          setIsConnected(false);
          window._googleAccessToken = null;
          throw new Error("Session expired. Reconnecting automatically...");
        }

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || "Failed to sync event");
        }

        const saved = await response.json();
        if (wasUpdate) results.updated++; else results.created++;
        results.success.push({ title: event.title, link: saved.htmlLink, mode: wasUpdate ? "updated" : "created" });
      } catch (err) {
        results.failed.push({ title: event.title, error: err.message });
        if (err.message.includes("expired")) break;
      }
    }

    setSyncResult(results);
    setIsSyncing(false);
    return results;
  }, []);

  // ── Clean up: delete all Cadence-created events from Google Calendar ─────
  // Scans the next 120 days for events whose ID starts with our prefix OR
  // whose description was stamped by older sync versions, and deletes them.
  // Useful for clearing out pre-deterministic-ID duplicates.
  const cleanupCalendar = useCallback(async () => {
    if (!window._googleAccessToken) {
      setError("Not connected to Google Calendar.");
      return;
    }

    setIsSyncing(true);
    setError(null);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 120);

    const results = { deleted: 0, failed: 0 };

    try {
      const response = await fetch(
        `${CAL_API}?` +
        `timeMin=${startDate.toISOString()}&` +
        `timeMax=${endDate.toISOString()}&` +
        `singleEvents=true&` +
        `maxResults=2500&` +
        `showDeleted=false`,
        { headers: { Authorization: `Bearer ${window._googleAccessToken}` } }
      );

      if (!response.ok) throw new Error("Failed to fetch events for cleanup.");

      const data = await response.json();
      // Match Cadence-created events by ID prefix OR description footer.
      const cadenceEvents = (data.items || []).filter((e) => {
        if (e.id?.startsWith(ID_PREFIX)) return true;
        const desc = e.description || "";
        return desc.includes("— Added by Smart Calendar AI") ||
               desc.includes("— Added by Cadence");
      });

      for (const ev of cadenceEvents) {
        try {
          const del = await fetch(`${CAL_API}/${ev.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${window._googleAccessToken}` },
          });
          if (del.ok || del.status === 410) results.deleted++;
          else results.failed++;
        } catch {
          results.failed++;
        }
      }
    } catch (err) {
      setError(err.message);
    }

    setIsSyncing(false);
    setSyncResult({ cleanup: results, success: [], failed: [] });
    return results;
  }, []);

  return {
    isConnected,
    isConnecting,
    isSyncing,
    error,
    syncResult,
    fetchedEvents,
    connect,
    disconnect,
    fetchCalendarEvents,
    syncToCalendar,
    cleanupCalendar,
  };
}

// ── Deterministic ID ──────────────────────────────────────────────────────
// Google Calendar event IDs must be base32hex (0-9 and a-v), 5-1024 chars.
// We hash title + date + startTime via FNV-1a 64-bit → base32hex, prefixed
// to make Cadence events easy to recognize for cleanup.
const ID_PREFIX = "cad";

function slotId(event) {
  const title = (event.title || event.taskTitle || "").toLowerCase().trim();
  const date  = event.date || event.dueDate || "";
  const time  = event.startTime || "";
  const key   = `${title}|${date}|${time}`;

  // FNV-1a 64-bit hash
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < key.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(key.charCodeAt(i))) * 0x100000001b3n);
  }
  return ID_PREFIX + h.toString(32).padStart(13, "0");
}

function formatEventForGCal(event, eventId) {
  const date      = event.date || event.dueDate;
  const startTime = event.startTime || event.dueTime || "09:00";
  const endTime   = event.endTime   || addHours(startTime, event.estimatedHours || 1);

  const descParts = [];
  if (event.description) descParts.push(event.description);
  if (event.course)      descParts.push(`Course: ${event.course}`);
  if (event.priority)    descParts.push(`Priority: ${event.priority}`);
  if (event.energyMatch) descParts.push(`Energy match: ${event.energyMatch}`);
  if (event.rationale)   descParts.push(`Scheduling reason: ${event.rationale}`);
  descParts.push("— Added by Cadence");

  const body = {
    summary:     event.title,
    description: descParts.join("\n"),
    colorId:     priorityToColorId(event.priority),
    start: { dateTime:`${date}T${startTime}:00`, timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone },
    end:   { dateTime:`${date}T${endTime}:00`,   timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method:"popup", minutes:30 },
        ...(event.priority==="high" ? [{ method:"popup", minutes:1440 }] : []),
      ],
    },
    // Stamp Cadence-specific metadata into extended properties so we can
    // round-trip identity back out of Google Calendar. When we later fetch
    // the event, we'll read these back and preserve the original source
    // (e.g. "course") instead of labelling it "google-calendar".
    extendedProperties: {
      private: {
        cadenceSource:      event.source || "",
        cadenceOriginType:  event.type || "",
        cadencePriority:    event.priority || "",
        cadenceCourse:      event.course || "",
        cadenceEnergyMatch: event.energyMatch || "",
      },
    },
  };

  // Only include id when creating; Google ignores it on PATCH anyway but
  // having it there keeps the POST path symmetric.
  if (eventId) body.id = eventId;

  return body;
}

function addHours(timeStr, hours) {
  const [h, m] = timeStr.split(":").map(Number);
  const total  = h + Math.ceil(hours || 1);
  return `${String(Math.min(total,23)).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function priorityToColorId(priority) {
  return { high:"11", medium:"5", low:"2" }[priority] || "1";
}
