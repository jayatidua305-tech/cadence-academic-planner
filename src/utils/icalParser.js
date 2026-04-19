// src/utils/icalParser.js
// Parses Blackboard iCal feed into our internal event format

const PROXY = "http://localhost:3001/api/blackboard-ical";

// ── Fetch + parse the iCal feed ───────────────────────────────────────────────
export async function fetchBlackboardCalendar(icalUrl) {
  const response = await fetch(`${PROXY}?url=${encodeURIComponent(icalUrl)}`);
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    try {
      const err = await response.json();
      throw new Error(err.error || "Failed to fetch Blackboard calendar");
    } catch (e) {
      if (e.message.includes("Failed to fetch")) throw e;
      throw new Error("Failed to fetch Blackboard calendar");
    }
  }

  const icalText = await response.text();
  const allEvents = parseICS(icalText);

  // Only return upcoming events (from 7 days ago onwards)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const upcoming = allEvents.filter(e => {
    if (!e.dueDate) return false;
    const d = new Date(e.dueDate + "T00:00:00");
    return d >= cutoff;
  });

  return upcoming.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}

// ── Parse raw iCal text → array of events ────────────────────────────────────
function parseICS(icalText) {
  const events = [];
  const lines  = unfoldLines(icalText);

  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT" && current) {
      const event = normalizeEvent(current);
      if (event) events.push(event);
      current = null;
    } else if (current) {
      // Parse key:value — handle parameters like DTSTART;TZID=America/New_York:20260410T090000
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const keyPart = line.substring(0, colonIdx);
      const value   = line.substring(colonIdx + 1).trim();
      const key     = keyPart.split(";")[0].toUpperCase(); // strip parameters

      current[key] = value;

      // Extract timezone from TZID parameter if present
      if (key === "DTSTART" || key === "DTEND" || key === "DUE") {
        const tzMatch = keyPart.match(/TZID=([^;:]+)/i);
        if (tzMatch) current[`${key}_TZ`] = tzMatch[1];
      }
    }
  }

  return events;
}

// iCal lines can be folded (continued with a leading space/tab)
function unfoldLines(text) {
  if (!text) return [];
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "") // unfold
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
}

// ── Normalize a raw VEVENT object → our internal format ──────────────────────
function normalizeEvent(raw) {
  // Get the best date — DUE is used for tasks, DTSTART for events
  const dateStr = raw.DUE || raw.DTSTART;
  if (!dateStr) return null;

  const parsed = parseICalDate(dateStr);
  if (!parsed) return null;
  const { date, time } = parsed;
  if (!date) return null;

  const title       = decodeICalText(raw.SUMMARY || "Untitled");
  const description = decodeICalText(raw.DESCRIPTION || "");
  const location    = decodeICalText(raw.LOCATION || "");

  // Extract course name from description or summary
  const course = extractCourse(title, description);

  // Determine type from title/description
  const type = detectType(title, description);

  // Determine priority — base on type first
  let priority = detectPriority(type, title);

  // Override to HIGH if due within 24 hours
  if (date) {
    const dueDateTime = time
      ? new Date(`${date}T${time}:00`)
      : new Date(`${date}T23:59:00`);
    const hoursUntilDue = (dueDateTime - new Date()) / (1000 * 60 * 60);
    if (hoursUntilDue >= 0 && hoursUntilDue <= 24) {
      priority = "high";
    }
  }

  // Estimated hours based on type
  const estimatedHours = { exam: 3, assignment: 2, quiz: 1, project: 4, reading: 1 }[type] || 1;

  return {
    title,
    type,
    dueDate:        date,
    dueTime:        time,
    course,
    priority,
    estimatedHours,
    description:    [description, location].filter(Boolean).join(" · ").slice(0, 200),
    // Unified "course" source — same tag used by syllabus uploads.
    // A student's mental model is "stuff from my classes", not "stuff from
    // Blackboard specifically" or "stuff from a PDF specifically."
    source:         "course",
  };
}

// Parse iCal date formats:
// 20260410T090000Z  (UTC)
// 20260410T090000   (local)
// 20260410          (date only)
function parseICalDate(str) {
  if (!str) return null;
  const clean = str.replace(/Z$/, "");

  if (clean.includes("T")) {
    const [datePart, timePart] = clean.split("T");
    const y = datePart.slice(0, 4);
    const m = datePart.slice(4, 6);
    const d = datePart.slice(6, 8);
    const h = timePart.slice(0, 2);
    const min = timePart.slice(2, 4);
    return { date: `${y}-${m}-${d}`, time: `${h}:${min}` };
  } else {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return { date: `${y}-${m}-${d}`, time: null };
  }
}

function decodeICalText(str) {
  return str
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractCourse(title, description) {
  // Blackboard usually puts course code in brackets or at start
  const bracketMatch = title.match(/\[([^\]]+)\]/) ||
                       description.match(/\[([^\]]+)\]/);
  if (bracketMatch) return bracketMatch[1];

  // Look for course code pattern like "CISC 5001" or "RAG 6100"
  const codeMatch = (title + " " + description).match(/[A-Z]{2,4}\s?\d{4}/);
  if (codeMatch) return codeMatch[0];

  return "Fordham";
}

function detectType(title, description) {
  const text = (title + " " + description).toLowerCase();
  if (/\b(exam|midterm|final|test)\b/.test(text))       return "exam";
  if (/\b(quiz|quizzes)\b/.test(text))                  return "quiz";
  if (/\b(project|presentation|demo)\b/.test(text))     return "project";
  if (/\b(reading|read|chapter|textbook)\b/.test(text)) return "reading";
  if (/\b(assignment|homework|hw|submit|due)\b/.test(text)) return "assignment";
  return "assignment";
}

function detectPriority(type, title) {
  if (type === "exam")    return "high";
  if (type === "project") return "high";
  if (type === "quiz")    return "medium";
  if (type === "reading") return "low";
  return "medium";
}
