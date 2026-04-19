// src/api/claude.js
// All Claude API calls go through here

const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-20250514";

// ── Proxy URL — all requests go through local Express server ─────────────────
// This avoids CORS issues when calling Anthropic from the browser
const PROXY_URL = "http://localhost:3001/api/claude";

// ── Plain text call ──────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMessage, maxTokens = 2048) {
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Claude API error");
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── File call (PDF or image passed as base64) ────────────────────────────────
async function callClaudeWithFile(systemPrompt, base64Data, mediaType, textPrompt, maxTokens = 3000) {
  const fileBlock = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
    : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64Data } };

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: textPrompt }] }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Claude API error");
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── Shared system prompt for syllabus parsing ────────────────────────────────
const SYLLABUS_SYSTEM = `You are an academic calendar assistant.
Extract ALL assignments, exams, quizzes, projects, readings, and due dates from the syllabus.
Return ONLY a valid JSON array. No markdown, no explanation, just the raw JSON array.

Each event must have these exact fields:
{
  "title": "string — short task name",
  "type": "assignment|exam|quiz|project|reading|other",
  "dueDate": "YYYY-MM-DD",
  "dueTime": "HH:MM" or null,
  "course": "string — course name or code",
  "priority": "high|medium|low",
  "estimatedHours": number,
  "description": "string — brief description"
}

Priority rules:
- high: exams, major projects, final papers, midterms
- medium: assignments, quizzes, presentations, homework
- low: readings, participation, minor tasks

If a date is relative (e.g. "Week 3" or "Session 4"), estimate based on a semester starting ${new Date().toISOString().split("T")[0]}.
If no time is specified, set dueTime to null.
Extract EVERY deadline you can find — be thorough.`;

// ── 1a. Parse plain text syllabus ────────────────────────────────────────────
export async function parseSyllabus(syllabusText) {
  const raw = await callClaude(
    SYLLABUS_SYSTEM,
    `Here is the syllabus text:\n\n${syllabusText}`,
    3000
  );
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// ── 1b. Parse PDF syllabus (base64) ─────────────────────────────────────────
export async function parseSyllabusPDF(base64Data) {
  const raw = await callClaudeWithFile(
    SYLLABUS_SYSTEM,
    base64Data,
    "application/pdf",
    "Please extract all academic events and due dates from this syllabus PDF.",
    3000
  );
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// ── 1c. Parse image syllabus (screenshot/photo) ──────────────────────────────
export async function parseSyllabusImage(base64Data, mediaType) {
  const raw = await callClaudeWithFile(
    SYLLABUS_SYSTEM,
    base64Data,
    mediaType,
    "This is an image of a syllabus. Please read it carefully and extract all academic events, assignments, exams, and due dates.",
    3000
  );
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// ── 2. Build optimized schedule from events + energy pattern + learned pattern ─
export async function buildSmartSchedule(events, energyPattern, preferences, learnedPattern = null) {
  const system = `You are a productivity scheduling expert with knowledge of chronobiology.
You will receive a list of academic tasks, a user's hourly energy pattern, and optionally
their LEARNED productivity data from actual logged work sessions.

The learned pattern is MORE IMPORTANT than the initial energy grid — it reflects real behavior.

Scheduling rules:
1. HIGH complexity tasks (exams prep, NLP assignments, coding, math) → schedule at the user's PEAK hours for complex work
2. LOW complexity tasks (readings, extra credit, lecture review) → schedule during LOW energy hours
3. MEDIUM complexity tasks → schedule during medium energy periods
4. Spread work across days, never cram
5. Respect due dates — work backwards from deadlines
6. If learned pattern conflicts with energy grid, TRUST the learned pattern

Return ONLY valid JSON. No markdown.

Format:
{
  "schedule": [
    {
      "taskTitle": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "energyMatch": "peak|medium|low",
      "complexity": "high|medium|low",
      "rationale": "one sentence — specifically mention WHY this time slot based on their pattern"
    }
  ],
  "insights": ["string — 3-4 specific insights about this person's pattern"],
  "archetype": "Night Owl|Morning Person|Afternoon Peak|Consistent",
  "peakHours": "string e.g. '10pm–1am'",
  "complexityMap": {
    "high": "string — best hours for complex work",
    "medium": "string — best hours for medium work",
    "low": "string — best hours for light work"
  }
}`;

  const learnedSection = learnedPattern ? `
LEARNED PATTERN FROM ACTUAL SESSIONS (${learnedPattern.totalSessions} sessions logged — USE THIS):
- Archetype: ${learnedPattern.archetype}
- Best hours for COMPLEX tasks (NLP, coding, math): ${learnedPattern.bestHours?.high?.map(h => `${h}:00`).join(", ") || "insufficient data"}
- Best hours for MEDIUM tasks: ${learnedPattern.bestHours?.medium?.map(h => `${h}:00`).join(", ") || "insufficient data"}  
- Best hours for LIGHT tasks (readings): ${learnedPattern.bestHours?.low?.map(h => `${h}:00`).join(", ") || "insufficient data"}
- Insights: ${learnedPattern.insights?.join(" | ")}
` : "No learned pattern yet — use energy grid only.";

  const userMsg = `
${learnedSection}

INITIAL ENERGY GRID (secondary — use only if learned pattern is unavailable):
${JSON.stringify(energyPattern, null, 2)}

USER PREFERENCES:
${JSON.stringify(preferences, null, 2)}

TASKS TO SCHEDULE:
${JSON.stringify(events, null, 2)}

Build a 2-week optimized schedule starting from today (${new Date().toISOString().split("T")[0]}).
For each task's rationale, specifically mention the user's pattern — e.g. "Scheduled at 11pm because your logged sessions show peak focus for complex work at this hour."`;

  const raw = await callClaude(system, userMsg, 3000);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── 3. Process voice command → calendar action ───────────────────────────────
export async function processVoiceCommand(transcript, existingEvents) {
  const system = `You are a calendar assistant. Parse natural language commands and return a structured calendar action.
Return ONLY valid JSON. No markdown.

Action types: "add", "move", "delete", "query"

Format:
{
  "action": "add|move|delete|query",
  "title": "string",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "endTime": "HH:MM or null",
  "targetEventTitle": "string — for move/delete, which event to modify",
  "response": "string — friendly confirmation message to show the user"
}

Today is ${new Date().toISOString().split("T")[0]}.`;

  const userMsg = `Voice command: "${transcript}"
  
Existing events: ${JSON.stringify(existingEvents.slice(0, 10).map(e => ({
    title: e.title, date: e.date, time: e.startTime
  })), null, 2)}`;

  const raw = await callClaude(system, userMsg, 800);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── 4. Generate weekly digest ─────────────────────────────────────────────────
export async function generateWeeklyDigest(weekEvents, energyPattern) {
  const system = `You are a supportive academic coach. Generate a motivating, practical weekly digest.
Be specific, reference actual task names, and give concrete advice.
Return ONLY valid JSON. No markdown.

Format:
{
  "greeting": "string — personalized opener referencing their schedule",
  "weekSummary": "string — 2 sentences overview of the week",
  "topPriority": "string — the single most important thing this week",
  "dayByDay": [
    { "day": "Monday", "focus": "string", "tip": "string" }
  ],
  "energyTip": "string — advice based on their energy pattern",
  "motivationalClose": "string — encouraging closer"
}`;

  const userMsg = `This week's events: ${JSON.stringify(weekEvents, null, 2)}
  
Energy pattern archetype: ${energyPattern.archetype || "unknown"}
Peak hours: ${energyPattern.peakHours || "unknown"}`;

  const raw = await callClaude(system, userMsg, 1500);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
