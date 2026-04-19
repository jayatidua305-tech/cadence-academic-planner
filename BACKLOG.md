# Cadence — Deferred Backlog

Items captured during testing that we chose not to tackle in the current session.
Review before next working session.

---

## Bugs

### ✅ B1 · Course-deadline events are mislabeled on the Calendar — RESOLVED

**Fixed in:** same session, post-report. Three related changes:
1. **Unified source:** `SyllabusUploader.jsx` + `utils/icalParser.js` now both stamp `source: "course"` on extracted events. The old `"blackboard"` and `"syllabus"` values are kept as backward-compat aliases in `resolveSource()` so pre-existing localStorage entries still render correctly.
2. **Round-trip tag preservation:** `useGoogleCalendar.js` `formatEventForGCal` now writes `extendedProperties.private.cadenceSource` (plus type, priority, course, energyMatch) into every event it pushes. `fetchCalendarEvents` reads those back so Cadence-pushed events retain their original source instead of being labelled "google-calendar" on the return trip.
3. **No self-duplicates on push:** `handleSyncAll` in `CalendarView.jsx` now filters out events with `source: "google-calendar"` before pushing — prevents fetched Google events from being re-POSTed to Google with a different ID.
4. **UI collapse:** Syllabus chip removed, Blackboard chip renamed to "Course". Filter panel now shows 4 chips (Course, Google Cal, AI, Manual) instead of 5.
5. **App.jsx merge dedupe:** when merging pulled Google events back into state, any local event whose identity matches a pulled event that carries `cadenceSource` is dropped — so course deadlines don't duplicate after a sync+pull cycle.

**Validated via:** seeded test with legacy `source:"blackboard"`, legacy `source:"syllabus"`, and new `source:"course"` events. All three render maroon 🎓. Toggling the Course chip hides all three simultaneously.

---

### B1 · (Original entry — kept for history)
**Severity:** Medium · **Reported:** during calendar-redesign walkthrough
**Scope expanded:** 2nd report — Blackboard AND Syllabus filter chips both show zero events

**Symptom:**
- Events imported via Blackboard iCal appear on the Calendar with the
  **📅 Google Cal** source pill (slate blue) instead of the **🎓 Blackboard**
  pill (maroon).
- Events extracted from a syllabus upload have **no source tag at all**,
  so they fall into the `"manual"` bucket (grey ✍️) or get mispainted.
- Neither the `Blackboard` nor `Syllabus` filter chip hides any events when
  toggled off, because no events carry those source tags.

**Confirmed cause:**
- `src/components/SyllabusUploader.jsx:105` — `onEventsExtracted(extracted)`
  passes extracted events through without setting `source: "syllabus"` (or any
  source). Verified via grep: no occurrence of `source.*syllabus` in the whole
  codebase outside CalendarView's `resolveSource` check.
- `src/hooks/useBlackboard.js` — likely same issue (not yet verified), OR
  Blackboard events flow through `handleBBEvents` in App.jsx which may strip
  the source tag during the filter in line `prev.filter(e => e.source!=="blackboard")`.

**Design decision to make before fixing:**
Do we want TWO separate source categories (Blackboard vs Syllabus) or ONE
unified "Course" bucket? Recommendation: **unify to one**. A student doesn't
care how a deadline got into Cadence — only whether it's a graded course item
vs a personal event vs an AI study block. Collapses 5 source chips to 4.

**Acceptance (updated):**
- [ ] Pick a canonical source value: `"blackboard"` OR `"course"` (document the choice)
- [ ] `SyllabusUploader` stamps every extracted event with that source
- [ ] `useBlackboard` stamps every extracted event with that source
- [ ] `App.jsx` `handleBBEvents` / `handleBlackboardImport` / `handleEventsExtracted` preserves `source` through their filters
- [ ] Remove the **Syllabus** filter chip from `CalendarView.jsx` (or rename the combined chip to "Course")
- [ ] Remove the `syllabus` branch from `resolveSource` once no events use it
- [ ] Verify: after uploading a syllabus or syncing Blackboard, events render with the maroon 🎓 pill and the chip toggle correctly filters them

---

## Features

### F2 · Manual linking of study blocks to deadlines
**Priority:** Low · **Reported:** after automatic linking shipped

**Context:** Events automatically link when they share `parentKey` (lowercase
`title OR taskTitle` + `course`). This works out of the box for AI-generated
study blocks because they inherit `taskTitle` + `course` from their parent
deadline. But a manually-created study block won't auto-link unless the user
happens to type the exact matching title.

**Proposed UX:** From the Course deadline's TaskDetailModal, add a
`+ Add linked study block` button that opens a small inline form:
  - Date picker (defaults to a day before the deadline)
  - Start + end time
  - Optional note/subtitle ("outline", "draft", "polish")
On save, create an event with:
  - `title` (or `taskTitle`) copied from the parent
  - `course` copied from the parent
  - `parentEventId` explicitly set to the parent's stable ID (future-proof
    even if the user renames the parent later)
  - `aiScheduled: false`, `manualLink: true` (for the "Study block" pill to
    still show but differentiated from AI-generated ones)

**Also useful:** the reverse — from an orphan study event, a
`🔗 Link to deadline` button that pops a searchable list of Course/Syllabus
events and lets the user pick one.

**Where to implement:**
- `src/components/TaskDetailModal.jsx` — add the form + create-event handler
- `src/utils/eventLinks.js` — already exports `parentKey` / `eventKey` which
  the new events should satisfy automatically

---

### F1 · Split the "Sync" button into explicit Push / Pull
**Priority:** Medium · **Reported:** during calendar walkthrough

**Problem:** The current `📅 Sync all N` button is push-only (Cadence → Google
Calendar) but the word "sync" implies two-way. The download path
(`fetchCalendarEvents`) only fires automatically on app mount, so changes
made directly in Google Calendar don't appear in Cadence without a reload.

**Proposed UX:**
- Replace the single "Sync all" button in `CalendarView.jsx` with two:
  - `⬆️ Push to Google Cal` — current behavior of `handleSyncAll` (renamed)
  - `⬇️ Pull from Google Cal` — calls `gcal.fetchCalendarEvents()` manually
- Add a small timestamp next to the status line: `Last pulled: 2 min ago`
- Consider storing `smart_cal_last_pulled_at` in localStorage and showing it on reload

**Acceptance:**
- [ ] Two separate buttons with unambiguous direction labels
- [ ] Pull button triggers a manual refetch and updates `lastPulledAt`
- [ ] Status line in the sync card shows "last pulled X ago" when connected
- [ ] Push button status still reports `N created · M updated` as today

**Nice-to-have:**
- [ ] Auto-refresh on tab focus (window `visibilitychange` listener that re-pulls if last pull > 5 min ago)
- [ ] A future `🔄 Two-way sync` button that chains push → pull

---

## Notes for next session

- Both items are non-blocking for the current demo flow. Users can still push
  their Cadence schedule to Google and see their Google events inside Cadence.
- The Blackboard-as-Google mislabeling is the higher-priority of the two
  because it directly affects the new source-color UX we just shipped.
