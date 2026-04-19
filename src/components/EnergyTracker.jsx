// src/components/EnergyTracker.jsx
// Intuitive energy pattern — guided questions instead of manual grid painting

import React, { useState } from "react";
import { Button, OptionGrid } from "./UILibrary";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function fmtHour(h) {
  if (h===0) return "12am"; if (h<12) return `${h}am`;
  if (h===12) return "12pm"; return `${h-12}pm`;
}

// ── Questions ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: "wakeup",
    question: "What time do you usually wake up?",
    icon: "⏰",
    type: "time_picker",
    options: ["5am","6am","7am","8am","9am","10am","11am","12pm"],
  },
  {
    id: "sleep",
    question: "What time do you usually go to sleep?",
    icon: "🌙",
    type: "time_picker",
    options: ["9pm","10pm","11pm","12am","1am","2am","3am","4am"],
  },
  {
    id: "peak_feel",
    question: "When do you feel sharpest for hard work?",
    icon: "🔥",
    type: "single",
    options: [
      { value:"early_morning", label:"Early morning",  sub:"6–9am",   emoji:"🌄" },
      { value:"morning",       label:"Mid morning",    sub:"9am–12pm",emoji:"☀️" },
      { value:"afternoon",     label:"Afternoon",      sub:"1–5pm",   emoji:"🌤" },
      { value:"evening",       label:"Evening",        sub:"6–9pm",   emoji:"🌆" },
      { value:"night",         label:"Late night",     sub:"10pm–2am",emoji:"🌙" },
    ],
  },
  {
    id: "low_feel",
    question: "When do you hit an energy slump?",
    icon: "😴",
    type: "single",
    options: [
      { value:"post_lunch",  label:"After lunch",   sub:"1–3pm",   emoji:"😪" },
      { value:"morning",     label:"Early morning", sub:"Before 9am",emoji:"🥱" },
      { value:"evening",     label:"Early evening", sub:"5–7pm",   emoji:"😮‍💨" },
      { value:"late_night",  label:"Late night",    sub:"After 11pm",emoji:"🥴" },
      { value:"never",       label:"Rarely slump",  sub:"I'm consistent",emoji:"⚡" },
    ],
  },
  {
    id: "schedule_type",
    question: "How would you describe your weekly rhythm?",
    icon: "📅",
    type: "single",
    options: [
      { value:"weekday_heavy", label:"Weekday focused",  sub:"I'm more productive Mon–Fri", emoji:"💼" },
      { value:"weekend_heavy", label:"Weekend warrior",  sub:"I get more done Sat–Sun",     emoji:"🏋️" },
      { value:"all_week",      label:"All week same",    sub:"No real difference",          emoji:"📊" },
      { value:"mid_week",      label:"Mid-week peak",    sub:"Tue–Thu are my best days",    emoji:"📈" },
    ],
  },
  {
    id: "focus_duration",
    question: "How long can you focus before needing a break?",
    icon: "⏱️",
    type: "single",
    options: [
      { value:"30",  label:"30 minutes",  sub:"Short bursts work best",emoji:"⚡" },
      { value:"60",  label:"1 hour",      sub:"Standard Pomodoro",     emoji:"🍅" },
      { value:"90",  label:"90 minutes",  sub:"Deep work sessions",     emoji:"🔥" },
      { value:"120", label:"2+ hours",    sub:"I get into long flows",  emoji:"🌊" },
    ],
  },
];

// ── Pattern inference from answers ───────────────────────────────────────────
function inferPattern(answers) {
  const grid = DAYS.map(() => HOURS.map(() => 0));

  const wakeH  = parseTimeOption(answers.wakeup  || "8am");
  const sleepH = parseTimeOption(answers.sleep   || "12am");

  // Peak window
  const peakWindows = {
    early_morning: [5, 9],   morning:   [9,  13],
    afternoon:     [13, 18], evening:   [18, 22],
    night:         [22, 26],
  };
  const [peakStart, peakEnd] = peakWindows[answers.peak_feel] || [9, 13];

  // Low window
  const lowWindows = {
    post_lunch: [13,15], morning:    [5, 9],
    evening:    [17,19], late_night: [23,27],
    never:      [],
  };
  const lowWindow = lowWindows[answers.low_feel] || [13, 15];

  DAYS.forEach((_, di) => {
    const isWeekend = di >= 5;

    HOURS.forEach(h => {
      // Asleep
      if (isAsleep(h, wakeH, sleepH)) { grid[di][h] = 0; return; }

      // Peak hours
      const isPeak = h >= peakStart && h < (peakEnd % 24);
      const isPeakWrap = peakEnd > 24 && (h >= peakStart || h < peakEnd - 24);
      if (isPeak || isPeakWrap) { grid[di][h] = 10; return; }

      // Low hours
      const isLow = lowWindow.length && h >= lowWindow[0] && h < (lowWindow[1] % 24);
      if (isLow) { grid[di][h] = 2; return; }

      // Ramp up after wake
      if (h >= wakeH && h < wakeH + 2) { grid[di][h] = 4; return; }

      // Wind down 1-2 hours before sleep
      const windDownStart = (sleepH - 2 + 24) % 24;
      const windDownEnd   = (sleepH - 0 + 24) % 24;
      const isWindDown = windDownStart < windDownEnd
        ? h >= windDownStart && h < windDownEnd
        : h >= windDownStart || h < windDownEnd;
      if (isWindDown && !isAsleep(h, wakeH, sleepH)) { grid[di][h] = 3; return; }

      // Default medium
      grid[di][h] = 5;
    });

    // Weekend adjustments
    if (isWeekend) {
      if (answers.schedule_type === "weekday_heavy") {
        HOURS.forEach(h => { if (grid[di][h] > 0) grid[di][h] = Math.max(2, grid[di][h] - 3); });
      } else if (answers.schedule_type === "weekend_heavy") {
        HOURS.forEach(h => { if (grid[di][h] > 0) grid[di][h] = Math.min(10, grid[di][h] + 2); });
      }
    }
    if (!isWeekend && answers.schedule_type === "mid_week" && di >= 1 && di <= 3) {
      HOURS.forEach(h => { if (grid[di][h] > 0) grid[di][h] = Math.min(10, grid[di][h] + 2); });
    }
  });

  // Compute analytics
  const hourlyAvg = HOURS.map(h =>
    DAYS.reduce((sum, _, di) => sum + grid[di][h], 0) / DAYS.length
  );
  const peakVal  = Math.max(...hourlyAvg);
  const peakHour = hourlyAvg.indexOf(peakVal);
  const peakHoursArr = hourlyAvg.map((v,h)=>({h,v})).filter(x=>x.v>=peakVal*0.8);
  const peakLabel = peakHoursArr.length > 1
    ? `${fmtHour(peakHoursArr[0].h)} – ${fmtHour(peakHoursArr[peakHoursArr.length-1].h)}`
    : fmtHour(peakHour);

  const archMap = {
    early_morning:"Morning Person", morning:"Morning Person",
    afternoon:"Afternoon Peak", evening:"Evening Peak",
    night:"Night Owl",
  };
  const archetype = archMap[answers.peak_feel] || "Consistent";
  const archetypeEmoji = {
    "Night Owl":"🦉","Morning Person":"🌅","Afternoon Peak":"☀️","Evening Peak":"🌆","Consistent":"⚖️"
  }[archetype];

  // Only consider awake hours (energy > 0) for scheduling
  const awakeSorted = [...hourlyAvg.map((v,h)=>({h,v}))]
    .filter(x => x.v > 0)  // exclude sleep hours
    .sort((a,b)=>b.v-a.v);

  const total = awakeSorted.length;
  const bestHours = {
    high:   awakeSorted.slice(0, Math.ceil(total*0.25)).map(x=>x.h),   // top 25%
    medium: awakeSorted.slice(Math.ceil(total*0.25), Math.ceil(total*0.6)).map(x=>x.h), // mid
    low:    awakeSorted.slice(Math.ceil(total*0.6)).map(x=>x.h),        // bottom awake hours
  };

  return { grid, hourlyAvg, archetype, archetypeEmoji, peakHours:peakLabel,
    peakHour, bestHours, focusDuration: parseInt(answers.focus_duration||"60") };
}

function parseTimeOption(label) {
  if (!label) return 8;
  const m = label.match(/(\d+)(am|pm)/);
  if (!m) return 8;
  let h = parseInt(m[1]);
  if (m[2]==="pm" && h!==12) h+=12;
  if (m[2]==="am" && h===12) h=0;
  return h;
}

function isAsleep(h, wakeH, sleepH) {
  // Sleeping period goes from sleepH to wakeH (wrapping midnight)
  // e.g. sleep=2am(2), wake=11am(11) → asleep from 2am to 11am
  // e.g. sleep=11pm(23), wake=7am(7) → asleep from 11pm to 7am
  if (sleepH < wakeH) {
    // Sleep and wake both on same "side" of midnight (e.g. sleep 2am, wake 11am)
    return h >= sleepH && h < wakeH;
  } else {
    // Sleep crosses midnight (e.g. sleep 11pm, wake 7am)
    return h >= sleepH || h < wakeH;
  }
}

// ── Mini 24h bar ─────────────────────────────────────────────────────────────
function MiniEnergyBar({ hourlyAvg }) {
  const max = Math.max(...hourlyAvg, 1);
  return (
    <div style={{display:"flex",gap:2,alignItems:"flex-end",height:32}}>
      {hourlyAvg.map((v,h)=>(
        <div key={h} title={`${fmtHour(h)}: ${v.toFixed(1)}/10`}
          style={{
            flex:1, borderRadius:2,
            height:Math.max(2, v/10*32),
            background: v>=8?"var(--purple)":v>=5?"var(--blue)":v>=3?"var(--teal)":"rgba(255,255,255,0.06)",
            transition:"height 0.4s ease",
          }}/>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const ENERGY_STORAGE_KEY = "smart_cal_energy_pattern";
const ANSWERS_STORAGE_KEY = "smart_cal_energy_answers";
const PATTERN_VERSION = "v2"; // bump this to invalidate old cached patterns

function loadStoredPattern() {
  try {
    const p = JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || "null");
    // Invalidate old patterns that don't have version or have wrong version
    if (!p || p._version !== PATTERN_VERSION) return null;
    return p;
  } catch { return null; }
}
function loadStoredAnswers() {
  try { return JSON.parse(localStorage.getItem(ANSWERS_STORAGE_KEY) || "null"); } catch { return null; }
}

export default function EnergyTracker({ onPatternSaved, onNavigate, hasEvents }) {
  const storedPattern = loadStoredPattern();
  const storedAnswers = loadStoredAnswers();

  const [step,    setStep]    = useState(storedPattern ? 7 : 0); // jump to result if saved
  const [answers, setAnswers] = useState(storedAnswers || {});
  const [pattern, setPattern] = useState(storedPattern);
  const [saved,   setSaved]   = useState(!!storedPattern);

  // Auto-emit saved pattern on mount so App.jsx has it
  React.useEffect(() => {
    if (storedPattern) onPatternSaved(storedPattern);
  }, []);

  const totalSteps = QUESTIONS.length;
  const q = QUESTIONS[step - 1];

  const handleAnswer = (qid, val) => {
    const next = { ...answers, [qid]: val };
    setAnswers(next);
    if (step < totalSteps) {
      setTimeout(() => setStep(s => s + 1), 280);
    } else {
      const p = inferPattern(next);
      setPattern(p);
      setStep(totalSteps + 1);
    }
  };

  const handleSave = () => {
    if (!pattern) return;
    localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify({ ...pattern, _version: PATTERN_VERSION }));
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
    onPatternSaved({ ...pattern, _version: PATTERN_VERSION });
    setSaved(true);

    // Guide the student forward. If we have tasks loaded, jump to Schedule so
    // they can build immediately. If not, send them to Syllabi so they can
    // import assignments first.
    if (typeof onNavigate === "function") {
      setTimeout(() => {
        onNavigate(hasEvents ? "schedule" : "upload");
      }, 600);
    }
  };

  const restart = () => {
    localStorage.removeItem(ENERGY_STORAGE_KEY);
    localStorage.removeItem(ANSWERS_STORAGE_KEY);
    setStep(0); setAnswers({}); setPattern(null); setSaved(false);
  };

  // Progress
  const progress = step === 0 ? 0 : step > totalSteps ? 100 : Math.round((step / totalSteps) * 100);

  return (
    <div style={{maxWidth:640, margin:"0 auto"}}>

      {/* ── Welcome banner (first-time users only) ── */}
      {!saved && step === 0 && (
        <div
          className="fade-in"
          style={{
            background: "linear-gradient(135deg, rgba(144,0,40,0.08), rgba(212,160,23,0.08))",
            border: "1px solid rgba(144,0,40,0.18)",
            borderLeft: "3px solid var(--fordham-maroon)",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--fordham-maroon)",
            background: "rgba(144,0,40,0.1)",
            padding: "3px 9px",
            borderRadius: 999,
            flexShrink: 0,
            marginTop: 2,
          }}>
            Welcome to Cadence
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-sec)", lineHeight: 1.55 }}>
            Before we build your schedule, let&apos;s tune your focus profile. Six quick questions —
            under 90 seconds — and Cadence will schedule your hardest work for your sharpest hours.
          </div>
        </div>
      )}

      {/* ── Intro ── */}
      {step === 0 && (
        <div>
          <div style={{textAlign:"center",padding:"40px 20px 32px"}}>
            <div style={{fontSize:"3.5rem",marginBottom:16}}>⚡</div>
            <h2 style={{fontSize:"1.6rem",fontWeight:700,color:"var(--text)",marginBottom:10}}>
              Set your energy pattern
            </h2>
            <p style={{fontSize:"0.9rem",color:"var(--muted)",lineHeight:1.8,maxWidth:440,margin:"0 auto 28px"}}>
              Answer {totalSteps} quick questions. The AI will map your natural energy rhythm
              and automatically schedule complex tasks at your sharpest hours —
              no manual grid painting needed.
            </p>
            <Button variant="primary"
              onClick={() => setStep(1)}
              style={{padding:"13px 36px",fontSize:"1rem",borderRadius:12}}>
              Let's go →
            </Button>
          </div>

          {/* Quick template cards */}
          <div style={{marginTop:8}}>
            <div style={{fontSize:"0.72rem",color:"var(--hint)",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,textAlign:"center"}}>
              Or pick a quick template
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
              {[
                { label:"🦉 Night Owl",    sub:"10pm–2am peak · typical CS student",
                  a:{ wakeup:"9am", sleep:"2am", peak_feel:"night",   low_feel:"morning",  schedule_type:"all_week", focus_duration:"90" }},
                { label:"🌅 Early Bird",   sub:"6am–10am peak · morning grinder",
                  a:{ wakeup:"6am", sleep:"10pm", peak_feel:"early_morning", low_feel:"post_lunch", schedule_type:"weekday_heavy", focus_duration:"60" }},
                { label:"☀️ Afternoon",   sub:"1pm–5pm peak · late starter",
                  a:{ wakeup:"8am", sleep:"12am", peak_feel:"afternoon", low_feel:"morning",  schedule_type:"mid_week", focus_duration:"60" }},
                { label:"⚡ Split Peak",   sub:"Morning + night · classic overachiever",
                  a:{ wakeup:"7am", sleep:"1am", peak_feel:"morning",  low_feel:"post_lunch", schedule_type:"all_week", focus_duration:"90" }},
              ].map((t,i) => (
                <Button key={i} variant="secondary"
                  onClick={() => {
                    const p = inferPattern(t.a);
                    setAnswers(t.a); setPattern(p); setStep(totalSteps + 1);
                  }}
                  style={{padding:"14px 16px",borderRadius:12,textAlign:"left",justifyContent:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"0.9rem",marginBottom:4}}>{t.label}</div>
                    <div style={{fontSize:"0.72rem",color:"var(--hint)"}}>{t.sub}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Questions ── */}
      {step >= 1 && step <= totalSteps && q && (
        <div>
          {/* Progress bar */}
          <div style={{marginBottom:28}}>
            <div style={{display:"flex",justifyContent:"space-between",
              fontSize:"0.72rem",color:"var(--hint)",marginBottom:8}}>
              <span>Question {step} of {totalSteps}</span>
              <span>{progress}% complete</span>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:2,background:"var(--grad-purple)",
                width:`${progress}%`,transition:"width 0.4s ease"}}/>
            </div>
          </div>

          {/* Question card */}
          <div className="card" style={{padding:"28px 28px 24px"}}>
            <div style={{fontSize:"2rem",marginBottom:12}}>{q.icon}</div>
            <div style={{fontSize:"1.15rem",fontWeight:700,color:"var(--text)",marginBottom:20,lineHeight:1.4}}>
              {q.question}
            </div>

            {/* Time picker */}
            {q.type === "time_picker" && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {q.options.map(opt => (
                  <Button key={opt}
                    variant={answers[q.id]===opt ? "primary" : "secondary"}
                    onClick={() => handleAnswer(q.id, opt)}
                    style={{padding:"12px 8px",fontSize:"0.88rem",borderRadius:10,fontFamily:"JetBrains Mono"}}>
                    {opt}
                  </Button>
                ))}
              </div>
            )}

            {/* Single choice */}
            {q.type === "single" && (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {q.options.map(opt => (
                  <Button key={opt.value}
                    variant={answers[q.id]===opt.value ? "primary" : "secondary"}
                    onClick={() => handleAnswer(q.id, opt.value)}
                    style={{display:"flex",alignItems:"center",gap:14,padding:"13px 16px",borderRadius:12,justifyContent:"flex-start"}}>
                    <span style={{fontSize:"1.4rem",flexShrink:0}}>{opt.emoji}</span>
                    <div style={{flex:1,textAlign:"left"}}>
                      <div style={{fontWeight:600,fontSize:"0.88rem",marginBottom:2}}>
                        {opt.label}
                      </div>
                      <div style={{fontSize:"0.72rem",color:"var(--hint)"}}>{opt.sub}</div>
                    </div>
                    {answers[q.id]===opt.value&&(
                      <div style={{width:18,height:18,borderRadius:"50%",
                        background:"var(--green)",display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:"0.65rem",color:"white",flexShrink:0}}>✓</div>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Back button */}
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)}
              style={{marginTop:12,fontSize:"0.82rem"}}>
              ← Back
            </Button>
          )}
        </div>
      )}

      {/* ── Result ── */}
      {step > totalSteps && pattern && (
        <div>
          {/* ── Header banner: wording changes based on whether the pattern
               has actually been persisted yet. Quick-template clicks land
               here BEFORE save, so we must not claim "saved" prematurely. ── */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background: saved ? "rgba(4,120,87,0.06)" : "rgba(255,255,255,0.03)",
            border:`1px solid ${saved ? "rgba(4,120,87,0.25)" : "var(--border)"}`,
            borderRadius:12, padding:"12px 18px", marginBottom:16,
          }}>
            <div>
              <div style={{fontSize:"0.82rem",fontWeight:600,color:"var(--text)"}}>
                {saved ? "✅ Energy pattern saved" : "👀 Preview your energy pattern"}
              </div>
              <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                {saved
                  ? "Your schedule rebuilds automatically with this pattern"
                  : "Review below, then hit Save to apply it to your schedule"}
              </div>
            </div>
            <Button variant="secondary" onClick={restart}
              style={{fontSize:"0.8rem",fontWeight:600,whiteSpace:"nowrap",padding:"8px 14px"}}>
              🔄 Retake quiz
            </Button>
          </div>
          <div style={{
            background:"linear-gradient(135deg, rgba(124,111,247,0.15), rgba(79,159,255,0.1))",
            border:"1px solid rgba(124,111,247,0.3)",
            borderRadius:16, padding:"28px 28px 24px", marginBottom:16,
            boxShadow:"var(--glow-purple)",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
              <div style={{fontSize:"4rem",lineHeight:1}}>{pattern.archetypeEmoji}</div>
              <div>
                <div style={{fontSize:"1.4rem",fontWeight:700,color:"var(--text)",marginBottom:4}}>
                  You're a {pattern.archetype}
                </div>
                <div style={{fontFamily:"JetBrains Mono",fontSize:"0.88rem",color:"var(--purple-l)"}}>
                  Peak: {pattern.peakHours} · Focus window: {pattern.focusDuration}min
                </div>
              </div>
            </div>

            {/* 24h energy bar */}
            <div style={{marginBottom:6}}>
              <div style={{fontSize:"0.68rem",color:"var(--hint)",marginBottom:6,
                textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>
                Your 24-hour energy curve
              </div>
              <MiniEnergyBar hourlyAvg={pattern.hourlyAvg}/>
              <div style={{display:"flex",justifyContent:"space-between",
                fontSize:"0.6rem",color:"var(--hint)",marginTop:4,fontFamily:"JetBrains Mono"}}>
                {[0,6,12,18,23].map(h=><span key={h}>{fmtHour(h)}</span>)}
              </div>
            </div>
          </div>

          {/* Complexity schedule */}
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title">📅 How your tasks will be scheduled</div>
            <div className="card-sub">The AI will place tasks at these times automatically</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                { key:"high",   icon:"🔴", label:"Hard tasks",   desc:"NLP, coding, exams",
                  color:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.25)", tc:"var(--red)" },
                { key:"medium", icon:"🟡", label:"Medium tasks",  desc:"Assignments, cases",
                  color:"rgba(251,191,36,0.1)",  border:"rgba(251,191,36,0.25)",  tc:"var(--amber)" },
                { key:"low",    icon:"🟢", label:"Light tasks",   desc:"Readings, review",
                  color:"rgba(74,222,128,0.1)",  border:"rgba(74,222,128,0.25)",  tc:"var(--green)" },
              ].map(t=>(
                <div key={t.key} style={{background:t.color,border:`1px solid ${t.border}`,borderRadius:12,padding:"13px 14px"}}>
                  <div style={{fontSize:"0.7rem",fontWeight:700,textTransform:"uppercase",
                    letterSpacing:"0.07em",color:t.tc,marginBottom:3}}>{t.icon} {t.label}</div>
                  <div style={{fontSize:"0.65rem",color:"var(--hint)",marginBottom:8}}>{t.desc}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {(pattern.bestHours[t.key]||[]).slice(0,3).map(h=>(
                      <span key={h} style={{fontFamily:"JetBrains Mono",fontSize:"0.72rem",fontWeight:700,
                        padding:"2px 7px",borderRadius:6,
                        background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.1)",
                        color:"var(--text)"}}>
                        {fmtHour(h)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Your answers summary */}
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title" style={{marginBottom:12}}>Your answers</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {QUESTIONS.map(q => {
                const a = answers[q.id];
                if (!a) return null;
                const opt = q.options?.find?.(o=>typeof o==="object"?o.value===a:o===a);
                const label = typeof opt==="object"?`${opt.emoji} ${opt.label}`:opt||a;
                return (
                  <div key={q.id} style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:"0.78rem",color:"var(--muted)"}}>{q.icon} {q.question}</div>
                    <div style={{fontSize:"0.78rem",fontWeight:600,color:"var(--text)",marginLeft:12,textAlign:"right"}}>{label}</div>
                  </div>
                );
              })}
            </div>
            <Button variant="ghost" onClick={restart}
              style={{marginTop:12,fontSize:"0.75rem"}}>
              ✏️ Redo questionnaire
            </Button>
          </div>

          {/* Save */}
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Button variant="primary" onClick={handleSave}
              disabled={saved}
              style={{width:"100%",padding:"14px",fontSize:"1rem",borderRadius:12}}>
              {saved ? "✅ Pattern saved!" : "💾 Save my energy pattern"}
            </Button>
            {saved && (
              <Button variant="success"
                onClick={() => onNavigate && onNavigate("schedule")}
                style={{whiteSpace:"nowrap",padding:"14px 20px",fontSize:"0.9rem",borderRadius:12}}>
                🧠 Build schedule →
              </Button>
            )}
          </div>
          {saved && (
            <div style={{textAlign:"center",marginTop:10,fontSize:"0.78rem",color:"var(--muted)"}}>
              The AI will schedule your hardest tasks at {pattern.peakHours} automatically.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
