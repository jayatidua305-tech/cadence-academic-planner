const APP_URL = "http://localhost:3000";

document.getElementById("open-app").href = APP_URL;

let parsedSyllabusEvents = [];

function fmtTime(t) {
  return t || "";
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function timeSince(iso) {
  if (!iso) return "never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function isBlackboardUrl(url) {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)blackboard\.com$/i.test(host);
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showStatus(message, tone = "info") {
  const colors = {
    info: "#8b90b0",
    success: "#4ade80",
    error: "#f87171",
    warn: "#fbbf24",
  };
  document.getElementById("sync-label").textContent = message;
  document.getElementById("sync-label").style.color = colors[tone] || colors.info;
}

function sendTabMessage(tabId, message) {
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

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function mergeEvents(existing, incoming) {
  const key = (e) => `${String(e.title || "").trim().toLowerCase()}|${String(e.dueDate || e.date || "").trim()}`;
  const map = new Map((existing || []).map((e) => [key(e), e]));
  (incoming || []).forEach((e) => map.set(key(e), e));
  return [...map.values()].sort((a, b) => String(a.dueDate || a.date || "").localeCompare(String(b.dueDate || b.date || "")));
}

function looksLikePdfCandidate(url) {
  const u = String(url || "");
  return (
    /\.pdf(\?|$)/i.test(u) ||
    /\/ultra\/courses\/[^/]+\/outline\/file\/_[^/?#]+/i.test(u) ||
    /\/bbcswebdav\//i.test(u)
  );
}

function renderBlackboardIntro(activeTab) {
  const container = document.getElementById("task-list");
  document.getElementById("date-label").textContent = "Blackboard Syllabus Mode";
  document.getElementById("total-count").textContent = "—";
  document.getElementById("done-count").textContent = "—";
  document.getElementById("archetype-label").textContent = "🎓";

  container.innerHTML = `
    <div class="section-label">Direct Blackboard Parsing</div>
    <div style="padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:rgba(124,111,247,0.08);margin-bottom:10px;">
      <div style="font-size:0.78rem;font-weight:700;margin-bottom:4px;">Current page</div>
      <div style="font-size:0.7rem;color:#8b90b0;line-height:1.4;">${escapeHtml(activeTab.title || activeTab.url || "Blackboard")}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="scan-blackboard" class="done-btn mark" style="padding:6px 10px;">🧠 Parse Syllabus</button>
        <button id="open-app-connect" class="done-btn" style="padding:6px 10px;background:rgba(79,159,255,0.14);color:#82bbff;border:1px solid rgba(79,159,255,0.35);">🔗 Open App</button>
      </div>
      <div style="font-size:0.66rem;color:#8b90b0;margin-top:8px;">No download/upload needed. This reads text directly from Blackboard.</div>
    </div>
    <div id="bb-result"></div>
  `;

  document.getElementById("scan-blackboard").addEventListener("click", () => parseFromBlackboardTab(activeTab.id));
  document.getElementById("open-app-connect").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_APP" });
  });
}

function renderBlackboardEvents(events) {
  const result = document.getElementById("bb-result");
  if (!result) return;

  if (!events.length) {
    result.innerHTML = `
      <div style="padding:10px;border:1px solid rgba(248,113,113,0.3);border-radius:8px;background:rgba(248,113,113,0.08);font-size:0.75rem;color:#f87171;">
        No deadlines detected on this page. Open the actual syllabus content page and parse again.
      </div>
    `;
    return;
  }

  const rows = events
    .map(
      (e) => `
      <div class="task-item ${escapeHtml((e.priority || "medium").toLowerCase())}">
        <div class="task-time">${escapeHtml(e.dueDate || e.date || "")}${e.dueTime ? `<br/>${escapeHtml(e.dueTime)}` : ""}</div>
        <div class="task-info">
          <div class="task-title">${escapeHtml(e.title)}</div>
          <div class="task-sub">${escapeHtml((e.course || "Blackboard") + " · " + (e.type || "assignment"))}</div>
        </div>
      </div>
    `
    )
    .join("");

  result.innerHTML = `
    <div class="section-label">Parsed Syllabus Events (${events.length})</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding:0 0 8px 0;">
      <button id="sync-to-gcal" class="done-btn mark" style="padding:6px 10px;">📅 Sync to Google</button>
      <button id="import-to-app" class="done-btn" style="padding:6px 10px;background:rgba(79,159,255,0.14);color:#82bbff;border:1px solid rgba(79,159,255,0.35);">⬇ Import to App</button>
    </div>
    <div>${rows}</div>
  `;

  document.getElementById("sync-to-gcal").addEventListener("click", syncParsedToGoogleCalendar);
  document.getElementById("import-to-app").addEventListener("click", importParsedIntoApp);
}

async function parseFromBlackboardTab(tabId) {
  showStatus("Reading Blackboard page...", "info");

  let ctx;
  try {
    ctx = await sendTabMessage(tabId, { type: "GET_BLACKBOARD_SYLLABUS" });
  } catch {
    showStatus("Could not read tab. Refresh Blackboard page and try again.", "error");
    return;
  }

  if (!ctx?.ok) {
    showStatus(ctx?.error || "Could not parse this Blackboard page.", "warn");
    return;
  }

  let merged = [];
  const parseErrors = [];

  // Parse visible Blackboard page text first.
  showStatus("Parsing syllabus text from Blackboard...", "info");
  try {
    const textResp = await sendRuntimeMessage({ type: "PARSE_BLACKBOARD_SYLLABUS", payload: ctx });
    if (textResp?.ok) merged = mergeEvents(merged, textResp.events || []);
    else if (textResp?.error) parseErrors.push(`Page parse: ${textResp.error}`);
  } catch (err) {
    parseErrors.push(`Page parse: ${err.message}`);
  }

  // Parse linked syllabus PDFs from the same Blackboard course page.
  const seenPdfUrls = new Set();
  const pdfLinks = [];
  (ctx.links || []).forEach((l) => {
    const href = l?.href || "";
    if (!looksLikePdfCandidate(href) && (l?.fileType || "").toLowerCase() !== "pdf") return;
    if (seenPdfUrls.has(href)) return;
    seenPdfUrls.add(href);
    pdfLinks.push(l);
  });
  if (looksLikePdfCandidate(ctx.pageUrl || "") && !seenPdfUrls.has(ctx.pageUrl)) {
    pdfLinks.push({ href: ctx.pageUrl, text: "Current Blackboard file", fileType: "pdf" });
    seenPdfUrls.add(ctx.pageUrl);
  }
  const limitedPdfLinks = pdfLinks.slice(0, 6);

  for (let i = 0; i < limitedPdfLinks.length; i += 1) {
    const link = limitedPdfLinks[i];
    showStatus(`Reading syllabus PDF ${i + 1}/${limitedPdfLinks.length}...`, "info");
    try {
      const pdfData = await sendTabMessage(tabId, { type: "GET_BLACKBOARD_PDF_BASE64", url: link.href });
      if (!pdfData?.ok || !pdfData?.base64Data) {
        parseErrors.push(`PDF fetch failed: ${link.href}`);
        continue;
      }

      showStatus(`Parsing syllabus PDF ${i + 1}/${limitedPdfLinks.length}...`, "info");
      const pdfResp = await sendRuntimeMessage({
        type: "PARSE_BLACKBOARD_PDF_BASE64",
        payload: {
          base64Data: pdfData.base64Data,
          mediaType: pdfData.mediaType || "application/pdf",
          pdfUrl: link.href,
          courseName: ctx.courseName,
        },
      });
      if (pdfResp?.ok) merged = mergeEvents(merged, pdfResp.events || []);
      else if (pdfResp?.error) parseErrors.push(`PDF parse failed: ${pdfResp.error}`);
    } catch (err) {
      parseErrors.push(`PDF parse failed: ${err.message}`);
    }
  }

  parsedSyllabusEvents = merged;
  chrome.storage.local.set({ lastParsedSyllabusEvents: parsedSyllabusEvents });
  renderBlackboardEvents(parsedSyllabusEvents);

  if (!parsedSyllabusEvents.length) {
    const detail = parseErrors[0] ? ` (${parseErrors[0]})` : "";
    showStatus(`No deadlines parsed. Open the syllabus page/PDF and try again${detail}`, "warn");
    return;
  }
  showStatus(`Parsed ${parsedSyllabusEvents.length} syllabus events (page + PDFs).`, "success");
}

function syncParsedToGoogleCalendar() {
  if (!parsedSyllabusEvents.length) {
    showStatus("No parsed events to sync.", "warn");
    return;
  }

  showStatus("Syncing parsed events to Google Calendar...", "info");
  chrome.runtime.sendMessage({ type: "SYNC_PARSED_TO_GCAL", events: parsedSyllabusEvents }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      showStatus(resp?.error || "Google sync failed.", "error");
      return;
    }
    const success = resp.results?.success?.length || 0;
    const failed = resp.results?.failed?.length || 0;
    if (failed > 0) {
      showStatus(`Synced ${success}, failed ${failed}.`, "warn");
    } else {
      showStatus(`Synced ${success} events to Google Calendar.`, "success");
    }
  });
}

function importParsedIntoApp() {
  if (!parsedSyllabusEvents.length) {
    showStatus("No parsed events to import.", "warn");
    return;
  }

  chrome.runtime.sendMessage({ type: "IMPORT_EVENTS_TO_APP", events: parsedSyllabusEvents }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      showStatus(resp?.error || "Could not import into app.", "error");
      return;
    }
    showStatus(`Imported ${parsedSyllabusEvents.length} events into Smart Calendar app.`, "success");
  });
}

function taskHTML(slot, key, isDone, isOverdue, subText) {
  const energyClass = isOverdue ? "overdue" : slot.energyMatch || "medium";
  const doneClass = isDone ? "done" : "";
  const btnHTML = isDone
    ? `<button class="done-btn marked" disabled>✓ Done</button>`
    : `<button class="done-btn mark" data-key="${key}">✅ Done</button>`;

  return `
    <div class="task-item ${energyClass} ${doneClass}">
      <div class="task-time">${fmtTime(slot.startTime)}<br/>→${fmtTime(slot.endTime)}</div>
      <div class="task-info">
        <div class="task-title">${slot.taskTitle || slot.title || "Task"}</div>
        <div class="task-sub">${subText}${slot.energyMatch ? ` · ${slot.energyMatch}` : ""}</div>
      </div>
      ${btnHTML}
    </div>`;
}

function markDone(key, btn) {
  chrome.storage.local.get(["completedKeys"], (data) => {
    const keys = new Set(data.completedKeys || []);
    keys.add(key);
    chrome.storage.local.set({ completedKeys: [...keys] }, () => {
      btn.className = "done-btn marked";
      btn.disabled = true;
      btn.textContent = "✓ Done";
      const item = btn.closest(".task-item");
      item.classList.add("done");
      item.classList.remove("overdue", "peak", "medium", "low");

      chrome.runtime.sendMessage({ type: "UPDATE_BADGE" });

      chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "MARK_DONE", key });
        }
      });
    });
  });
}

function renderScheduleMode(data) {
  const today = getToday();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const schedule = data.schedule?.schedule || [];
  const completedKeys = new Set(data.completedKeys || []);
  const energyPattern = data.energyPattern;

  document.getElementById("date-label").textContent = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (energyPattern?.archetype) {
    const emoji = {
      "Night Owl": "🦉",
      "Morning Person": "🌅",
      "Afternoon Peak": "☀️",
      "Evening Peak": "🌆",
      Consistent: "⚖️",
    }[energyPattern.archetype] || "⚡";
    document.getElementById("archetype-label").textContent = `${emoji} ${energyPattern.archetype}`;
  }

  const todaySlots = schedule.filter((s) => s.date === today && !s.isBuffer);

  const overdue = [];
  const upcoming = [];
  const done = [];

  todaySlots.forEach((slot, i) => {
    const key = `${slot.date}-${i}-${slot.taskTitle}`;
    const isDone =
      completedKeys.has(key) ||
      [...completedKeys].some(
        (k) => String(k).replace(/^\d{4}-\d{2}-\d{2}-\d+-/, "").toLowerCase() === (slot.taskTitle || "").toLowerCase()
      );

    if (isDone) {
      done.push({ slot, key, isDone: true });
      return;
    }

    if (slot.endTime) {
      const [eh, em] = slot.endTime.split(":").map(Number);
      const endMins = eh * 60 + em;
      if (endMins < nowMins) {
        overdue.push({ slot, key });
        return;
      }
    }
    upcoming.push({ slot, key });
  });

  document.getElementById("total-count").textContent = todaySlots.length;
  document.getElementById("done-count").textContent = done.length;

  showStatus(`Last sync: ${timeSince(data.lastSync)}`);

  const container = document.getElementById("task-list");

  if (todaySlots.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="emoji">🎉</div>
        <p>No tasks scheduled today.<br/>
        <a href="${APP_URL}" target="_blank">Open the app</a> to build your schedule.</p>
      </div>`;
    return;
  }

  let html = "";

  if (overdue.length > 0) {
    html +=
      '<div class="overdue-label" style="padding:6px 8px 2px;font-size:0.65rem;color:#f87171;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">⚠️ Overdue — tap Done or open app to reschedule</div>';
    overdue.forEach(({ slot, key }) => {
      const [eh, em] = (slot.endTime || "00:00").split(":").map(Number);
      const minsOver = Math.floor(nowMins - (eh * 60 + em));
      html += taskHTML(slot, key, false, true, `${minsOver}m ago`);
    });
  }

  if (upcoming.length > 0) {
    html += '<div class="section-label">📅 Today\'s plan</div>';
    upcoming.forEach(({ slot, key }) => {
      const [sh, sm] = (slot.startTime || "00:00").split(":").map(Number);
      const minsUntil = sh * 60 + sm - nowMins;
      const subText = minsUntil <= 0 ? "In progress" : minsUntil < 60 ? `in ${minsUntil}m` : `${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`;
      html += taskHTML(slot, key, false, false, subText);
    });
  }

  if (done.length > 0) {
    html += '<div class="section-label">✅ Completed</div>';
    done.forEach(({ slot, key }) => {
      html += taskHTML(slot, key, true, false, "Completed");
    });
  }

  container.innerHTML = html;

  container.querySelectorAll(".done-btn.mark").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      markDone(btn.dataset.key, btn);
    });
  });
}

function renderNoApp() {
  document.getElementById("task-list").innerHTML = `
    <div class="empty">
      <div class="emoji">🔌</div>
      <p>Smart Calendar app is not open.<br/>
      <a href="http://localhost:3000" target="_blank">Open the app</a> to sync your schedule.</p>
    </div>`;
  document.getElementById("date-label").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function initScheduleMode() {
  chrome.storage.local.get(["schedule", "completedKeys", "events", "energyPattern", "lastSync"], (data) => {
    if (!data.schedule) {
      chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "GET_DATA" }, (response) => {
            if (response) {
              chrome.storage.local.set({ ...response, lastSync: new Date().toISOString() });
              renderScheduleMode(response);
            } else {
              renderNoApp();
            }
          });
        } else {
          renderNoApp();
        }
      });
    } else {
      renderScheduleMode(data);
    }
  });
}

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.url && isBlackboardUrl(activeTab.url)) {
      renderBlackboardIntro(activeTab);
      chrome.storage.local.get(["lastParsedSyllabusEvents"], (data) => {
        if (Array.isArray(data.lastParsedSyllabusEvents) && data.lastParsedSyllabusEvents.length) {
          parsedSyllabusEvents = data.lastParsedSyllabusEvents;
          renderBlackboardEvents(parsedSyllabusEvents);
          showStatus(`Loaded ${parsedSyllabusEvents.length} previously parsed events.`);
        } else {
          showStatus("Open a Blackboard syllabus page and click Parse Syllabus.");
        }
      });
      return;
    }
    initScheduleMode();
  });
}

init();
