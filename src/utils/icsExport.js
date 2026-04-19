// src/utils/icsExport.js
// Fallback .ics export when Google Calendar OAuth isn't available

export function exportToICS(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smart Calendar//Fordham AI Challenge//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Smart Calendar — AI Schedule",
  ];

  for (const event of events) {
    const date = event.date || event.dueDate;
    const startTime = event.startTime || event.dueTime || "09:00";
    const endTime = event.endTime || addHours(startTime, event.estimatedHours || 1);

    const dtStart = formatICSDate(date, startTime);
    const dtEnd   = formatICSDate(date, endTime);
    const uid     = `${Date.now()}-${Math.random().toString(36).slice(2)}@smart-calendar`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeICS(event.title)}`,
      `DESCRIPTION:${escapeICS(buildDescription(event))}`,
      `PRIORITY:${priorityToInt(event.priority)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "smart-schedule.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatICSDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-");
  const [h, min]  = timeStr.split(":");
  return `${y}${m}${d}T${h}${min}00`;
}

function addHours(timeStr, hours) {
  const [h, m] = timeStr.split(":").map(Number);
  const total  = h + Math.ceil(hours);
  return `${String(Math.min(total, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function escapeICS(str) {
  return (str || "").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildDescription(event) {
  const parts = [];
  if (event.description) parts.push(event.description);
  if (event.priority)    parts.push(`Priority: ${event.priority}`);
  if (event.energyMatch) parts.push(`Energy match: ${event.energyMatch}`);
  if (event.rationale)   parts.push(`Why this slot: ${event.rationale}`);
  return parts.join("\n");
}

function priorityToInt(priority) {
  return { high: 1, medium: 5, low: 9 }[priority] || 5;
}
