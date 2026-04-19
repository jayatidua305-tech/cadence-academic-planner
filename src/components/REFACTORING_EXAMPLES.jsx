/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * REFACTORING EXAMPLES - From Inline to UILibrary Components
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Rating Scale (EnergyTracker.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline buttons with repeated styling
<div style={{display:"flex",gap:4}}>
  {[1,2,3,4,5,6,7,8,9,10].map(n => (
    <button key={n} onClick={() => setRating(n)}
      style={{
        width:26,height:26,borderRadius:6,
        border:`1px solid ${n>=8?"var(--purple)":n>=5?"rgba(124,111,247,0.3)":"rgba(124,111,247,0.3)"}`,
        background:n>=8?"var(--purple)":n>=5?"rgba(124,111,247,0.4)":"rgba(124,111,247,0.1)",
        color:n>=5?"white":"var(--purple-l)",cursor:"pointer",fontSize:"0.7rem",fontWeight:600
      }}>
      {n}
    </button>
  ))}
</div>

// ✅ AFTER: Using UILibrary RatingScale
import { RatingScale } from "./UILibrary";
<RatingScale 
  value={rating} 
  onChange={setRating} 
  label="How focused were you?"
/>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Option Selection (ActivityLogger.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Complex inline option buttons
<div style={{display:"flex",flexDirection:"column",gap:8}}>
  {TASK_TYPES.map(opt => (
    <button key={opt.value} onClick={() => setTaskType(opt.value)}
      style={{
        display:"flex",alignItems:"center",gap:14,
        padding:"13px 16px",borderRadius:12,cursor:"pointer",textAlign:"left",
        border:`1px solid ${taskType===opt.value?"rgba(124,111,247,0.4)":"var(--border)"}`,
        background:taskType===opt.value?"rgba(124,111,247,0.12)":"rgba(255,255,255,0.03)",
        transition:"all 0.12s"
      }}>
      <span style={{fontSize:"1.4rem",flexShrink:0}}>{opt.emoji}</span>
      <div>
        <div style={{fontSize:"0.85rem",fontWeight:600}}>{opt.label}</div>
        <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>{opt.desc}</div>
      </div>
    </button>
  ))}
</div>

// ✅ AFTER: Using UILibrary OptionGrid
import { OptionGrid } from "./UILibrary";
<OptionGrid 
  options={TASK_TYPES}  // [{value, label, emoji, desc}, ...]
  value={taskType}
  onChange={setTaskType}
  columns={1}
/>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Tag Selection (SmartScheduler.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Repeated reason button styling
<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
  {REJECT_REASONS.map(r => (
    <button key={r} onClick={() => setRejectReason(r)}
      style={{
        padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:"0.72rem",
        fontWeight:rejectReason===r?700:400,
        border:`1px solid ${rejectReason===r?"var(--red)":"rgba(248,113,113,0.3)"}`,
        background:rejectReason===r?"rgba(248,113,113,0.2)":"rgba(248,113,113,0.05)",
        color:rejectReason===r?"var(--red)":"var(--muted)"
      }}>
      {r}
    </button>
  ))}
</div>

// ✅ AFTER: Using UILibrary TagGroup
import { TagGroup } from "./UILibrary";
<TagGroup 
  options={REJECT_REASONS}
  value={rejectReason}
  onChange={setRejectReason}
  variant="error"
/>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Input Field with Label (ActivityLogger.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline label + input
<div>
  <label style={{fontSize:"0.78rem",color:"#64748b",display:"block",marginBottom:4}}>
    What did you work on?
  </label>
  <input className="input" placeholder="e.g. NLP Assignment 3..."
    value={taskName} onChange={e => setTaskName(e.target.value)} />
</div>

// ✅ AFTER: Using UILibrary TextField
import { TextField } from "./UILibrary";
<TextField 
  label="What did you work on?"
  placeholder="e.g. NLP Assignment 3..."
  value={taskName}
  onChange={e => setTaskName(e.target.value)}
/>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Button with Loading State (Dashboard.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline button with conditional spinner
<button className="btn btn-primary" onClick={handleSend}
  disabled={isSending || !message}
  style={{fontSize:"0.95rem",padding:"11px 24px"}}>
  {isSending ? <><span className="spinner"/> Sending...</> : "Send"}
</button>

// ✅ AFTER: Using UILibrary Button
import { Button } from "./UILibrary";
<Button 
  variant="primary" 
  size="lg"
  loading={isSending}
  disabled={!message}
  onClick={handleSend}>
  Send
</Button>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 6: Alert Message (VoiceUpdater.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline alert styling
{result && (
  <div style={{marginTop:16,background:"#f0fdf4",border:"1px solid #86efac",
    borderRadius:10,padding:"14px 16px"}}>
    <div style={{fontWeight:600,fontSize:"0.85rem",color:"#166534",marginBottom:4}}>
      ✅ SUCCESS
    </div>
    <div style={{fontSize:"0.85rem",color:"#15803d"}}>{result.message}</div>
  </div>
)}

// ✅ AFTER: Using UILibrary Alert
import { Alert } from "./UILibrary";
{result && <Alert message={result.message} type="success" />}

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 7: Card Container (SmartScheduler.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline card styling
<div style={{background:"rgba(139,125,255,0.08)",
  border:"1px solid rgba(139,125,255,0.3)",borderRadius:12,
  padding:"16px 18px",marginBottom:12}}>
  <div style={{fontSize:"0.9rem",fontWeight:600,color:"var(--text)",marginBottom:12}}>
    🧠 Study Slots
  </div>
  {/* content */}
</div>

// ✅ AFTER: Using UILibrary Card
import { Card } from "./UILibrary";
<Card 
  title="Study Slots"
  icon="🧠"
  variant="highlight">
  {/* content */}
</Card>

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE 8: Stat Display (Dashboard.jsx)
// ════════════════════════════════════════════════════════════════════════════════

// ❌ BEFORE: Inline stat box styling
<div style={{background:"rgba(139,125,255,0.08)",
  border:"1px solid rgba(139,125,255,0.15)",
  borderRadius:12,padding:14,textAlign:"center"}}>
  <div style={{fontSize:"2rem",fontWeight:700,color:"var(--purple-l)"}}>42</div>
  <div style={{fontSize:"0.7rem",color:"var(--muted)",marginTop:4}}>
    TASKS COMPLETED
  </div>
</div>

// ✅ AFTER: Using UILibrary StatBox
import { StatBox } from "./UILibrary";
<StatBox 
  label="Tasks Completed"
  value="42"
  icon="✅"
  variant="default"
/>

// ════════════════════════════════════════════════════════════════════════════════
// MIGRATION CHECKLIST
// ════════════════════════════════════════════════════════════════════════════════

/*
Components to update (priority order):

1. ActivityLogger.jsx
   - Replace RatingScale → use RatingScale component
   - Replace form inputs → use TextField component
   - Replace task type selection → use OptionGrid
   - Replace complexity options → use OptionGrid

2. SmartScheduler.jsx
   - Replace all tag selections → use TagGroup
   - Replace buttons → use Button component
   - Replace option grids → use OptionGrid
   - Replace cards → use Card component

3. EnergyTracker.jsx
   - Replace time picker → use OptionGrid
   - Replace single choice → use OptionGrid
   - Replace quiz results card → use Card
   - Replace buttons → use Button

4. CompanionMode.jsx
   - Replace all forms → use TextField
   - Replace buttons → use Button
   - Replace alerts → use Alert

5. Dashboard.jsx
   - Replace stat displays → use StatBox
   - Replace cards → use Card
   - Replace alerts → use Alert
   - Replace buttons → use Button

6. TodayView.jsx
   - Replace rating buttons → use RatingScale
   - Replace reaction buttons → use OptionGrid
   - Replace cards → use Card

7. Others (BlackboardImport, VoiceUpdater, SyllabusUploader, etc.)
   - Replace input patterns → use TextField
   - Replace buttons → use Button
   - Replace alerts → use Alert
*/
