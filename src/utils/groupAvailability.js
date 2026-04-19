// src/utils/groupAvailability.js
// Find common availability slots across multiple group members' calendars

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

export function getBusyRangesForMember(events, date) {
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
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function getCommonFreeBlocks(memberEventsMap, date, startHour = 8, endHour = 22, minDuration = 60) {
  // Get busy ranges for each member
  const allBusyRanges = [];
  const memberAvailability = {};

  Object.entries(memberEventsMap).forEach(([memberId, events]) => {
    const busy = getBusyRangesForMember(events, date);
    memberAvailability[memberId] = busy;
    allBusyRanges.push(...busy);
  });

  // Merge all busy time across all members
  const mergedBusy = mergeBusyRanges(allBusyRanges);

  // Find free blocks
  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;
  const freeBlocks = [];

  // Check if there's free time before first event
  if (mergedBusy.length === 0) {
    freeBlocks.push({
      start: dayStartMinutes,
      end: dayEndMinutes,
      duration: dayEndMinutes - dayStartMinutes,
      label: `${minutesToTime(dayStartMinutes)} - ${minutesToTime(dayEndMinutes)}`,
      availability: memberEventsMap, // All available
    });
  } else {
    if (mergedBusy[0].start > dayStartMinutes) {
      freeBlocks.push({
        start: dayStartMinutes,
        end: mergedBusy[0].start,
        duration: mergedBusy[0].start - dayStartMinutes,
        label: `${minutesToTime(dayStartMinutes)} - ${minutesToTime(mergedBusy[0].start)}`,
      });
    }

    // Check gaps between events
    for (let i = 0; i < mergedBusy.length - 1; i++) {
      const gap = mergedBusy[i + 1].start - mergedBusy[i].end;
      if (gap > 0) {
        freeBlocks.push({
          start: mergedBusy[i].end,
          end: mergedBusy[i + 1].start,
          duration: gap,
          label: `${minutesToTime(mergedBusy[i].end)} - ${minutesToTime(mergedBusy[i + 1].start)}`,
        });
      }
    }

    // Check if there's free time after last event
    if (mergedBusy[mergedBusy.length - 1].end < dayEndMinutes) {
      freeBlocks.push({
        start: mergedBusy[mergedBusy.length - 1].end,
        end: dayEndMinutes,
        duration: dayEndMinutes - mergedBusy[mergedBusy.length - 1].end,
        label: `${minutesToTime(mergedBusy[mergedBusy.length - 1].end)} - ${minutesToTime(dayEndMinutes)}`,
      });
    }
  }

  // Filter by minimum duration
  return freeBlocks.filter(b => b.duration >= minDuration);
}

export function getGroupCommonSlots(memberEventsMap, dateRange, minDuration = 60, topN = 3) {
  // memberEventsMap: { memberId: [...events] }
  // dateRange: [startDate, endDate] as ISO strings
  // Returns: top N common slots with availability info

  const [startDateStr, endDateStr] = dateRange;
  const slots = [];

  // Iterate through date range
  let currentDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = new Date(`${endDateStr}T00:00:00`);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const dayName = currentDate.toLocaleDateString("en-US", { weekday: "short" });
    
    const freeBlocks = getCommonFreeBlocks(memberEventsMap, dateStr, 8, 22, minDuration);
    
    freeBlocks.forEach(block => {
      slots.push({
        date: dateStr,
        dayName,
        startTime: minutesToTime(block.start),
        endTime: minutesToTime(block.end),
        duration: block.duration,
        label: block.label,
      });
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort by duration descending and take top N
  return slots
    .sort((a, b) => b.duration - a.duration)
    .slice(0, topN);
}

export function getMemberAvailabilityForSlot(memberEventsMap, slot) {
  // slot: { date, startTime, endTime }
  // Returns: { memberId: isAvailable }

  const slotStart = timeToMinutes(slot.startTime);
  const slotEnd = timeToMinutes(slot.endTime);
  const availability = {};

  Object.entries(memberEventsMap).forEach(([memberId, events]) => {
    const busy = getBusyRangesForMember(events, slot.date);
    const hasConflict = busy.some(b => b.start < slotEnd && b.end > slotStart);
    availability[memberId] = !hasConflict;
  });

  return availability;
}

export function getSlotScore(memberEventsMap, slot) {
  // Score slot based on how many members are available and how much buffer time exists
  const availability = getMemberAvailabilityForSlot(memberEventsMap, slot);
  const availableCount = Object.values(availability).filter(Boolean).length;
  const totalMembers = Object.keys(memberEventsMap).length;
  
  // Preference for 1-1.5 hours or 2 hours
  const durationBonus = slot.duration >= 60 && slot.duration <= 90 ? 1.5 : 1;
  
  return (availableCount / totalMembers) * durationBonus * slot.duration;
}

export function rankSlotsByScore(memberEventsMap, slots) {
  return slots
    .map(slot => ({
      ...slot,
      score: getSlotScore(memberEventsMap, slot),
      availability: getMemberAvailabilityForSlot(memberEventsMap, slot),
    }))
    .sort((a, b) => b.score - a.score);
}
