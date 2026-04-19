// src/hooks/useBlackboard.js
// Auto-fetches Blackboard iCal on app load and refreshes every 30 minutes

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBlackboardCalendar } from "../utils/icalParser";

const URL_KEY      = "smart_cal_bb_url";
const EVENTS_KEY   = "smart_cal_bb_events";
const LAST_SYNC_KEY = "smart_cal_bb_last_sync";
const REFRESH_MS   = 30 * 60 * 1000; // 30 minutes

function saveEvents(events) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch {}
}
function loadEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "null"); } catch { return null; }
}
function saveUrl(url) { localStorage.setItem(URL_KEY, url); }
function loadUrl()    { return localStorage.getItem(URL_KEY) || ""; }
function saveLastSync() { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); }
function loadLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || null; }

export function useBlackboard(onEventsLoaded) {
  const [url,        setUrl]        = useState(loadUrl);
  const [events,     setEvents]     = useState(loadEvents() || []);
  const [status,     setStatus]     = useState("idle"); // idle|syncing|done|error
  const [error,      setError]      = useState(null);
  const [lastSync,   setLastSync]   = useState(loadLastSync);
  const refreshTimer                = useRef(null);
  const onEventsRef                 = useRef(onEventsLoaded);
  onEventsRef.current               = onEventsLoaded;

  // ── Fetch from Blackboard ─────────────────────────────────────────────────
  const fetchEvents = useCallback(async (icalUrl, silent = false) => {
    const target = icalUrl || loadUrl();
    if (!target) return;

    if (!silent) setStatus("syncing");
    setError(null);

    try {
      const fetched = await fetchBlackboardCalendar(target);
      setEvents(fetched);
      saveEvents(fetched);
      saveLastSync();
      setLastSync(new Date().toISOString());
      setStatus("done");
      if (onEventsRef.current) onEventsRef.current(fetched);
    } catch (err) {
      setError(err.message);
      if (!silent) setStatus("error");
      else         setStatus(events.length > 0 ? "done" : "idle");
    }
  }, []);

  // ── Auto-fetch on mount if URL is stored ─────────────────────────────────
  useEffect(() => {
    const stored = loadUrl();
    if (!stored) return;

    // Load cached events immediately so UI is instant
    const cached = loadEvents();
    if (cached?.length) {
      setEvents(cached);
      setStatus("done");
      if (onEventsRef.current) onEventsRef.current(cached);
    }

    // Then fetch fresh data silently in background
    fetchEvents(stored, true);

    // Set up periodic refresh
    refreshTimer.current = setInterval(() => fetchEvents(stored, true), REFRESH_MS);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchEvents]);

  // ── Save URL and fetch when user sets a new one ───────────────────────────
  const connect = useCallback(async (newUrl) => {
    if (!newUrl?.trim()) return;
    saveUrl(newUrl.trim());
    setUrl(newUrl.trim());
    await fetchEvents(newUrl.trim(), false);

    // Set up periodic refresh for new URL
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => fetchEvents(newUrl.trim(), true), REFRESH_MS);
  }, [fetchEvents]);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(() => fetchEvents(url, false), [fetchEvents, url]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    localStorage.removeItem(URL_KEY);
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    setUrl("");
    setEvents([]);
    setStatus("idle");
    setLastSync(null);
    if (onEventsRef.current) onEventsRef.current([]);
  }, []);

  // Format last sync time nicely
  const lastSyncLabel = lastSync
    ? (() => {
        const diff = (Date.now() - new Date(lastSync).getTime()) / 1000;
        if (diff < 60)   return "just now";
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        return `${Math.floor(diff/3600)}h ago`;
      })()
    : null;

  return {
    url, events, status, error, lastSync, lastSyncLabel,
    isConnected: !!url && events.length > 0,
    connect, refresh, disconnect,
  };
}
