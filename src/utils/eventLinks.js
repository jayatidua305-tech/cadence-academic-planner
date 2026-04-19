// src/utils/eventLinks.js
// Shared helpers for linking events that represent the same task across
// multiple slots (e.g., a Course deadline and its AI-scheduled study blocks
// all share one parentKey).

/**
 * Loose identity for a task. Two events share a parentKey when they're
 * "the same work" — e.g., a Blackboard "Midterm exam" deadline and the
 * AI-scheduled "Midterm exam" study blocks.
 *
 * NOTE: `parentKey` returns a *normalized title* only. Course matching is
 * enforced separately in {@link sameParent} so that deadlines (which have
 * a course) and study blocks (which often don't) still link up when their
 * titles match. The rule:
 *   - If BOTH sides have a course, the courses must match (prevents
 *     "Reading" from CIS 101 linking to "Reading" from ENG 201).
 *   - If EITHER side has no course, we match on title alone (gives benefit
 *     of doubt to courseless AI study blocks / manually-created events).
 *
 * Returns `null` if the event has neither a useful title nor an id.
 */
export function parentKey(ev) {
  if (!ev) return null;
  if (ev.parentEventId) return ev.parentEventId;
  const title = (ev.title || ev.taskTitle || "").toLowerCase().trim();
  if (!title) return null;
  return title;
}

/**
 * The course portion of an event's identity, normalized for comparison.
 * Empty string means "no course set" (distinct from course = "Fordham").
 */
function eventCourse(ev) {
  return (ev?.course || "").toLowerCase().trim();
}

/**
 * Returns true if two events should be treated as linked (same task).
 * See {@link parentKey} docstring for the course-tolerance rules.
 */
export function sameParent(a, b) {
  const ka = parentKey(a);
  const kb = parentKey(b);
  if (!ka || !kb || ka !== kb) return false;
  const ca = eventCourse(a);
  const cb = eventCourse(b);
  // If either side is missing a course, trust the title match.
  if (!ca || !cb) return true;
  return ca === cb;
}

/**
 * Unique identity for ONE scheduled instance — a deadline on a date, a
 * study block on a date + start time. Used to tell "is this the same
 * slot the user already has open?" vs "is this a different slot of the
 * same task?"
 */
export function eventKey(ev) {
  if (!ev) return null;
  if (ev.id) return String(ev.id);
  const pk = parentKey(ev) || "";
  return `${pk}::${ev.date || ev.dueDate || ""}::${ev.startTime || ""}`;
}

/**
 * Classify an event for display grouping:
 *   "deadline" — the fixed due date (Course/syllabus/manual, not AI)
 *   "study"    — an AI-scheduled study block working toward a deadline
 *   "other"    — anything else (personal Google events, etc.)
 */
export function eventRole(ev) {
  if (!ev) return "other";
  if (ev.aiScheduled || ev.energyMatch) return "study";
  if (ev.source === "course" ||
      ev.source === "blackboard" ||
      ev.source === "syllabus" ||
      ev.source === "manual" ||
      !ev.source) {
    // Treat untagged events as deadlines only if they carry a dueDate-ish
    // signal (priority, type, or course). Otherwise they're noise.
    if (ev.priority || ev.type || ev.course || ev.dueDate) return "deadline";
  }
  return "other";
}

/**
 * Group events into buckets of related items using {@link sameParent}.
 * Returns an array of groups (NOT keyed by parentKey since the course-
 * tolerance makes a single canonical key ambiguous):
 *   [ { primary, related: [...] }, ... ]
 * where `primary` is the deadline if one exists, otherwise the earliest
 * other event. `related` is everything else in the group (study blocks,
 * extra deadline slots, etc.) sorted by date.
 */
export function groupByParent(events) {
  const groups = [];
  for (const ev of events) {
    if (!parentKey(ev)) continue;
    const bucket = groups.find(g => sameParent(g.all[0], ev));
    if (bucket) bucket.all.push(ev);
    else groups.push({ all: [ev] });
  }
  const byDate = (a, b) => {
    const da = (a.date || a.dueDate || "9999") + (a.startTime || "23:59");
    const db = (b.date || b.dueDate || "9999") + (b.startTime || "23:59");
    return da.localeCompare(db);
  };
  for (const group of groups) {
    const all = group.all;
    const deadline = all.find(e => eventRole(e) === "deadline");
    const primary  = deadline || all.slice().sort(byDate)[0];
    group.primary = primary;
    group.related = all.filter(e => e !== primary).sort(byDate);
  }
  return groups;
}

/**
 * Get the list of events related to `ev` (same task, different slot).
 * Returns them sorted by date.
 */
export function getRelatedEvents(ev, allEvents) {
  const ek = eventKey(ev);
  if (!parentKey(ev)) return [];
  return allEvents
    .filter(e => sameParent(e, ev) && eventKey(e) !== ek)
    .sort((a, b) => {
      const da = (a.date || a.dueDate || "9999") + (a.startTime || "23:59");
      const db = (b.date || b.dueDate || "9999") + (b.startTime || "23:59");
      return da.localeCompare(db);
    });
}
