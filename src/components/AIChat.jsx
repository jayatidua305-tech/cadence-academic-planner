// src/components/AIChat.jsx
// Conversational AI with confirmation before any destructive schedule changes
// ENHANCED: Voice input/output for hands-free interaction

import React, { useState, useRef, useEffect } from "react";
import { Button } from "./UILibrary";
import { chatWithSchedule } from "../api/gemini";

// Actions that require user confirmation before applying
const DESTRUCTIVE_ACTIONS = ["clear", "delete", "remove", "cancel", "reschedule", "move", "shift"];

function isDestructive(action) {
  if (!action) return false;
  const a = action.toLowerCase();
  return DESTRUCTIVE_ACTIONS.some(k => a.includes(k));
}

export default function AIChat({ schedule, events, energyPattern, onScheduleUpdate }) {
  const [messages,  setMessages]  = useState([
    {
      role: "assistant",
      text: "Hi! I'm your AI scheduling assistant. Tell me what you need:\n• \"Clear Thursday night and reschedule those tasks\"\n• \"Move everything after 10pm to the weekend\"\n• \"I have an exam Friday, protect Thursday evening\"\n• \"What's my riskiest deadline?\"\n• \"Add 2 hours of study time tomorrow afternoon\"",
    },
  ]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pending,  setPending]  = useState(null);
  const bottomRef               = useRef(null);
  
  // Voice capabilities
  const [listening, setListening]     = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speaking, setSpeaking]       = useState(false);
  const recognitionRef                = useRef(null);
  const synth                         = typeof window !== 'undefined' ? window.speechSynthesis : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Initialize Web Speech API for voice recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { 
      setVoiceSupported(false); 
      return; 
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join("");
      setInput(transcript);
      
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        // Auto-send after a short delay to allow user to verify
        setTimeout(() => {
          if (transcript.trim()) {
            send();
          }
        }, 500);
      }
    };
    
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      setListening(false);
    };
    
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  // Voice input function
  const startVoiceInput = () => {
    if (!recognitionRef.current) return;
    setListening(true);
    setInput(""); // Clear input to show fresh transcript
    recognitionRef.current.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  // Text-to-speech function
  const speakMessage = (text) => {
    if (!synth || speaking) return;
    
    // Cancel any existing speech
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    
    synth.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synth) {
      synth.cancel();
      setSpeaking(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    setPending(null);

    try {
      const reply = await chatWithSchedule(text, schedule, events, energyPattern);

      // If AI wants to change schedule AND it's a destructive action → ask first
      if (reply.updatedSchedule && isDestructive(reply.action || text)) {
        // Work out what's being removed/moved
        const currentKeys  = new Set((schedule?.schedule || []).map(s => `${s.date}|${s.startTime}|${s.taskTitle||s.title}`));
        const updatedKeys  = new Set((reply.updatedSchedule || []).map(s => `${s.date}|${s.startTime}|${s.taskTitle||s.title}`));
        const removed      = (schedule?.schedule || []).filter(s => !updatedKeys.has(`${s.date}|${s.startTime}|${s.taskTitle||s.title}`));
        const added        = (reply.updatedSchedule || []).filter(s => !currentKeys.has(`${s.date}|${s.startTime}|${s.taskTitle||s.title}`));

        // Show the AI's plan + ask for confirmation
        setMessages(prev => [...prev, {
          role: "assistant",
          text: reply.message,
          isPending: true,
        }]);
        setPending({ reply, removed, added });
      } else if (reply.updatedSchedule) {
        // Non-destructive (info query or minor add) → apply directly.
        // Wrap the array in the { schedule: [...] } shape the app expects.
        const nextSchedule = Array.isArray(reply.updatedSchedule)
          ? { schedule: reply.updatedSchedule }
          : reply.updatedSchedule;
        onScheduleUpdate(nextSchedule);
        setMessages(prev => [...prev, {
          role: "assistant",
          text: reply.message,
          action: reply.action,
        }]);
      } else {
        // Pure info reply — no schedule change
        setMessages(prev => [...prev, {
          role: "assistant",
          text: reply.message,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        text: `Sorry, I hit an error: ${err.message}`,
      }]);
    }
    setLoading(false);
  };

  const confirmChange = () => {
    if (!pending) return;
    const nextSchedule = Array.isArray(pending.reply.updatedSchedule)
      ? { schedule: pending.reply.updatedSchedule }
      : pending.reply.updatedSchedule;
    onScheduleUpdate(nextSchedule);
    setMessages(prev => [
      ...prev.filter(m => !m.isPending),
      {
        role: "assistant",
        text: `✅ Done! ${pending.reply.action || "Schedule updated."}`,
        action: pending.reply.action,
      },
    ]);
    setPending(null);
  };

  const rejectChange = () => {
    setMessages(prev => [
      ...prev.filter(m => !m.isPending),
      {
        role: "assistant",
        text: "No problem — I've kept your schedule exactly as it was. Let me know if you'd like to try something different.",
      },
    ]);
    setPending(null);
  };

  const SUGGESTIONS = [
    "What's my riskiest deadline?",
    "Show overloaded days",
    "Clear Thursday night, reschedule tasks",
    "Move late tasks to weekend",
    "How productive have I been?",
    "Add study time tomorrow afternoon",
  ];

  return (
    <div className="card" style={{ display:"flex", flexDirection:"column", height:520, padding:0, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)",
        background:"var(--bg-deep)", borderRadius:"14px 14px 0 0" }}>
        <div style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--text)", marginBottom:1 }}>
          AI Schedule Assistant
        </div>
        <div style={{ marginTop: 4, marginBottom: 4 }}><span className="ai-badge">LLM Assistant</span></div>
        <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>
          Changes are previewed before applying — nothing updates without your go-ahead
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:"flex", justifyContent: msg.role==="user" ? "flex-end" : "flex-start", gap: msg.role==="assistant" ? 8 : 0, alignItems: "flex-end" }}>
            {/* Speak button for AI messages */}
            {msg.role==="assistant" && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (speaking) stopSpeaking();
                  else speakMessage(msg.text);
                }}
                disabled={!!pending}
                style={{padding:"4px 8px", fontSize:"0.75rem", flexShrink:0}}
                title={speaking ? "Stop speaking" : "Read aloud"}
              >
                {speaking ? "⏸️" : "🔊"}
              </Button>
            )}
            <div style={{
              maxWidth:"82%", padding:"10px 14px",
              background: msg.role==="user" ? "var(--grad-purple)" : "#ffffff",
              border: msg.role==="user" ? "none" : "1px solid #d8cfc5",
              color: msg.role==="user" ? "#fff" : "#1a1a1a", fontSize:"0.82rem", lineHeight:1.6,
              whiteSpace:"pre-wrap",
              boxShadow: msg.role==="assistant" ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
              borderRadius: msg.role==="user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            }}>
              {msg.text}
              {msg.action && !msg.isPending && (
                <div style={{ marginTop:6, fontSize:"0.72rem", color:"var(--green)",
                  background:"rgba(74,222,128,0.1)", borderRadius:6, padding:"3px 8px", display:"inline-block" }}>
                  ✅ {msg.action}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ── Confirmation card ── */}
        {pending && (
          <div style={{
            background:"rgba(251,191,36,0.08)",
            border:"1px solid rgba(251,191,36,0.35)",
            borderRadius:12, padding:"14px 16px",
          }}>
            <div style={{ fontWeight:700, fontSize:"0.85rem", color:"#92400e", marginBottom:10 }}>
              ⚠️ Review changes before applying
            </div>

            {/* What will be removed */}
            {pending.removed.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:"0.72rem", fontWeight:600, color:"var(--red)",
                  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
                  🗑 Will be removed ({pending.removed.length})
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {pending.removed.map((s, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                      padding:"6px 10px", borderRadius:8,
                      background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)" }}>
                      <span style={{ fontFamily:"JetBrains Mono", fontSize:"0.68rem", color:"var(--hint)", flexShrink:0 }}>
                        {s.date} {s.startTime}
                      </span>
                      <span style={{ fontSize:"0.78rem", fontWeight:500, color:"var(--text)",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.taskTitle || s.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What will be added/moved to */}
            {pending.added.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:"0.72rem", fontWeight:600, color:"var(--green)",
                  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
                  ✅ Will be rescheduled to ({pending.added.length})
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {pending.added.map((s, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                      padding:"6px 10px", borderRadius:8,
                      background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)" }}>
                      <span style={{ fontFamily:"JetBrains Mono", fontSize:"0.68rem", color:"var(--hint)", flexShrink:0 }}>
                        {s.date} {s.startTime}
                      </span>
                      <span style={{ fontSize:"0.78rem", fontWeight:500, color:"var(--text)",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.taskTitle || s.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm / Cancel */}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={confirmChange} style={{flex:1, padding:"9px", borderRadius:10, fontSize:"0.85rem", fontWeight:600, background:"#16a34a", color:"#fff", border:"none", cursor:"pointer"}}>
                ✅ Yes, apply changes
              </button>
              <button onClick={rejectChange} style={{flex:1, padding:"9px", borderRadius:10, fontSize:"0.85rem", fontWeight:600, background:"#fff", color:"#374151", border:"1px solid #d1d5db", cursor:"pointer"}}>
                ❌ No, keep as is
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ padding:"10px 14px", borderRadius:"12px 12px 12px 2px",
              background:"#ffffff", border:"1px solid #d8cfc5",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
              display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"var(--purple-l)",
                  animation:`bounce 1s ease-in-out ${i*0.15}s infinite` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestions */}
      <div style={{ padding:"0 18px 8px", display:"flex", gap:5, flexWrap:"wrap" }}>
        {SUGGESTIONS.map(s => (
          <Button key={s} variant="secondary" onClick={() => setInput(s)}
            style={{padding:"3px 9px", borderRadius:20, fontSize:"0.65rem"}}
            title="Click to use this suggestion">
            {s}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:"10px 18px", borderTop:"1px solid #e5ded7",
        display:"flex", gap:8, background:"#f8f4ef", alignItems:"center" }}>
        <input className="input" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && !pending && send()}
          placeholder={pending ? "Confirm or reject the changes above first..." : "Ask or use 🎤..."}
          disabled={!!pending}
          style={{flex:1, opacity: pending ? 0.5 : 1}}/>
        
        {/* Voice input button */}
        {voiceSupported && (
          <Button
            variant={listening ? "primary" : "secondary"}
            onClick={listening ? stopVoiceInput : startVoiceInput}
            disabled={!!pending || loading}
            style={{padding:"10px 14px", whiteSpace:"nowrap", fontSize:"0.85rem"}}
            title={listening ? "Stop listening" : "Start voice input"}
          >
            {listening ? "🎤 Listening..." : "🎤"}
          </Button>
        )}
        
        <Button variant="primary" onClick={send}
          disabled={loading || !input.trim() || !!pending}
          style={{padding:"10px 18px", whiteSpace:"nowrap"}}>
          {loading ? <span className="spinner"/> : "Send ↵"}
        </Button>
      </div>

      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}
