// server/index.js
const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const pdfParse = require("pdf-parse");
const path = require("path");
// Try multiple .env locations
const envPaths = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, ".env"),
  path.resolve(process.cwd(), ".env"),
];
let envLoaded = false;
for (const p of envPaths) {
  const result = require("dotenv").config({ path: p });
  if (!result.error) { console.log(`✅ Loaded .env from: ${p}`); envLoaded = true; break; }
}
if (!envLoaded) console.log("⚠️ No .env file found — using system environment variables");

const app  = express();
const PORT = 3001;
const GROQ_KEY   = process.env.REACT_APP_GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";

app.use(cors({
  origin: (origin, cb) => {
    // Allow localhost frontend and Chrome extension origin
    if (!origin) return cb(null, true);
    const allowed = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];
    if (allowed.includes(origin) || origin.startsWith("chrome-extension://")) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "50mb" }));

async function extractPdfTextFromBase64(base64Data) {
  if (!base64Data) return "";
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const parsed = await pdfParse(buffer);
    return (parsed.text || "").replace(/\s+\n/g, "\n").trim();
  } catch (err) {
    console.warn("PDF extract failed:", err.message);
    return "";
  }
}

// Blackboard iCal proxy
app.get("/api/blackboard-ical", async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes(".ics")) return res.status(400).json({ error: "Invalid iCal URL" });
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/calendar, */*", "Cache-Control": "no-cache" },
      maxRedirects: 15, responseType: "text", timeout: 20000,
    });
    const data = response.data;
    if (typeof data === "string" && (data.trim().startsWith("<") || data.includes("<!DOCTYPE"))) {
      return res.status(401).json({ error: "Blackboard returned a login page. Please get a fresh iCal URL." });
    }
    if (!data.includes("BEGIN:VCALENDAR")) {
      return res.status(400).json({ error: "Invalid calendar data." });
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch calendar: " + err.message });
  }
});

// Groq AI proxy
app.post("/api/gemini", async (req, res) => {
  const { systemPrompt, userMessage, textPrompt, hasFile, mediaType, maxTokens, base64Data } = req.body;
  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

    let content = userMessage || textPrompt || "";
    if (hasFile) {
      if (mediaType === "application/pdf" && base64Data) {
        const extracted = await extractPdfTextFromBase64(base64Data);
        content = `${textPrompt || userMessage || "Extract academic deadlines from this PDF."}

[PDF uploaded]
${extracted ? `\nExtracted PDF text:\n${extracted.slice(0, 35000)}` : "\nNo extractable text found in PDF."}
`;
      } else {
        content = `${textPrompt || userMessage}

[A ${mediaType} file was uploaded. Extract all academic events and due dates and return the JSON array as instructed.]`;
      }
    }
    messages.push({ role: "user", content });

    const response = await axios.post(GROQ_URL,
      { model: GROQ_MODEL, messages, max_tokens: Math.min(maxTokens || 2048, 8000), temperature: 0.3 },
      { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` } }
    );
    const text = response.data?.choices?.[0]?.message?.content || "";
    res.json({ text });
  } catch (err) {
    console.error("Groq error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
  console.log(`   Groq key:  ${process.env.REACT_APP_GROQ_API_KEY ? "✅ found" : "❌ missing"}`);
  console.log(`   Twilio SID:   ${process.env.TWILIO_ACCOUNT_SID ? "✅ " + process.env.TWILIO_ACCOUNT_SID.slice(0,8)+"..." : "❌ missing"}`);
  console.log(`   Twilio Token: ${process.env.TWILIO_AUTH_TOKEN ? "✅ found" : "❌ missing"}`);
  console.log(`   Twilio From:  ${process.env.TWILIO_WHATSAPP_FROM || "❌ missing"}`);
  console.log(`   .env path:    ${require('path').resolve('../.env')}`);
});

// WhatsApp briefing via Twilio
app.post("/api/whatsapp", async (req, res) => {
  const { message, to } = req.body;
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM  = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return res.status(400).json({ error: "Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM to .env" });
  }
  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_FROM,
        To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
        Body: message
      }),
      { auth: { username: TWILIO_SID, password: TWILIO_TOKEN } }
    );
    res.json({ success: true, sid: response.data.sid });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});
