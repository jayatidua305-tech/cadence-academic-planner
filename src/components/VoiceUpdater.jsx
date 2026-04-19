// src/components/VoiceUpdater.jsx
import React, { useState, useEffect, useRef } from "react";
import { Button } from "./UILibrary";
import { processVoiceCommand } from "../api/gemini";
import { markDone } from "../utils/completionStore";

export default function VoiceUpdater({ events, onEventsChange }) {
  const [listening, setListening]     = useState(false);
  const [transcript, setTranscript]   = useState("");
  const [processing, setProcessing]   = useState(false);
  const [result, setResult]           = useState(null);
  const [history, setHistory]         = useState([]);
  const [error, setError]             = useState(null);
  const [supported, setSupported]     = useState(true);
  const recognitionRef                = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setSupported(false); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous     = false;
    recognition.interimResults = true;
    recognition.lang           = "en-US";

    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        handleProcess(t);
      }
    };
    recognition.onerror = (e) => {
      setError(`Mic error: ${e.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  const startListening = () => {
    setTranscript("");
    setResult(null);
    setError(null);
    setListening(true);
    recognitionRef.current?.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const handleProcess = async (text) => {
    if (!text.trim()) return;
    setProcessing(true);
    setError(null);

    try {
      const action = await processVoiceCommand(text, events);
      setResult(action);

      // Apply the action to events
      let updatedEvents = [...events];

      if (action.action === "add" && action.title) {
        updatedEvents.push({
          title: action.title,
          date: action.date,
          startTime: action.time,
          endTime: action.endTime,
          priority: "medium",
          type: "other",
          aiScheduled: false,
        });
      } else if (action.action === "move" && action.targetEventTitle) {
        updatedEvents = updatedEvents.map(e =>
          (e.title || e.taskTitle || "").toLowerCase().includes(action.targetEventTitle.toLowerCase())
            ? { ...e, date: action.date || e.date, startTime: action.time || e.startTime }
            : e
        );
      } else if (action.action === "complete" || action.action === "done") {
        // Mark as completed — update the today done list in localStorage
        const matched = updatedEvents.filter(e =>
          (e.title || e.taskTitle || "").toLowerCase().includes((action.targetEventTitle || "").toLowerCase())
        );
        matched.forEach(ev => {
          const key = `${ev.date}-${ev._idx ?? 0}-${ev.taskTitle || ev.title}`;
          try {
            const done = new Set(JSON.parse(localStorage.getItem("smart_cal_today_done") || "[]"));
            done.add(key);
            localStorage.setItem("smart_cal_today_done", JSON.stringify([...done]));
            markDone(key, ev.title || ev.taskTitle);
          } catch {}
        });
        // Don't remove from events list — just mark done
        updatedEvents = updatedEvents.map(e =>
          (e.title || e.taskTitle || "").toLowerCase().includes((action.targetEventTitle || "").toLowerCase())
            ? { ...e, completed: true }
            : e
        );
      } else if (action.action === "delete" && action.targetEventTitle) {
        // Don't silently delete — mark as cancelled instead
        updatedEvents = updatedEvents.map(e =>
          (e.title || e.taskTitle || "").toLowerCase().includes(action.targetEventTitle.toLowerCase())
            ? { ...e, cancelled: true }
            : e
        );
      }

      if (action.action !== "query") onEventsChange(updatedEvents);

      setHistory(h => [{ transcript: text, action, timestamp: new Date().toLocaleTimeString() }, ...h.slice(0, 9)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) handleProcess(transcript);
  };

  const EXAMPLES = [
    "Move my Stats assignment to Thursday at 11pm",
    "Add office hours with Professor Lee on Friday at 2pm",
    "Schedule study session for the midterm on Tuesday evening",
    "Delete the reading assignment for next week",
    "What's due this week?",
  ];

  return (
    <div>
      <div className="card">
        <div className="card-title">🎤 Voice Calendar Updates</div>
        <div style={{ marginBottom: 8 }}><span className="ai-badge">AI command parsing</span></div>
        <div className="card-sub">
          Speak naturally to update your calendar. Claude understands context — no commands to memorize.
        </div>

        {!supported && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", color: "#dc2626", marginBottom: 16, fontSize: "0.85rem" }}>
            ⚠️ Your browser doesn't support speech recognition. Use the text box below instead.
          </div>
        )}

        {/* Voice button */}
        <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
          <button
            className={`voice-btn ${listening ? "listening" : ""}`}
            onClick={listening ? stopListening : startListening}
            disabled={!supported || processing}
            title={listening ? "Click to stop" : "Click to speak"}
          >
            {listening ? "⏹️" : "🎤"}
          </button>
          <div style={{ marginTop: 12, fontSize: "0.85rem", color: "#64748b" }}>
            {listening   ? "Listening... speak now" :
             processing  ? "Processing with Claude..." :
                           "Click to speak"}
          </div>

          {/* Transcript */}
          {transcript && (
            <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 16px", fontSize: "0.9rem", color: "#0f172a", maxWidth: 500, margin: "12px auto 0" }}>
              "{transcript}"
            </div>
          )}
        </div>

        {/* Text fallback */}
        <div className="sec-label">Or type a command</div>
        <form onSubmit={handleTextSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            className="input"
            placeholder='e.g. "Move stats homework to Thursday 11pm"'
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!transcript.trim() || processing}>
            {processing ? <span className="spinner"/> : "→"}
          </Button>
        </form>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#166534", marginBottom: 4 }}>
              ✅ {result.action?.toUpperCase()} action
            </div>
            <div style={{ fontSize: "0.85rem", color: "#15803d" }}>{result.response}</div>
            {result.date && <div style={{ fontSize: "0.75rem", color: "#16a34a", marginTop: 4 }}>📅 {result.date} {result.time || ""}</div>}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: "0.82rem" }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Example commands */}
      <div className="card">
        <div className="card-title" style={{ fontSize: "0.9rem" }}>💬 Example commands</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {EXAMPLES.map((ex, i) => (
            <Button key={i} variant="ghost" style={{textAlign:"left",justifyContent:"flex-start",padding:"8px 12px"}}
              onClick={() => { setTranscript(ex); handleProcess(ex); }}>
              <span style={{color:"var(--purple-l)",marginRight:6}}>▸</span>
              "{ex}"
            </Button>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ fontSize: "0.9rem" }}>📜 Command history</div>
          {history.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.82rem" }}>
              <span style={{ color: "#94a3b8", minWidth: 60, fontFamily: "monospace" }}>{item.timestamp}</span>
              <span style={{ color: "#64748b", fontStyle: "italic" }}>"{item.transcript}"</span>
              <span style={{ background: "#eff6ff", color: "#2563eb", padding: "1px 6px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 600, alignSelf: "flex-start" }}>{item.action?.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
