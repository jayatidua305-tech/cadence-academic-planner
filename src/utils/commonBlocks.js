// src/utils/commonBlocks.js
// Find overlapping free time blocks between Google Calendar and Smart Calendar

export function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getBusyRanges(events, date) {
  if (!Array.isArray(events)) return [];
  
  return events
    .filter(e => e.date === date && e.startTime && e.endTime)
    .map(e => ({
      start: timeToMinutes(e.startTime),
      end: timeToMinutes(e.endTime),
      title: e.title || e.taskTitle || "Event",
      source: e.source || "unknown",
    }))
    .sort((a, b) => a.start - b.start);
}

export function mergeBusyRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];
  
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping or adjacent — merge
      last.end = Math.max(last.end, current.end);
      // Combine titles if different sources
      if (current.source !== last.source && !last.title.includes(current.title)) {
        last.title = `${last.title} + ${current.title}`;
      }
    } else {
      // Gap found — add new range
      merged.push(current);
    }
  }

  return merged;
}

export function getFreeBlocks(busyRanges, startHour = 6, endHour = 23) {
  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;

  if (!busyRanges || busyRanges.length === 0) {
    // Entire day is free
    return [{
      start: dayStartMinutes,
      end: dayEndMinutes,
      duration: dayEndMinutes - dayStartMinutes,
      label: `${minutesToTime(dayStartMinutes)} - ${minutesToTime(dayEndMinutes)}`,
    }];
  }

  const freeBlocks = [];

  // Check if there's free time before first event
  if (busyRanges[0].start > dayStartMinutes) {
    freeBlocks.push({
      start: dayStartMinutes,
      end: busyRanges[0].start,
      duration: busyRanges[0].start - dayStartMinutes,
      label: `${minutesToTime(dayStartMinutes)} - ${minutesToTime(busyRanges[0].start)}`,
    });
  }

  // Check gaps between events
  for (let i = 0; i < busyRanges.length - 1; i++) {
    const gap = busyRanges[i + 1].start - busyRanges[i].end;
    if (gap > 0) {
      freeBlocks.push({
        start: busyRanges[i].end,
        end: busyRanges[i + 1].start,
        duration: gap,
        label: `${minutesToTime(busyRanges[i].end)} - ${minutesToTime(busyRanges[i + 1].start)}`,
      });
    }
  }

  // Check if there's free time after last event
  if (busyRanges[busyRanges.length - 1].end < dayEndMinutes) {
    freeBlocks.push({
      start: busyRanges[busyRanges.length - 1].end,
      end: dayEndMinutes,
      duration: dayEndMinutes - busyRanges[busyRanges.length - 1].end,
      label: `${minutesToTime(busyRanges[busyRanges.length - 1].end)} - ${minutesToTime(dayEndMinutes)}`,
    });
  }

  // Filter out blocks shorter than 15 minutes
  return freeBlocks.filter(b => b.duration >= 15);
}

export function getCommonFreeBlocks(smartCalendarEvents, googleCalendarEvents, date) {
  // Get busy ranges from both calendars
  const smartBusy = getBusyRanges(smartCalendarEvents, date);
  const googleBusy = getBusyRanges(googleCalendarEvents, date);

  // Merge all busy ranges from both sources
  const allBusy = mergeBusyRanges([...smartBusy, ...googleBusy]);

  // Calculate free blocks
  const freeBlocks = getFreeBlocks(allBusy, 6, 23);

  return freeBlocks;
}

export function getCommonFreeBlocksForWeek(smartCalendarEvents, googleCalendarEvents, startDate) {
  const weekBlocks = {};
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    
    weekBlocks[dateStr] = getCommonFreeBlocks(smartCalendarEvents, googleCalendarEvents, dateStr);
  }

  return weekBlocks;
}

// Filter free blocks by duration (in minutes)
export function filterByDuration(freeBlocks, minDuration = 30) {
  return freeBlocks.filter(b => b.duration >= minDuration);
}

// Find the best free blocks (longest gaps)
export function getBestFreeBlocks(freeBlocks, topN = 5) {
  return freeBlocks
    .sort((a, b) => b.duration - a.duration)
    .slice(0, topN);
}
