// src/content.js
// Runs on Smart Calendar app + Blackboard pages.
// - On app pages: bridge localStorage data to extension storage.
// - On Blackboard pages: expose syllabus page extraction to popup/background.

const APP_ORIGIN = "http://localhost:3000";

function isAppPage() {
  return window.location.origin === APP_ORIGIN;
}

function isBlackboardPage() {
  return /(^|\.)blackboard\.com$/i.test(window.location.hostname);
}

function getLocalData() {
  try {
    return {
      schedule: JSON.parse(localStorage.getItem("smart_cal_schedule") || "null"),
      completedKeys: JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"),
      events: JSON.parse(localStorage.getItem("smart_cal_bb_events") || "[]"),
      energyPattern: JSON.parse(localStorage.getItem("smart_cal_energy_pattern") || "null"),
      googleToken: localStorage.getItem("smart_cal_google_token") || null,
      googleExpiry: parseInt(localStorage.getItem("smart_cal_google_expiry") || "0", 10) || 0,
    };
  } catch {
    return {};
  }
}

function syncToExtension() {
  if (!isAppPage()) return;
  const data = getLocalData();
  chrome.runtime.sendMessage({ type: "SYNC_DATA", ...data });
}

function normalizeWhitespace(str) {
  return (str || "").replace(/\s+/g, " ").trim();
}

function getFirstText(selectors) {
  for (const sel of selectors) {
    const node = document.querySelector(sel);
    const text = normalizeWhitespace(node?.textContent || "");
    if (text) return text;
  }
  return "";
}

function collectPageText() {
  const candidates = [
    "main",
    "[role='main']",
    "#content",
    "#app",
    ".contentPane",
    ".course-content",
    ".bb-course-content",
    ".ultra-content",
  ];

  const chunks = [];
  const seen = new Set();

  for (const sel of candidates) {
    document.querySelectorAll(sel).forEach((el) => {
      const t = normalizeWhitespace(el.innerText || el.textContent || "");
      if (t && t.length > 80 && !seen.has(t)) {
        seen.add(t);
        chunks.push(t);
      }
    });
  }

  if (!chunks.length) {
    const fallback = normalizeWhitespace(document.body?.innerText || "");
    if (fallback) chunks.push(fallback);
  }

  return chunks.join("\n\n").slice(0, 18000);
}

function collectSyllabusLinks() {
  const links = [];
  const seen = new Set();

  const looksLikeBlackboardFile = (url) =>
    /\/ultra\/courses\/[^/]+\/outline\/file\/_[^/?#]+/i.test(url) ||
    /\/bbcswebdav\//i.test(url) ||
    /\/webapps\/blackboard\/content\/listcontent\.jsp/i.test(url);

  const pushLink = (href, text = "Untitled link") => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({
      text,
      href,
      fileType: href.split("?")[0].split(".").pop()?.toLowerCase() || null,
    });
  };

  document.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href || "";
    const text = normalizeWhitespace(a.textContent || "");
    const hint = `${text} ${href}`.toLowerCase();

    const looksLikeSyllabus = /syllabus|course schedule|course outline/.test(hint);
    const looksLikeDoc = /\.(pdf|doc|docx|txt)(\?|$)/i.test(href) || looksLikeBlackboardFile(href);

    if (!looksLikeSyllabus && !looksLikeDoc) return;
    pushLink(href, text || "Untitled link");
  });

  // Blackboard file viewer pages often render PDF inside iframe/embed without .pdf extension.
  document.querySelectorAll("iframe[src], embed[src], object[data]").forEach((el) => {
    const raw = el.getAttribute("src") || el.getAttribute("data") || "";
    if (!raw) return;
    const href = new URL(raw, window.location.href).href;
    const hint = `${href} ${(el.getAttribute("type") || "").toLowerCase()}`.toLowerCase();
    if (/pdf/.test(hint) || looksLikeBlackboardFile(href)) {
      pushLink(href, "Embedded file");
    }
  });

  // If user is already on a Blackboard file page, include it directly.
  if (looksLikeBlackboardFile(window.location.href) || /\.pdf(\?|$)/i.test(window.location.href)) {
    pushLink(window.location.href, "Current Blackboard file");
  }

  return links.slice(0, 20);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchPdfFromBlackboard(url) {
  if (!isBlackboardPage()) {
    throw new Error("PDF fetch is only allowed on Blackboard pages.");
  }
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
  const contentType = response.headers.get("content-type") || "application/pdf";
  const blob = await response.blob();
  const base64Data = await blobToBase64(blob);
  if (!base64Data) throw new Error("Failed to read PDF content.");
  return {
    ok: true,
    base64Data,
    mediaType: contentType.includes("pdf") ? "application/pdf" : contentType,
    size: blob.size || 0,
    url,
  };
}

function getBlackboardSyllabusContext() {
  if (!isBlackboardPage()) {
    return { ok: false, error: "Not on a Blackboard page." };
  }

  const courseName = getFirstText([
    "h1",
    "[data-analytics-id='course-title']",
    ".course-title",
    ".title",
  ]) || document.title;

  const pageTitle = normalizeWhitespace(document.title || "Blackboard");
  const pageText = collectPageText();
  const links = collectSyllabusLinks();

  if ((!pageText || pageText.length < 120) && links.length === 0) {
    return {
      ok: false,
      error: "Could not find enough syllabus text on this page. Open the syllabus page in Blackboard and try again.",
      courseName,
      pageTitle,
      pageUrl: window.location.href,
      links,
    };
  }

  return {
    ok: true,
    courseName,
    pageTitle,
    pageUrl: window.location.href,
    text: pageText || "",
    links,
    textLength: pageText.length,
  };
}

if (isAppPage()) {
  syncToExtension();
  setInterval(syncToExtension, 30000);
  window.addEventListener("storage", syncToExtension);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_DATA" && isAppPage()) {
    sendResponse(getLocalData());
    return true;
  }

  if (msg.type === "MARK_DONE" && isAppPage()) {
    try {
      const keys = new Set(JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"));
      keys.add(msg.key);
      localStorage.setItem("smart_cal_today_done", JSON.stringify([...keys]));
      syncToExtension();
    } catch {}
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_BLACKBOARD_SYLLABUS" && isBlackboardPage()) {
    sendResponse(getBlackboardSyllabusContext());
    return true;
  }

  if (msg.type === "GET_BLACKBOARD_PDF_BASE64" && isBlackboardPage()) {
    fetchPdfFromBlackboard(msg.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "IMPORT_EVENTS" && isAppPage()) {
    try {
      const incoming = Array.isArray(msg.events) ? msg.events : [];
      const existing = JSON.parse(localStorage.getItem("smart_cal_ext_events") || "[]");
      const key = (e) => `${(e.title || "").trim().toLowerCase()}|${e.dueDate || e.date || ""}`;
      const map = new Map(existing.map((e) => [key(e), e]));
      incoming.forEach((e) => map.set(key(e), { ...e, source: e.source || "blackboard-extension" }));
      const merged = [...map.values()];
      localStorage.setItem("smart_cal_ext_events", JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("smartCalImportedEvents"));
      syncToExtension();
      sendResponse({ ok: true, imported: incoming.length, total: merged.length });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }

  return false;
});
