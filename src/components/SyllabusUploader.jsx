// src/components/SyllabusUploader.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "./UILibrary";
import { parseSyllabus, parseSyllabusPDF, parseSyllabusImage } from "../api/gemini";
import { saveSyllabus } from "../utils/syllabusStore";

// Convert a File object → base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]); // strip data:...;base64,
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Detect what kind of file was dropped
function getFileKind(file) {
  if (file.type === "application/pdf")                          return "pdf";
  if (file.type.startsWith("image/"))                          return "image";
  if (file.type === "text/plain" || file.name.endsWith(".txt")) return "text";
  return "unknown";
}

const ACCEPTED = {
  "application/pdf":  [".pdf"],
  "image/png":        [".png"],
  "image/jpeg":       [".jpg", ".jpeg"],
  "image/webp":       [".webp"],
  "image/gif":        [".gif"],
  "text/plain":       [".txt"],
};

export default function SyllabusUploader({ onEventsExtracted }) {
  const [status,    setStatus]    = useState("idle");
  const [events,    setEvents]    = useState([]);
  const [error,     setError]     = useState(null);
  const [fileName,  setFileName]  = useState(null);
  const [fileKind,  setFileKind]  = useState(null);
  const [preview,   setPreview]   = useState(null); // image preview URL
  const [pasteText, setPasteText] = useState("");
  const [mode,      setMode]      = useState("upload");

  // Voice input state
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.interimResults = true;
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setPasteText(prev => prev + (prev ? " " : "") + transcript);
          } else {
            interim += transcript;
          }
        }
      };

      recognitionRef.current.onend = () => {
        setListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setListening(false);
      };
    }
  }, []);

  const startVoiceInput = () => {
    if (recognitionRef.current && !listening) {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  const finalize = async (extracted, name, summaryData = {}) => {
    if (!extracted || extracted.length === 0) {
      throw new Error("No events found. Check the file has visible due dates, or try pasting the text.");
    }
    
    console.log("FINALIZE:", { extracted: extracted.length, name, summaryData });
    
    // Stamp every extracted event with the unified "course" source tag.
    // This is what drives the maroon 🎓 pill on the Calendar and the
    // Course filter chip. Without this, uploaded events fell into the
    // "manual" bucket (B1).
    const stamped = extracted.map(ev => ({ ...ev, source: ev.source || "course" }));
    setEvents(stamped);
    onEventsExtracted(stamped);
    
    // Save syllabus summary
    try {
      setStatus("summarizing");
      
      // Extract course name from events (look for course code or title pattern)
      let courseName = "Unknown Course";
      if (extracted.length > 0 && extracted[0].course) {
        courseName = extracted[0].course;
      } else if (name) {
        courseName = name.replace(/\.[^.]+$/, "").substring(0, 50);
      }
      
      // Use provided summary data or fallback
      const summary = summaryData || {};
      
      // Generate course code from course name
      const courseCode = courseName
        .split(" ")
        .slice(0, 2)
        .join("")
        .toUpperCase()
        .substring(0, 10);
      
      // Save syllabus with summary
      const syllabusToSave = {
        courseCode,
        courseName: summary.courseName || courseName,
        instructor: summary.instructor || "Unknown",
        grading: summary.grading || "Not provided",
        keyDates: summary.keyDates || [],
        policies: summary.policies || [],
        requirements: summary.requirements || [],
        eventCount: extracted.length,
      };
      
      console.log("SAVING SYLLABUS:", syllabusToSave);
      saveSyllabus(syllabusToSave);
      console.log("✅ SAVED!");
    } catch (err) {
      console.error("❌ Failed to save syllabus summary:", err);
      // Still mark as done even if summary fails
    }
    
    setStatus("done");
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const kind = getFileKind(file);
    if (kind === "unknown") {
      setError("Unsupported file type. Please upload a PDF, image (PNG/JPG/WEBP), or .txt file.");
      return;
    }

    setStatus("reading");
    setError(null);
    setFileName(file.name);
    setFileKind(kind);
    setPreview(null);

    try {
      let result;

      let extractedText = "";
      if (kind === "text") {
        // Plain text — read as string
        extractedText = await file.text();
        setStatus("parsing");
        result = await parseSyllabus(extractedText);

      } else if (kind === "pdf") {
        // PDF — send base64 to Claude's document API
        setStatus("parsing");
        const base64 = await fileToBase64(file);
        result = await parseSyllabusPDF(base64);

      } else if (kind === "image") {
        // Image — show preview, send base64 to Claude's vision API
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        setStatus("parsing");
        const base64 = await fileToBase64(file);
        result = await parseSyllabusImage(base64, file.type);
      }

      // Extract events and summary from result
      const extracted = result?.events || [];
      const summary = result?.summary || {};
      
      console.log("API RESPONSE:", { events: extracted.length, summary, result });
      
      await finalize(extracted, file.name, summary);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
  });

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    setStatus("parsing");
    setFileName("Pasted syllabus");
    setFileKind("text");
    setError(null);
    try {
      const result = await parseSyllabus(pasteText);
      const extracted = result?.events || [];
      const summary = result?.summary || {};
      await finalize(extracted, "Pasted syllabus", summary);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle"); setEvents([]); setFileName(null);
    setFileKind(null); setPreview(null); setPasteText(""); setError(null);
  };

  const priorityColor = (p) => ({ high: "#ef4444", medium: "#f59e0b", low: "#22c55e" }[p] || "#94a3b8");
  const typeEmoji = (t) => ({ exam:"📝", assignment:"📋", quiz:"✏️", project:"🏗️", reading:"📖" }[t] || "📌");

  const kindLabel = { pdf:"PDF", image:"image", text:"text file" }[fileKind] || "file";
  const statusMsg = {
    reading: `Reading ${kindLabel}...`,
    parsing: fileKind === "pdf"   ? `Claude is reading your PDF syllabus...` :
             fileKind === "image" ? `Claude is reading your syllabus image...` :
                                   `Claude is extracting events...`,
    summarizing: "Generating syllabus summary...",
  }[status];

  return (
    <div>
      <div className="card">
        <div className="card-title">📄 Syllabus Parser</div>
        <div style={{ marginBottom: 8 }}><span className="ai-badge">AI-powered</span></div>
        <div className="card-sub">
          Upload your syllabus in any format — PDF, photo, screenshot, or plain text.
          Claude reads it directly and extracts every due date automatically.
        </div>

        {/* Supported formats banner */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          {[
            { icon:"📄", label:"PDF",        desc:"Blackboard exports" },
            { icon:"📸", label:"Image",       desc:"PNG · JPG · WEBP · screenshot" },
            { icon:"📋", label:"Text",        desc:".txt or paste" },
          ].map(f => (
            <div key={f.label} style={{ display:"flex", alignItems:"center", gap:6, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 12px", fontSize:"0.78rem" }}>
              <span style={{ fontSize:16 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight:600 }}>{f.label}</div>
                <div style={{ color:"#94a3b8", fontSize:"0.68rem" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Mode toggle */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          <Button variant={mode==="upload"?"primary":"secondary"} onClick={() => setMode("upload")}>📎 Upload file</Button>
          <Button variant={mode==="paste"?"primary":"secondary"} onClick={() => setMode("paste")}>📋 Paste text</Button>
          {voiceSupported && <Button variant={mode==="voice"?"primary":"secondary"} onClick={() => setMode("voice")}>🎤 Voice dictate</Button>}
        </div>

        {mode === "upload" && status === "idle" && (
          <div {...getRootProps()} className={`dropzone ${isDragActive?"active":""}`}>
            <input {...getInputProps()} />
            <div className="dropzone-icon">📂</div>
            <p style={{ fontWeight:500, marginBottom:6 }}>
              {isDragActive ? "Drop it here!" : "Drop your syllabus here, or click to browse"}
            </p>
            <p className="dropzone-text">PDF · PNG · JPG · WEBP · TXT &nbsp;·&nbsp; Max 20MB</p>
            <p className="dropzone-text" style={{ marginTop:8, fontSize:"0.72rem" }}>
              💡 Works with Blackboard PDFs, syllabus photos, and screenshots
            </p>
          </div>
        )}

        {mode === "paste" && status === "idle" && (
          <div>
            <textarea
              className="input"
              style={{ height:200, resize:"vertical", fontFamily:"monospace", fontSize:"0.8rem" }}
              placeholder={"Paste your syllabus text here...\n\nExample:\nWeek 3 — Assignment 1 due January 28\nMidterm Exam — February 15 at 2:00 PM\nFinal Project — March 20"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <Button variant="primary"
              style={{marginTop:10}}
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}>
              🧠 Parse with Claude
            </Button>
          </div>
        )}

        {mode === "voice" && status === "idle" && (
          <div>
            <div style={{background:"#f0f9ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"12px 14px",marginBottom:16}}>
              <div style={{fontSize:"0.85rem",color:"#1e40af",fontWeight:500}}>
                🎤 Speak naturally to dictate your syllabus
              </div>
              <div style={{fontSize:"0.75rem",color:"#1e40af",marginTop:4}}>
                Say dates, deadlines, assignments, exams — the AI will extract and organize them automatically
              </div>
            </div>
            <textarea
              className="input"
              style={{ height:180, resize:"vertical", fontFamily:"monospace", fontSize:"0.8rem", background:listening?"#fef3c7":"#ffffff" }}
              placeholder={"Your dictated text will appear here..."}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <Button variant={listening?"secondary":"primary"}
                onClick={listening ? stopVoiceInput : startVoiceInput}
                style={{flex:1}}>
                {listening ? "⏸ Stop recording" : "🎤 Start dictating"}
              </Button>
              <Button variant="primary"
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}>
                🧠 Parse with Claude
              </Button>
            </div>
          </div>
        )}

        {/* Image preview */}
        {preview && (
          <div style={{ marginTop:12, marginBottom:12 }}>
            <div className="sec-label">Uploaded image</div>
            <img
              src={preview} alt="Syllabus"
              style={{ maxWidth:"100%", maxHeight:300, borderRadius:8, border:"1px solid #e2e8f0", objectFit:"contain" }}
            />
          </div>
        )}

        {/* Status */}
        {(status==="reading" || status==="parsing") && (
          <div style={{ marginTop:16 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", color:"#64748b", marginBottom:8 }}>
              <span className="spinner"/> {statusMsg}
            </div>
            {status==="parsing" && fileKind==="pdf" && (
              <div style={{ fontSize:"0.75rem", color:"#94a3b8" }}>
                Claude reads the full PDF natively — no OCR needed, works even with complex layouts
              </div>
            )}
            {status==="parsing" && fileKind==="image" && (
              <div style={{ fontSize:"0.75rem", color:"#94a3b8" }}>
                Claude's vision model reads the image directly — works with photos, screenshots, and scans
              </div>
            )}
          </div>
        )}

        {status==="error" && (
          <div style={{marginTop:16,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"12px 14px",color:"#dc2626",fontSize:"0.85rem"}}>
            ⚠️ {error}
            <Button variant="ghost" style={{marginLeft:12,fontSize:"0.78rem",padding:"4px 10px"}} onClick={reset}>Try again</Button>
          </div>
        )}
      </div>

      {/* Results */}
      {status==="done" && events.length > 0 && (
        <div className="card">
          <div className="card-title">
            ✅ {events.length} events extracted
            <span style={{ fontSize:"0.78rem", fontWeight:400, color:"#64748b", marginLeft:8 }}>from {fileName}</span>
          </div>
          <div style={{ marginBottom: 8 }}><span className="ai-badge">AI-extracted deadlines</span></div>
          <div className="card-sub">
            Review below, then go to ⚡ Energy to log your patterns, or 🧠 Schedule to build your AI-optimized calendar.
          </div>

          {/* Type summary */}
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            {["exam","assignment","quiz","project","reading","other"].map(type => {
              const count = events.filter(e=>e.type===type).length;
              if (!count) return null;
              return (
                <div key={type} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 14px", textAlign:"center", minWidth:64 }}>
                  <div style={{ fontSize:"1.2rem" }}>{typeEmoji(type)}</div>
                  <div style={{ fontWeight:600, fontSize:"1rem" }}>{count}</div>
                  <div style={{ fontSize:"0.7rem", color:"#94a3b8", textTransform:"capitalize" }}>{type}s</div>
                </div>
              );
            })}
          </div>

          {/* Event list */}
          <div className="event-list">
            {events.map((event, i) => (
              <div key={i} className={`event-item ${event.priority}`}>
                <span style={{ fontSize:"1.2rem" }}>{typeEmoji(event.type)}</span>
                <div style={{ flex:1 }}>
                  <div className="event-title">{event.title}</div>
                  <div className="event-meta">
                    {event.course   && <span style={{ marginRight:10 }}>📚 {event.course}</span>}
                    <span style={{ marginRight:10 }}>📅 {event.dueDate}{event.dueTime?` at ${event.dueTime}`:""}</span>
                    <span style={{ marginRight:10 }}>⏱ ~{event.estimatedHours}h</span>
                  </div>
                  {event.description && <div style={{ fontSize:"0.75rem", color:"#94a3b8", marginTop:2 }}>{event.description}</div>}
                </div>
                <span className={`badge badge-${event.priority}`}>{event.priority}</span>
              </div>
            ))}
          </div>

          <div style={{marginTop:16,display:"flex",gap:8}}>
            <Button variant="secondary" onClick={reset}>Upload another</Button>
          </div>
        </div>
      )}

      {/* Demo tip */}
      {status==="idle" && (
        <div className="card" style={{ background:"#fffbeb", borderColor:"#fde68a" }}>
          <div className="card-title" style={{ fontSize:"0.85rem" }}>💡 Demo tip</div>
          <p style={{ fontSize:"0.82rem", color:"#78350f", lineHeight:1.7 }}>
            Don't have a syllabus? Use "Paste text" and try:<br/>
            <code style={{ display:"block", marginTop:8, background:"#fff", padding:"8px 10px", borderRadius:6, fontSize:"0.78rem" }}>
              Stats Assignment 1 due Feb 3 (2 hours){"\n"}
              Midterm Exam — Feb 18 at 10am{"\n"}
              Group Project Proposal due Feb 28{"\n"}
              Final Exam — March 15
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
