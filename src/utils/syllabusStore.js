// src/utils/syllabusStore.js
// Manage syllabus summaries persistently

const STORAGE_KEY = "smart_cal_syllabi";

export function loadSyllabi() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error("Failed to load syllabi:", err);
    return [];
  }
}

export function saveSyllabus(syllabus) {
  try {
    const syllabi = loadSyllabi();
    
    // Check if syllabus for this course already exists
    const idx = syllabi.findIndex(s => s.courseCode === syllabus.courseCode);
    if (idx >= 0) {
      syllabi[idx] = { ...syllabi[idx], ...syllabus, updatedAt: new Date().toISOString() };
    } else {
      syllabi.push({ ...syllabus, savedAt: new Date().toISOString() });
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(syllabi));
    return syllabi;
  } catch (err) {
    console.error("Failed to save syllabus:", err);
    return [];
  }
}

export function deleteSyllabus(courseCode) {
  try {
    const syllabi = loadSyllabi().filter(s => s.courseCode !== courseCode);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(syllabi));
    return syllabi;
  } catch (err) {
    console.error("Failed to delete syllabus:", err);
    return [];
  }
}

export function getSyllabusByCourse(courseCode) {
  const syllabi = loadSyllabi();
  return syllabi.find(s => s.courseCode === courseCode);
}
