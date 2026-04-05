import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ── Constants ────────────────────────────────────────────────────────────────
const DAYS     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SESSIONS = ['AM','PM'];
const COLORS   = ['#14b8a6','#a78bfa','#f472b6','#60a5fa','#fb923c','#4ade80','#fbbf24','#f87171'];
const PRESETS  = [
  { label:'Mon / Wed / Fri', days:['Mon','Wed','Fri'] },
  { label:'Daily',           days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
  { label:'Weekdays',        days:['Mon','Tue','Wed','Thu','Fri'] },
  { label:'Tue / Thu / Sat', days:['Tue','Thu','Sat'] },
];
const VIEWS = [
  { id:'today',      icon:'💉', label:'Today'      },
  { id:'schedule',   icon:'📅', label:'Schedule'   },
  { id:'peptides',   icon:'🧪', label:'Peptides'   },
  { id:'calculator', icon:'🔬', label:'Calc'       },
  { id:'history',    icon:'📋', label:'History'    },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2,10);
const todayStr = () => new Date().toISOString().slice(0,10);
const todayDay = () => DAYS[((new Date().getDay() + 6) % 7)];
const fmtTime  = iso => iso ? new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
const fmtDate  = str => new Date(str+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const dayOfDate = str => DAYS[((new Date(str+'T12:00:00').getDay() + 6) % 7)];

function isDueOnDate(p, dateStr) {
  if (p.scheduleType === 'interval') {
    if (!p.intervalStart || !p.intervalDays) return false;
    const diff = Math.round((new Date(dateStr+'T12:00:00') - new Date(p.intervalStart+'T12:00:00')) / 86400000);
    return diff >= 0 && diff % p.intervalDays === 0;
  }
  return (p.days || []).includes(dayOfDate(dateStr));
}

function nextDueStr(p) {
  if (p.scheduleType !== 'interval' || !p.intervalStart || !p.intervalDays) return null;
  const today = new Date(todayStr()+'T12:00:00');
  const start = new Date(p.intervalStart+'T12:00:00');
  const diff  = Math.round((today - start) / 86400000);
  if (diff < 0) return p.intervalStart;
  const rem = diff % p.intervalDays;
  if (rem === 0) return todayStr();
  const next = new Date(today);
  next.setDate(next.getDate() + (p.intervalDays - rem));
  return next.toISOString().slice(0,10);
}

function calcUnits(vialMg, bacMl, doseMcg) {
  const v = Number(vialMg), b = Number(bacMl), d = Number(doseMcg);
  if (!v || !b || !d) return null;
  const conc  = (v * 1000) / b;
  const vol   = d / conc;
  const units = vol * 100;
  return {
    units:   Math.round(units * 10) / 10,
    volMl:   Math.round(vol  * 1000) / 1000,
    concMcg: Math.round(conc),
  };
}

// localStorage helpers
const LS_PEPTIDES = 'pt_peptides';
const LS_LOGS     = 'pt_logs';
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── DoseCard ─────────────────────────────────────────────────────────────────
function DoseCard({ peptide, session, log, onMark, date }) {
  const taken = !!log?.taken;
  const calc  = calcUnits(peptide.vialMg, peptide.bacMl, peptide.doseMcg);
  return (
    <div className={`dose-card${taken ? ' taken' : ''}`} style={{ borderLeft:`4px solid ${peptide.color}` }}>
      <div className="dose-info">
        <div className="dose-name">{peptide.name}</div>
        <div className="dose-meta">
          <span>{peptide.doseMcg} mcg</span>
          {calc && <span className="dose-units">→ <strong>{calc.units}u</strong></span>}
        </div>
        {taken && <div className="dose-taken-at">✓ Taken at {fmtTime(log.takenAt)}</div>}
      </div>
      <button className={`mark-btn${taken ? ' taken' : ''}`}
        onClick={() => onMark(peptide.id, date, session, !taken)}>
        {taken ? '✓' : 'Mark\nTaken'}
      </button>
    </div>
  );
}

// ── Today View ───────────────────────────────────────────────────────────────
function TodayView({ peptides, logs, onMark }) {
  const date = todayStr();
  const dateLabel = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});

  const scheduled = peptides.filter(p => p.active && isDueOnDate(p, date));

  if (scheduled.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">💤</div>
        <p className="empty-title">Rest day</p>
        <p className="empty-sub">No peptides scheduled for today.<br/>Add peptides in the Peptides tab.</p>
      </div>
    );
  }

  const allDoses = [];
  scheduled.forEach(p => {
    (p.sessions?.length ? p.sessions : ['AM']).forEach(s => {
      const log = logs.find(l => l.peptideId===p.id && l.date===date && l.session===s);
      allDoses.push({ peptide:p, session:s, log });
    });
  });

  const amDoses = allDoses.filter(d => d.session==='AM');
  const pmDoses = allDoses.filter(d => d.session==='PM');
  const takenCount = allDoses.filter(d => d.log?.taken).length;

  return (
    <>
      <div className="today-header">
        <div className="today-date">{dateLabel}</div>
        <div className={`today-pill${takenCount===allDoses.length?' done':''}`}>
          {takenCount}/{allDoses.length} done
        </div>
      </div>

      {takenCount === allDoses.length && allDoses.length > 0 && (
        <div className="all-done-banner">🎉 All doses taken today!</div>
      )}

      {amDoses.length > 0 && (
        <div className="session-block">
          <div className="session-label">☀️ Morning — AM</div>
          {amDoses.map(d => <DoseCard key={d.peptide.id+'AM'} {...d} onMark={onMark} date={date} />)}
        </div>
      )}

      {pmDoses.length > 0 && (
        <div className="session-block">
          <div className="session-label">🌙 Evening — PM</div>
          {pmDoses.map(d => <DoseCard key={d.peptide.id+'PM'} {...d} onMark={onMark} date={date} />)}
        </div>
      )}
    </>
  );
}

// ── Schedule View ─────────────────────────────────────────────────────────────
function ScheduleView({ peptides }) {
  const today   = todayDay();
  const active  = peptides.filter(p => p.active);
  const weekly  = active.filter(p => p.scheduleType !== 'interval');
  const interval= active.filter(p => p.scheduleType === 'interval');

  if (active.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">📅</div>
        <p className="empty-title">No schedule yet</p>
        <p className="empty-sub">Add peptides with a schedule to see your plan here.</p>
      </div>
    );
  }

  return (
    <>
      {weekly.length > 0 && (
        <>
          <div className="sched-table">
            <div className="sched-name-col sched-th" />
            {DAYS.map(d => (
              <div key={d} className={`sched-day-th${d===today?' sched-today':''}`}>{d}</div>
            ))}
            {weekly.map(p => (
              <React.Fragment key={p.id}>
                <div className="sched-name-col sched-td">
                  <div className="sched-dot-sm" style={{background:p.color}}/>
                  <span className="sched-pname">{p.name}</span>
                </div>
                {DAYS.map(d => {
                  const on    = (p.days||[]).includes(d);
                  const hasAM = on && p.sessions?.includes('AM');
                  const hasPM = on && p.sessions?.includes('PM');
                  return (
                    <div key={p.id+d} className={`sched-td sched-cell${d===today?' sched-today':''}`}>
                      {on && (
                        <div className="sched-markers">
                          {hasAM && <div className="sched-marker" style={{background:p.color}} title="AM"/>}
                          {hasPM && <div className="sched-marker" style={{background:p.color,opacity:.45}} title="PM"/>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="legend-opacity-note" style={{marginBottom:14}}>
            <span className="sched-marker-sample" style={{background:'#888'}}/> AM &nbsp;
            <span className="sched-marker-sample" style={{background:'#888',opacity:.45}}/> PM
          </div>
        </>
      )}

      {interval.length > 0 && (
        <div className="sched-legend" style={{marginBottom:14}}>
          <div className="legend-title">Interval schedule</div>
          {interval.map(p => {
            const due   = nextDueStr(p);
            const isToday = due === todayStr();
            return (
              <div key={p.id} className="legend-row">
                <div className="legend-dot" style={{background:p.color}}/>
                <div className="legend-info">
                  <span className="legend-name">{p.name}</span>
                  <span className="legend-meta">
                    Every {p.intervalDays} days · {(p.sessions||['AM']).join(' + ')}
                    {calcUnits(p.vialMg,p.bacMl,p.doseMcg) && ` · ${calcUnits(p.vialMg,p.bacMl,p.doseMcg).units}u`}
                  </span>
                </div>
                <span className={`next-due-badge${isToday?' today':''}`}>
                  {isToday ? '💉 Today' : `Next: ${fmtDate(due)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {weekly.length > 0 && (
        <div className="sched-legend">
          <div className="legend-title">Legend</div>
          {weekly.map(p => (
            <div key={p.id} className="legend-row">
              <div className="legend-dot" style={{background:p.color}}/>
              <div className="legend-info">
                <span className="legend-name">{p.name}</span>
                <span className="legend-meta">
                  {(p.days||[]).join(', ')} · {(p.sessions||['AM']).join(' + ')}
                  {calcUnits(p.vialMg,p.bacMl,p.doseMcg) && ` · ${calcUnits(p.vialMg,p.bacMl,p.doseMcg).units}u`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Peptides View ─────────────────────────────────────────────────────────────
function PeptidesView({ peptides, onEdit }) {
  if (peptides.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">🧪</div>
        <p className="empty-title">No peptides added yet</p>
        <p className="empty-sub">Tap <strong>+</strong> to add your first peptide and schedule.</p>
      </div>
    );
  }

  const active  = peptides.filter(p =>  p.active);
  const paused  = peptides.filter(p => !p.active);

  return (
    <div className="peptide-list">
      {[...active, ...paused].map(p => {
        const calc = calcUnits(p.vialMg, p.bacMl, p.doseMcg);
        return (
          <div key={p.id} className={`peptide-row${!p.active?' paused':''}`} onClick={()=>onEdit(p)}>
            <div className="peptide-bar" style={{background:p.color}}/>
            <div className="peptide-info">
              <div className="peptide-name">{p.name}</div>
              <div className="peptide-meta">
                {p.doseMcg}mcg
                {calc && <> · <strong>{calc.units}u</strong></>}
                {' · '}{p.scheduleType==='interval' ? `Every ${p.intervalDays}d` : (p.days||[]).join(', ')}
                {' · '}{(p.sessions||['AM']).join(' + ')}
              </div>
              {p.notes && <div className="peptide-notes">{p.notes}</div>}
            </div>
            <div className="peptide-right">
              {!p.active && <span className="paused-badge">Paused</span>}
              <span className="chevron">›</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Calculator View ───────────────────────────────────────────────────────────
function CalculatorView({ peptides }) {
  const [vialMg,  setVialMg]  = useState('');
  const [bacMl,   setBacMl]   = useState('');
  const [doseMcg, setDoseMcg] = useState('');
  const [preset,  setPreset]  = useState('');
  const [result,  setResult]  = useState(null);

  function loadPreset(id) {
    const p = peptides.find(x => x.id===id);
    if (!p) { setVialMg(''); setBacMl(''); setDoseMcg(''); setPreset(''); return; }
    setVialMg(String(p.vialMg||''));
    setBacMl(String(p.bacMl||''));
    setDoseMcg(String(p.doseMcg||''));
    setPreset(id);
    setResult(null);
  }

  function calculate() { setResult(calcUnits(vialMg, bacMl, doseMcg)); }
  function reset() { setVialMg(''); setBacMl(''); setDoseMcg(''); setResult(null); setPreset(''); }

  const canCalc = vialMg && bacMl && doseMcg;

  return (
    <div className="calc-wrap">
      <div className="calc-card">
        <div className="calc-heading">🔬 Peptide Calculator</div>
        <p className="calc-sub">How many units to draw on a 1ml / 100-unit insulin syringe</p>

        {peptides.filter(p=>p.active).length > 0 && (
          <div className="calc-preset-row">
            <select className="calc-select" value={preset} onChange={e=>loadPreset(e.target.value)}>
              <option value="">↓ Load from a peptide (optional)</option>
              {peptides.filter(p=>p.active).map(p=>(
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="calc-fields">
          <div className="calc-field">
            <label className="calc-label">Peptide vial size</label>
            <div className="calc-input-row">
              <input className="calc-input" type="number" placeholder="5" min="0" step="0.1"
                value={vialMg} onChange={e=>{setVialMg(e.target.value);setResult(null);}} />
              <span className="calc-unit-badge">mg</span>
            </div>
          </div>
          <div className="calc-field">
            <label className="calc-label">Bacteriostatic water</label>
            <div className="calc-input-row">
              <input className="calc-input" type="number" placeholder="2" min="0" step="0.1"
                value={bacMl} onChange={e=>{setBacMl(e.target.value);setResult(null);}} />
              <span className="calc-unit-badge">ml</span>
            </div>
          </div>
          <div className="calc-field">
            <label className="calc-label">Desired dose</label>
            <div className="calc-input-row">
              <input className="calc-input" type="number" placeholder="250" min="0" step="1"
                value={doseMcg} onChange={e=>{setDoseMcg(e.target.value);setResult(null);}} />
              <span className="calc-unit-badge">mcg</span>
            </div>
          </div>
        </div>

        <button className="calc-btn" onClick={calculate} disabled={!canCalc}>Calculate</button>

        {result && (
          <div className="calc-result">
            <div className="result-hero">
              <div className="result-big">{result.units}</div>
              <div className="result-label">units to draw</div>
            </div>
            <div className="result-divider"/>
            <div className="result-rows">
              <div className="result-row"><span>Concentration</span><strong>{result.concMcg} mcg / ml</strong></div>
              <div className="result-row"><span>Volume to draw</span><strong>{result.volMl} ml</strong></div>
              <div className="result-row"><span>Syringe</span><strong>1ml insulin (100u)</strong></div>
            </div>
            <button className="calc-reset" onClick={reset}>↺ Reset</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History View ──────────────────────────────────────────────────────────────
function HistoryView({ logs, peptides }) {
  const sorted = [...logs].sort((a,b) => b.date.localeCompare(a.date) || (a.session==='AM'?-1:1));
  const byDate = {};
  sorted.forEach(l => { if (!byDate[l.date]) byDate[l.date]=[]; byDate[l.date].push(l); });
  const dates = Object.keys(byDate).slice(0,30);

  const takenTotal  = logs.filter(l=>l.taken).length;
  const missedTotal = logs.filter(l=>!l.taken).length;

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">📋</div>
        <p className="empty-title">No history yet</p>
        <p className="empty-sub">Mark doses as taken on the Today tab to build your injection log.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hist-stats">
        <div className="hstat">
          <div className="hstat-val" style={{color:'var(--green)'}}>{takenTotal}</div>
          <div className="hstat-lbl">Total taken</div>
        </div>
        <div className="hstat">
          <div className="hstat-val" style={{color:'var(--red)'}}>{missedTotal}</div>
          <div className="hstat-lbl">Missed</div>
        </div>
        <div className="hstat">
          <div className="hstat-val">{takenTotal+missedTotal > 0 ? Math.round(takenTotal/(takenTotal+missedTotal)*100) : 0}%</div>
          <div className="hstat-lbl">Compliance</div>
        </div>
      </div>

      <div className="hist-list">
        {dates.map(date => {
          const dayLogs = byDate[date];
          const taken   = dayLogs.filter(l=>l.taken).length;
          return (
            <div key={date} className="hist-day">
              <div className="hist-day-hdr">
                <span className="hist-day-lbl">{fmtDate(date)}</span>
                <span className={`hist-day-pill${taken===dayLogs.length?' complete':''}`}>
                  {taken}/{dayLogs.length}
                </span>
              </div>
              {dayLogs.map(l => {
                const p = peptides.find(x=>x.id===l.peptideId);
                if (!p) return null;
                return (
                  <div key={l.id} className={`hist-entry${l.taken?' taken':' missed'}`}>
                    <div className="hist-dot" style={{background:p.color}}/>
                    <span className="hist-pname">{p.name}</span>
                    <span className="hist-session">{l.session}</span>
                    <span className="hist-status">
                      {l.taken ? `✓ ${fmtTime(l.takenAt)}` : '✗ Missed'}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Peptide Modal ─────────────────────────────────────────────────────────────
function PeptideModal({ peptide, onSave, onDelete, onClose }) {
  const isNew = !peptide?.id;
  const [form, setForm] = useState({
    name:         peptide?.name         || '',
    doseMcg:      peptide?.doseMcg      || '',
    vialMg:       peptide?.vialMg       || '',
    bacMl:        peptide?.bacMl        || '',
    scheduleType: peptide?.scheduleType || 'weekly',
    days:         peptide?.days         || [],
    intervalDays: peptide?.intervalDays || 2,
    intervalStart:peptide?.intervalStart|| todayStr(),
    sessions:     peptide?.sessions     || ['AM'],
    color:        peptide?.color        || COLORS[0],
    active:       peptide?.active       !== false,
    notes:        peptide?.notes        || '',
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const [err,        setErr]        = useState('');

  useEffect(() => {
    const esc = e => { if (e.key==='Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const set = patch => setForm(f => ({...f, ...patch}));

  function toggleDay(d) {
    set({ days: form.days.includes(d) ? form.days.filter(x=>x!==d) : [...form.days,d] });
  }
  function toggleSession(s) {
    const next = form.sessions.includes(s) ? form.sessions.filter(x=>x!==s) : [...form.sessions,s];
    set({ sessions: next.length===0 ? [s] : next });
  }
  function applyPreset(days) { set({ days }); }

  function submit() {
    if (!form.name.trim())               return setErr('Peptide name is required.');
    if (!form.doseMcg||+form.doseMcg<=0) return setErr('Dose (mcg) must be greater than 0.');
    if (form.scheduleType === 'weekly' && form.days.length===0) return setErr('Select at least one day.');
    if (form.scheduleType === 'interval' && !form.intervalStart) return setErr('Set a start date for the interval.');
    setErr('');
    onSave({
      id:           peptide?.id || uid(),
      name:         form.name.trim(),
      doseMcg:      +form.doseMcg,
      vialMg:       +form.vialMg  || 0,
      bacMl:        +form.bacMl   || 0,
      scheduleType: form.scheduleType,
      days:         form.scheduleType === 'weekly' ? form.days : [],
      intervalDays: form.scheduleType === 'interval' ? form.intervalDays : null,
      intervalStart:form.scheduleType === 'interval' ? form.intervalStart : null,
      sessions:     form.sessions,
      color:        form.color,
      active:       form.active,
      notes:        form.notes.trim(),
    });
  }

  const liveCalc = calcUnits(form.vialMg, form.bacMl, form.doseMcg);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <span className="modal-title">{isNew ? 'Add Peptide' : 'Edit Peptide'}</span>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="color-row">
            {COLORS.map(c=>(
              <button key={c} className={`color-swatch${form.color===c?' on':''}`}
                style={{background:c}} onClick={()=>set({color:c})}/>
            ))}
          </div>

          <input className="m-input" placeholder="Peptide name (e.g. BPC-157)"
            value={form.name} onChange={e=>set({name:e.target.value})} />

          <div className="m-label">Dose per injection</div>
          <div className="m-input-unit-row">
            <input className="m-input flex1" type="number" placeholder="250"
              value={form.doseMcg} onChange={e=>set({doseMcg:e.target.value})} />
            <span className="m-unit">mcg</span>
          </div>

          <div className="m-label">Vial reconstitution</div>
          <div className="m-two-col">
            <div className="m-input-unit-row">
              <input className="m-input flex1" type="number" placeholder="5"
                value={form.vialMg} onChange={e=>set({vialMg:e.target.value})} />
              <span className="m-unit">mg vial</span>
            </div>
            <div className="m-input-unit-row">
              <input className="m-input flex1" type="number" placeholder="2"
                value={form.bacMl} onChange={e=>set({bacMl:e.target.value})} />
              <span className="m-unit">ml BAC</span>
            </div>
          </div>

          {liveCalc && (
            <div className="units-preview">
              💉 <strong>{liveCalc.units} units</strong> per dose &nbsp;·&nbsp; {liveCalc.concMcg} mcg/ml
            </div>
          )}

          <div className="m-label">Schedule</div>
          <div className="sched-type-toggle">
            <button className={`stt-btn${form.scheduleType==='weekly'?' on':''}`}
              onClick={()=>set({scheduleType:'weekly'})}>Weekly</button>
            <button className={`stt-btn${form.scheduleType==='interval'?' on':''}`}
              onClick={()=>set({scheduleType:'interval'})}>Every N days</button>
          </div>

          {form.scheduleType === 'weekly' ? (
            <>
              <div className="chip-row presets">
                {PRESETS.map(p=>(
                  <button key={p.label} className="chip preset-chip" onClick={()=>applyPreset(p.days)}>{p.label}</button>
                ))}
              </div>
              <div className="chip-row">
                {DAYS.map(d=>(
                  <button key={d} className={`chip${form.days.includes(d)?' on':''}`} onClick={()=>toggleDay(d)}>{d}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="m-label" style={{marginTop:4}}>Repeat every</div>
              <div className="chip-row">
                {[2,3,4].map(n=>(
                  <button key={n} className={`chip${form.intervalDays===n?' on':''}`}
                    onClick={()=>set({intervalDays:n})}>
                    {n} days
                  </button>
                ))}
              </div>
              <div className="m-label" style={{marginTop:4}}>First dose date</div>
              <input className="m-input" type="date"
                value={form.intervalStart}
                onChange={e=>set({intervalStart:e.target.value})}/>
            </>
          )}

          <div className="m-label" style={{marginTop:14}}>Injection time</div>
          <div className="chip-row">
            {SESSIONS.map(s=>(
              <button key={s} className={`chip${form.sessions.includes(s)?' on':''}`} onClick={()=>toggleSession(s)}>
                {s==='AM'?'☀️ AM':'🌙 PM'}
              </button>
            ))}
          </div>

          <div className="m-label">Notes</div>
          <textarea className="m-input m-textarea" placeholder="Optional notes..."
            value={form.notes} onChange={e=>set({notes:e.target.value})}/>

          <div className="toggle-row" onClick={()=>set({active:!form.active})}>
            <span className="toggle-label">Active</span>
            <div className={`toggle${form.active?' on':''}`}><div className="toggle-thumb"/></div>
          </div>

          {err && <div className="err-msg">{err}</div>}

          <button className="m-btn primary" onClick={submit}>
            {isNew ? '+ Add Peptide' : 'Save Changes'}
          </button>

          {!isNew && (
            confirmDel ? (
              <div className="confirm-del-row">
                <button className="m-btn danger" onClick={()=>onDelete(peptide.id)}>Yes, Delete</button>
                <button className="m-btn ghost" onClick={()=>setConfirmDel(false)}>Cancel</button>
              </div>
            ) : (
              <button className="m-btn ghost" onClick={()=>setConfirmDel(true)}>🗑 Delete Peptide</button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function PeptideTracker() {
  const [peptides,    setPeptides]    = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [view,        setView]        = useState('today');
  const [editPeptide, setEditPeptide] = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setPeptides(lsGet(LS_PEPTIDES, []));
    setLogs(lsGet(LS_LOGS, []));
  }, []);

  // Persist peptides
  useEffect(() => { lsSet(LS_PEPTIDES, peptides); }, [peptides]);
  // Persist logs
  useEffect(() => { lsSet(LS_LOGS, logs); }, [logs]);

  function markDose(peptideId, date, session_name, taken) {
    const existing = logs.find(l => l.peptideId===peptideId && l.date===date && l.session===session_name);
    const logObj = {
      id:        existing?.id || uid(),
      peptideId, date,
      session:   session_name,
      taken,
      takenAt:   taken ? new Date().toISOString() : null,
    };
    setLogs(prev => {
      const idx = prev.findIndex(l => l.peptideId===peptideId && l.date===date && l.session===session_name);
      return idx >= 0 ? prev.map((l,i) => i===idx ? logObj : l) : [...prev, logObj];
    });
  }

  function savePeptide(p) {
    setPeptides(prev => prev.find(x=>x.id===p.id) ? prev.map(x=>x.id===p.id?p:x) : [...prev,p]);
    setEditPeptide(null); setShowAdd(false);
  }

  function deletePeptide(id) {
    setPeptides(prev => prev.filter(x=>x.id!==id));
    setLogs(prev => prev.filter(l => l.peptideId!==id));
    setEditPeptide(null);
  }

  const showModal = showAdd || !!editPeptide;
  const canFAB    = ['today','schedule','peptides'].includes(view);

  return (
    <>
      <Head>
        <title>Peptide Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
        <meta name="theme-color" content="#0a0a12"/>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="Peptides"/>
        <link rel="manifest" href="/manifest.json"/>
        <link rel="apple-touch-icon" href="/icon-192.png"/>
      </Head>

      <div className="app">
          <header className="topbar">
            <span className="app-title">💉 Peptide Tracker</span>
            <div className="topbar-right">
              <span className="ver-badge">v1.0</span>
            </div>
          </header>

          <main className="content">
            {view==='today'      && <TodayView      peptides={peptides} logs={logs} onMark={markDose}/>}
            {view==='schedule'   && <ScheduleView   peptides={peptides}/>}
            {view==='peptides'   && <PeptidesView   peptides={peptides} onEdit={setEditPeptide}/>}
            {view==='calculator' && <CalculatorView peptides={peptides}/>}
            {view==='history'    && <HistoryView    logs={logs} peptides={peptides}/>}
          </main>

          <nav className="bottom-nav">
            {VIEWS.map(v=>(
              <button key={v.id} className={`nav-btn${view===v.id?' active':''}`} onClick={()=>setView(v.id)}>
                <span className="nav-icon">{v.icon}</span>
                <span className="nav-label">{v.label}</span>
              </button>
            ))}
          </nav>

          {canFAB && (
            <button className="fab" onClick={()=>setShowAdd(true)} aria-label="Add peptide">＋</button>
          )}

          {showModal && (
            <PeptideModal
              peptide={editPeptide||null}
              onSave={savePeptide}
              onDelete={deletePeptide}
              onClose={()=>{setEditPeptide(null);setShowAdd(false);}}
            />
          )}
        </div>

      <style global jsx>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --bg:#0a0a12; --surface:#13131e; --surface2:#1a1a28; --surface3:#222235;
          --border:#2e2e48; --accent:#14b8a6; --accent-dim:#0d7a70; --accent-light:#5eead4;
          --text:#f0f0f8; --text-mid:#b0b0cc; --text-dim:#6b6b90;
          --green:#22c55e; --red:#f87171; --yellow:#fbbf24;
          --radius:14px; --radius-sm:10px;
        }
        html { -webkit-text-size-adjust:100%; scroll-behavior:smooth; height:100%; }
        body {
          background:var(--bg); color:var(--text);
          font-family:-apple-system,'Inter','Segoe UI',system-ui,sans-serif;
          min-height:100vh; line-height:1.6;
          padding-top:env(safe-area-inset-top);
          padding-bottom:env(safe-area-inset-bottom);
          -webkit-tap-highlight-color:transparent;
          -webkit-font-smoothing:antialiased;
          overscroll-behavior:none;
        }
        input, textarea, select, button { font-family:inherit; }
        input[type="number"] { -moz-appearance:textfield; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }

        /* ── Layout ── */
        .app { display:flex; flex-direction:column; height:100dvh; max-width:480px; margin:0 auto; position:relative; }
        .topbar {
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 18px 10px; border-bottom:1px solid var(--border);
          background:var(--bg); flex-shrink:0;
          padding-top:calc(14px + env(safe-area-inset-top));
        }
        .app-title { font-size:18px; font-weight:800; letter-spacing:-.02em; }
        .topbar-right { display:flex; align-items:center; gap:10px; }
        .ver-badge {
          font-size:10px; font-weight:700; letter-spacing:.07em;
          color:var(--accent-light); background:rgba(20,184,166,.12);
          border:1px solid rgba(20,184,166,.3); padding:2px 8px; border-radius:99px;
        }
        .content { flex:1; overflow-y:auto; overflow-x:hidden; padding:16px 16px calc(80px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling:touch; }
        .bottom-nav {
          display:flex; border-top:1px solid var(--border); background:var(--bg);
          flex-shrink:0; padding-bottom:env(safe-area-inset-bottom);
        }
        .nav-btn {
          flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:3px; padding:10px 4px 8px; border:none; background:none; color:var(--text-dim);
          font-size:10px; font-weight:600; cursor:pointer; touch-action:manipulation;
          transition:color .15s;
        }
        .nav-btn.active { color:var(--accent); }
        .nav-icon { font-size:20px; }
        .nav-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }

        /* ── FAB ── */
        .fab {
          position:fixed; right:20px;
          bottom:calc(72px + env(safe-area-inset-bottom) + 12px);
          width:56px; height:56px; border-radius:50%; border:none;
          background:var(--accent); color:#fff; font-size:26px; font-weight:300;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          box-shadow:0 4px 20px rgba(20,184,166,.45); touch-action:manipulation;
          transition:transform .15s, box-shadow .15s;
        }
        .fab:active { transform:scale(.93); }

        /* ── Empty State ── */
        .empty-state { text-align:center; padding:60px 24px; }
        .empty-emoji { font-size:52px; margin-bottom:16px; }
        .empty-title { font-size:18px; font-weight:700; margin-bottom:8px; }
        .empty-sub   { font-size:14px; color:var(--text-mid); line-height:1.6; }

        /* ── Today View ── */
        .today-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .today-date   { font-size:15px; font-weight:600; color:var(--text-mid); }
        .today-pill   {
          font-size:12px; font-weight:700; padding:4px 12px; border-radius:99px;
          background:var(--surface2); border:1px solid var(--border); color:var(--text-mid);
        }
        .today-pill.done { background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.35); color:var(--green); }
        .all-done-banner {
          background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25);
          border-radius:var(--radius-sm); padding:12px 16px; font-size:14px; font-weight:600;
          color:var(--green); text-align:center; margin-bottom:14px;
        }
        .session-block { margin-bottom:20px; }
        .session-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text-dim); margin-bottom:10px; }
        .dose-card {
          background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
          padding:16px 14px; margin-bottom:10px; display:flex; align-items:center; gap:14px;
          transition:background .15s;
        }
        .dose-card.taken { background:rgba(34,197,94,.04); border-color:rgba(34,197,94,.2); }
        .dose-info      { flex:1; min-width:0; }
        .dose-name      { font-size:16px; font-weight:700; margin-bottom:4px; }
        .dose-meta      { font-size:13px; color:var(--text-mid); display:flex; align-items:center; gap:8px; }
        .dose-units     { color:var(--accent-light); font-weight:700; }
        .dose-taken-at  { font-size:12px; color:var(--green); margin-top:4px; font-weight:600; }
        .mark-btn {
          min-width:60px; min-height:52px; border-radius:var(--radius-sm); border:1.5px solid var(--accent);
          background:transparent; color:var(--accent); font-size:11px; font-weight:700; cursor:pointer;
          white-space:pre-line; text-align:center; line-height:1.3; touch-action:manipulation;
          transition:all .15s; flex-shrink:0;
        }
        .mark-btn:active { transform:scale(.95); }
        .mark-btn.taken { background:rgba(34,197,94,.12); border-color:var(--green); color:var(--green); font-size:20px; }

        /* ── Schedule View ── */
        .sched-table { display:grid; grid-template-columns:auto repeat(7,1fr); gap:2px; margin-bottom:20px; font-size:11px; }
        .sched-th, .sched-td    { display:flex; align-items:center; justify-content:center; min-height:36px; }
        .sched-name-col         { justify-content:flex-start !important; padding:0 8px 0 0; gap:8px; }
        .sched-th               { font-weight:700; color:var(--text-dim); font-size:10px; text-transform:uppercase; }
        .sched-day-th           { font-weight:700; color:var(--text-dim); font-size:10px; text-transform:uppercase; text-align:center; }
        .sched-td               { background:var(--surface); border-radius:6px; }
        .sched-today            { color:var(--accent) !important; background:rgba(20,184,166,.08) !important; }
        .sched-dot-sm           { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .sched-pname            { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px; }
        .sched-cell             { position:relative; }
        .sched-markers          { display:flex; flex-direction:column; align-items:center; gap:2px; }
        .sched-marker           { width:10px; height:10px; border-radius:50%; }
        .sched-legend           { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; }
        .legend-title           { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-dim); margin-bottom:10px; }
        .legend-row             { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); }
        .legend-row:last-of-type { border-bottom:none; }
        .legend-dot             { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        .legend-info            { flex:1; min-width:0; }
        .legend-name            { font-size:13px; font-weight:700; display:block; }
        .legend-meta            { font-size:11px; color:var(--text-dim); display:block; margin-top:1px; }
        .legend-opacity-note    { font-size:11px; color:var(--text-dim); margin-top:10px; display:flex; align-items:center; gap:6px; }
        .sched-marker-sample    { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--text-mid); }

        /* ── Peptides View ── */
        .peptide-list { display:flex; flex-direction:column; gap:2px; }
        .peptide-row  { display:flex; align-items:center; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; cursor:pointer; transition:background .15s; touch-action:manipulation; }
        .peptide-row:active { background:var(--surface2); }
        .peptide-row.paused { opacity:.55; }
        .peptide-bar  { width:5px; align-self:stretch; flex-shrink:0; }
        .peptide-info { flex:1; padding:14px 12px; min-width:0; }
        .peptide-name { font-size:15px; font-weight:700; margin-bottom:3px; }
        .peptide-meta { font-size:12px; color:var(--text-mid); }
        .peptide-notes{ font-size:11px; color:var(--text-dim); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .peptide-right{ display:flex; align-items:center; gap:8px; padding-right:14px; }
        .paused-badge { font-size:10px; font-weight:700; color:var(--yellow); background:rgba(251,191,36,.12); border:1px solid rgba(251,191,36,.3); padding:2px 8px; border-radius:99px; }
        .chevron      { font-size:20px; color:var(--text-dim); }

        /* ── Calculator View ── */
        .calc-wrap    { padding:4px 0; }
        .calc-card    { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px; }
        .calc-heading { font-size:17px; font-weight:800; margin-bottom:6px; }
        .calc-sub     { font-size:13px; color:var(--text-mid); margin-bottom:16px; line-height:1.5; }
        .calc-preset-row { margin-bottom:16px; }
        .calc-select  { width:100%; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); color:var(--text); padding:11px 14px; font-size:14px; outline:none; appearance:none; }
        .calc-fields  { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; }
        .calc-label   { font-size:12px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:.06em; display:block; margin-bottom:6px; }
        .calc-input-row { display:flex; align-items:center; gap:8px; }
        .calc-input   { flex:1; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); color:var(--text); padding:12px 14px; font-size:15px; outline:none; touch-action:manipulation; }
        .calc-input:focus { border-color:var(--accent); }
        .calc-unit-badge { font-size:12px; font-weight:700; color:var(--text-dim); background:var(--surface3); border:1px solid var(--border); padding:4px 10px; border-radius:99px; white-space:nowrap; }
        .calc-btn     { width:100%; padding:14px; border:none; border-radius:var(--radius-sm); background:var(--accent); color:#fff; font-size:15px; font-weight:700; cursor:pointer; touch-action:manipulation; transition:opacity .15s; }
        .calc-btn:disabled { opacity:.4; cursor:default; }
        .calc-result  { margin-top:20px; border-top:1px solid var(--border); padding-top:20px; }
        .result-hero  { text-align:center; margin-bottom:16px; }
        .result-big   { font-size:64px; font-weight:900; color:var(--accent); line-height:1; }
        .result-label { font-size:13px; color:var(--text-mid); font-weight:600; margin-top:4px; }
        .result-divider { height:1px; background:var(--border); margin-bottom:14px; }
        .result-rows  { display:flex; flex-direction:column; gap:10px; margin-bottom:16px; }
        .result-row   { display:flex; justify-content:space-between; font-size:13px; color:var(--text-mid); }
        .result-row strong { color:var(--text); font-weight:700; }
        .calc-reset   { width:100%; padding:10px; border:1.5px solid var(--border); border-radius:var(--radius-sm); background:none; color:var(--text-mid); font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; }

        /* ── History View ── */
        .hist-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px; }
        .hstat      { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px 10px; text-align:center; }
        .hstat-val  { font-size:26px; font-weight:800; }
        .hstat-lbl  { font-size:10px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }
        .hist-list  { display:flex; flex-direction:column; gap:10px; }
        .hist-day   { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
        .hist-day-hdr { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border); }
        .hist-day-lbl { font-size:13px; font-weight:700; }
        .hist-day-pill { font-size:11px; font-weight:700; color:var(--text-dim); background:var(--surface2); border:1px solid var(--border); padding:2px 10px; border-radius:99px; }
        .hist-day-pill.complete { color:var(--green); background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.3); }
        .hist-entry { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--border); }
        .hist-entry:last-child { border-bottom:none; }
        .hist-dot   { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .hist-pname { flex:1; font-size:13px; font-weight:600; }
        .hist-session { font-size:11px; color:var(--text-dim); background:var(--surface2); padding:2px 8px; border-radius:99px; font-weight:700; }
        .hist-status { font-size:12px; font-weight:700; min-width:80px; text-align:right; }
        .hist-entry.taken  .hist-status { color:var(--green); }
        .hist-entry.missed .hist-status { color:var(--red); }

        /* ── Modal ── */
        .overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:100; display:flex; align-items:flex-end; justify-content:center; backdrop-filter:blur(4px); }
        .modal { background:var(--surface); border-radius:var(--radius) var(--radius) 0 0; width:100%; max-width:480px; max-height:92dvh; display:flex; flex-direction:column; padding-bottom:env(safe-area-inset-bottom); }
        .modal-hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .modal-title { font-size:17px; font-weight:800; }
        .modal-x     { background:none; border:none; font-size:20px; color:var(--text-mid); cursor:pointer; touch-action:manipulation; }
        .modal-body  { overflow-y:auto; padding:16px 18px; display:flex; flex-direction:column; gap:10px; -webkit-overflow-scrolling:touch; }
        .m-input { width:100%; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); color:var(--text); padding:12px 14px; font-size:15px; font-family:inherit; outline:none; transition:border-color .2s; touch-action:manipulation; }
        .m-input:focus { border-color:var(--accent); }
        .m-textarea   { min-height:72px; resize:vertical; }
        .m-label      { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-dim); margin-top:4px; }
        .m-input-unit-row { display:flex; align-items:center; gap:8px; }
        .m-unit       { font-size:12px; font-weight:700; color:var(--text-dim); white-space:nowrap; }
        .m-two-col    { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .flex1        { flex:1; }
        .color-row    { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
        .color-swatch { width:28px; height:28px; border-radius:50%; border:3px solid transparent; cursor:pointer; transition:transform .15s; touch-action:manipulation; }
        .color-swatch.on { border-color:#fff; transform:scale(1.2); }
        .chip-row { display:flex; flex-wrap:wrap; gap:8px; }
        .chip-row.presets { margin-bottom:4px; }
        .chip { padding:8px 14px; border-radius:99px; border:1.5px solid var(--border); background:transparent; color:var(--text-mid); font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; transition:all .15s; white-space:nowrap; -webkit-tap-highlight-color:transparent; }
        .chip.on { background:rgba(20,184,166,.18); border-color:var(--accent); color:var(--accent-light); }
        .preset-chip { font-size:11px; padding:5px 10px; color:var(--text-dim); border-style:dashed; }
        .preset-chip:active { background:var(--surface2); }
        .units-preview { background:rgba(20,184,166,.08); border:1px solid rgba(20,184,166,.25); border-radius:var(--radius-sm); padding:10px 14px; font-size:13px; color:var(--accent-light); }
        .toggle-row   { display:flex; align-items:center; justify-content:space-between; padding:4px 0; cursor:pointer; touch-action:manipulation; }
        .toggle-label { font-size:14px; font-weight:600; }
        .toggle       { width:44px; height:24px; border-radius:99px; background:var(--surface3); border:1px solid var(--border); position:relative; transition:background .2s; }
        .toggle.on    { background:var(--accent); border-color:var(--accent); }
        .toggle-thumb { width:18px; height:18px; border-radius:50%; background:#fff; position:absolute; top:2px; left:2px; transition:left .2s; }
        .toggle.on .toggle-thumb { left:22px; }
        .m-btn { width:100%; padding:14px; border-radius:var(--radius-sm); font-size:15px; font-weight:700; cursor:pointer; touch-action:manipulation; transition:opacity .15s; border:none; }
        .m-btn.primary { background:var(--accent); color:#fff; }
        .m-btn.danger  { background:var(--red); color:#fff; }
        .m-btn.ghost   { background:none; border:1.5px solid var(--border); color:var(--text-mid); }
        .confirm-del-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .err-msg { font-size:13px; color:var(--red); font-weight:600; }
        .sched-type-toggle { display:flex; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:3px; gap:3px; }
        .stt-btn { flex:1; padding:9px; border:none; border-radius:8px; background:none; color:var(--text-mid); font-size:13px; font-weight:700; cursor:pointer; touch-action:manipulation; transition:all .15s; }
        .stt-btn.on { background:var(--accent); color:#fff; }
        .next-due-badge { font-size:11px; font-weight:700; color:var(--text-dim); background:var(--surface2); border:1px solid var(--border); padding:3px 10px; border-radius:99px; white-space:nowrap; flex-shrink:0; }
        .next-due-badge.today { color:var(--accent-light); background:rgba(20,184,166,.12); border-color:rgba(20,184,166,.3); }
        input[type="date"] { color-scheme:dark; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--border); border-radius:99px; }
        @media (max-width:380px) {
          .sched-pname { max-width:60px; }
          .result-big  { font-size:52px; }
        }
      `}</style>
    </>
  );
}
