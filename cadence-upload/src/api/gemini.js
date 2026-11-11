// src/api/gemini.js
// AI client for the Express proxy. The filename is historical;
// all calls go to Groq (Llama 3.3 70B), with Anthropic Claude as the fallback.
import { recordAIEvent } from "../utils/aiAudit";

const PROXY_URL = "http://localhost:3001/api/ai";

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function auditMeta(meta = {}) {
  return {
    provider: "Groq",
    model: "llama-3.3-70b-versatile",
    feature: meta.feature || "General AI",
    action: meta.action || "ai_call",
  };
}

async function callGemini(systemPrompt, userMessage, maxTokens = 2048, meta = {}) {
  const started = nowMs();
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, userMessage, maxTokens }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "AI API error");
    }
    const data = await response.json();
    const text = data.text || "";
    recordAIEvent({
      ...auditMeta(meta),
      status: "success",
      latencyMs: Math.round(nowMs() - started),
      promptPreview: userMessage,
      systemPreview: systemPrompt,
      responsePreview: text,
      metadata: { maxTokens },
    });
    return text;
  } catch (err) {
    recordAIEvent({
      ...auditMeta(meta),
      status: "error",
      latencyMs: Math.round(nowMs() - started),
      promptPreview: userMessage,
      systemPreview: systemPrompt,
      responsePreview: err.message,
      metadata: { maxTokens },
    });
    throw err;
  }
}

async function callGeminiWithFile(systemPrompt, base64Data, mediaType, textPrompt, maxTokens = 3000, meta = {}) {
  const started = nowMs();
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, base64Data, mediaType, textPrompt, maxTokens, hasFile: true }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "AI API error");
    }
    const data = await response.json();
    const text = data.text || "";
    recordAIEvent({
      ...auditMeta(meta),
      status: "success",
      latencyMs: Math.round(nowMs() - started),
      promptPreview: textPrompt,
      systemPreview: systemPrompt,
      responsePreview: text,
      metadata: { maxTokens, mediaType, hasFile: true },
    });
    return text;
  } catch (err) {
    recordAIEvent({
      ...auditMeta(meta),
      status: "error",
      latencyMs: Math.round(nowMs() - started),
      promptPreview: textPrompt,
      systemPreview: systemPrompt,
      responsePreview: err.message,
      metadata: { maxTokens, mediaType, hasFile: true },
    });
    throw err;
  }
}

const SYLLABUS_SYSTEM = `You are an academic calendar assistant.
Extract ALL assignments, exams, quizzes, projects, readings, and due dates from the syllabus.
Return ONLY a valid JSON object with both events and summary. No markdown, no explanation.
Format: {
  "events": [{"title":"string","type":"assignment|exam|quiz|project|reading|other","dueDate":"YYYY-MM-DD","dueTime":"HH:MM or null","course":"string","priority":"high|medium|low","estimatedHours":number,"description":"string"}],
  "summary": {"instructor":"string","grading":"string","keyDates":["string"],"policies":["string"],"requirements":["string"]}
}
Priority: high=exams/major projects, medium=assignments/quizzes, low=readings.
If date is relative, estimate from semester start ${new Date().toISOString().split("T")[0]}.
For summary: extract instructor name, grading scale/breakdown, key dates, course policies, and course requirements.`;

export async function parseSyllabus(syllabusText) {
  const raw = await callGemini(
    SYLLABUS_SYSTEM,
    `Syllabus text:\n\n${syllabusText}`,
    3000,
    { feature: "Syllabus Parser", action: "parse_text_syllabus" }
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { events: parsed.events || [], summary: parsed.summary || {} };
  } catch {
    return { events: [], summary: {} };
  }
}

export async function parseSyllabusPDF(base64Data) {
  const raw = await callGeminiWithFile(
    SYLLABUS_SYSTEM,
    base64Data,
    "application/pdf",
    "Extract all academic events and due dates from this syllabus PDF, and provide a summary.",
    3000,
    { feature: "Syllabus Parser", action: "parse_pdf_syllabus" }
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { events: parsed.events || [], summary: parsed.summary || {} };
  } catch {
    return { events: [], summary: {} };
  }
}

export async function parseSyllabusImage(base64Data, mediaType) {
  const raw = await callGeminiWithFile(
    SYLLABUS_SYSTEM,
    base64Data,
    mediaType,
    "Read this syllabus image and extract all academic events, assignments, exams, and due dates. Also provide a summary.",
    3000,
    { feature: "Syllabus Parser", action: "parse_image_syllabus" }
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { events: parsed.events || [], summary: parsed.summary || {} };
  } catch {
    return { events: [], summary: {} };
  }
}

export async function buildSmartSchedule(events, energyPattern, preferences, learnedPattern = null, feedbackSummary = null) {
  const system = `You are a productivity scheduling expert with knowledge of chronobiology.
You receive academic tasks, a user's energy pattern, and optionally their LEARNED productivity data.
The learned pattern from actual sessions is MORE IMPORTANT than the energy grid.
Rules:
1. HIGH complexity tasks -> schedule at user's PEAK hours
2. LOW complexity tasks (readings) -> schedule during LOW energy hours
3. Spread work across days, never cram
4. Respect due dates, work backwards from deadlines
5. Trust learned pattern over energy grid when available
Return ONLY valid JSON. No markdown.
Format: { "schedule":[{"taskTitle":"string","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","energyMatch":"peak|medium|low","complexity":"high|medium|low","rationale":"string"}],"insights":["string"],"archetype":"string","peakHours":"string","complexityMap":{"high":"string","medium":"string","low":"string"} }`;

  const learnedSection = learnedPattern
    ? `LEARNED PATTERN (${learnedPattern.totalSessions} sessions — USE THIS FIRST):
- Archetype: ${learnedPattern.archetype}
- Best hours for COMPLEX tasks: ${learnedPattern.bestHours?.high?.map(h=>`${h}:00`).join(", ")||"insufficient data"}
- Best hours for MEDIUM tasks: ${learnedPattern.bestHours?.medium?.map(h=>`${h}:00`).join(", ")||"insufficient data"}
- Best hours for LIGHT tasks: ${learnedPattern.bestHours?.low?.map(h=>`${h}:00`).join(", ")||"insufficient data"}`
    : "No learned pattern yet — use energy grid only.";

  const userMsg = `${learnedSection}
ENERGY GRID: ${JSON.stringify(energyPattern)}
PREFERENCES: ${JSON.stringify(preferences)}
${feedbackSummary ? `\nUSER FEEDBACK FROM PREVIOUS SCHEDULES (follow these strictly):\n${feedbackSummary}\n` : ""}
TASKS: ${JSON.stringify(events)}
Build 2-week schedule from ${new Date().toISOString().split("T")[0]}.`;

  const raw = await callGemini(system, userMsg, 3000, { feature: "Smart Scheduler", action: "build_schedule" });
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export async function processVoiceCommand(transcript, existingEvents) {
  const system = `You are a calendar assistant. Parse natural language commands and return a structured action.
Return ONLY valid JSON. No markdown.
{ "action":"add|move|delete|complete|query","title":"string","date":"YYYY-MM-DD or null","time":"HH:MM or null","endTime":"HH:MM or null","targetEventTitle":"string","response":"friendly confirmation" }
Use "complete" when user says: "I finished X", "mark X done", "completed X", "I did X", "done with X".
Use "delete" only when user explicitly wants to cancel/remove with no rescheduling intent.
Today is ${new Date().toISOString().split("T")[0]}.`;
  const raw = await callGemini(
    system,
    `Command: "${transcript}"\nExisting: ${JSON.stringify(existingEvents.slice(0,10).map(e=>({title:e.title||e.taskTitle,date:e.date})))}`,
    800,
    { feature: "Voice Command", action: "parse_voice_command" }
  );
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export async function generateWeeklyDigest(weekEvents, energyPattern) {
  const system = `You are a supportive academic coach. Generate a motivating weekly digest.
Return ONLY valid JSON. No markdown.
{ "greeting":"string","weekSummary":"string","topPriority":"string","dayByDay":[{"day":"string","focus":"string","tip":"string"}],"energyTip":"string","motivationalClose":"string" }`;
  const raw = await callGemini(
    system,
    `Events: ${JSON.stringify(weekEvents)}\nArchetype: ${energyPattern?.archetype||"unknown"}\nPeak: ${energyPattern?.peakHours||"unknown"}`,
    1500,
    { feature: "Weekly Digest", action: "generate_digest" }
  );
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export async function chatWithSchedule(userMessage, schedule, events, energyPattern) {
  const system = `You are an intelligent scheduling assistant. The user can ask you to modify their schedule conversationally.

CRITICAL RULES:
1. NEVER silently cancel or delete tasks — always reschedule them to another time
2. If user says "clear Thursday night", move those tasks to the next available slot, not delete them
3. If user says "I have an exam Friday", protect Friday and move conflicting tasks earlier or to another day
4. Always explain what you're moving WHERE, not just what you're removing
5. If you're unsure what the user wants, ask a clarifying question instead of guessing

Current date: ${new Date().toISOString().split("T")[0]}

Return ONLY valid JSON:
{
  "message": "friendly explanation of what you're doing and where tasks are being moved",
  "action": "brief label e.g. 'Moved 3 slots from Thursday to Friday morning'",
  "updatedSchedule": null or the full modified schedule array with ALL slots (moved + unchanged)
}

When rescheduling, keep the task in updatedSchedule but with the new date/time.
Never drop tasks from the schedule entirely unless the user explicitly asks to cancel them AND confirms.`;

  const context = `
CURRENT SCHEDULE: ${JSON.stringify(schedule?.schedule?.slice(0,20)||[])}
EVENTS: ${JSON.stringify(events?.slice(0,15).map(e=>({title:e.title,dueDate:e.dueDate,priority:e.priority,estimatedHours:e.estimatedHours}))||[])}
ENERGY: ${JSON.stringify({archetype:energyPattern?.archetype,peakHours:energyPattern?.peakHours})}
USER SAYS: "${userMessage}"`;

  const raw = await callGemini(system, context, 2000, { feature: "AI Chat", action: "chat_schedule_update" });
  try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); }
  catch { return { message: raw, action: null, updatedSchedule: null }; }
}

export async function generateWhatsAppBriefing(todaySlots, energyPattern, riskyEvents) {
  const system = `You are a friendly daily briefing assistant. Generate a short WhatsApp message (under 300 chars) for the user's morning briefing. Be warm, specific, and add one motivational nudge. Use emojis naturally.`;
  const msg = `Today's slots: ${JSON.stringify(todaySlots.map(s=>({title:s.taskTitle,time:s.startTime,energy:s.energyMatch})))}
Peak hours: ${energyPattern?.peakHours||"unknown"}
Risky deadlines: ${riskyEvents?.slice(0,2).map(e=>e.title).join(", ")||"none"}`;
  return await callGemini(system, msg, 300, { feature: "WhatsApp Briefing", action: "generate_briefing" });
}

export async function generateSyllabusSummary(syllabusText, courseName = "Unknown Course") {
  const system = `You are a syllabus analyst. Extract and summarize key information from the provided syllabus text. 
Return ONLY valid JSON with no markdown or code blocks.
Format: { "courseName":"string", "instructor":"string", "grading":"string", "keyDates":["string"], "policies":["string"], "requirements":["string"] }
Keep summaries concise—2-3 bullet points per section.`;
  
  const userMsg = `Course: ${courseName}

Syllabus text:
${syllabusText.substring(0, 2000)}`;

  const raw = await callGemini(
    system,
    userMsg,
    1000,
    { feature: "Syllabus Summary", action: "generate_summary" }
  );
  
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return parsed;
  } catch (err) {
    console.error("Failed to parse syllabus summary:", err);
    return {
      courseName,
      instructor: "Unknown",
      grading: "Not extracted",
      keyDates: [],
      policies: [],
      requirements: []
    };
  }
}
