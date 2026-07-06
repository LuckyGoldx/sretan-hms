import { useState, useCallback, useRef, useEffect } from 'react'

export type PartoEntry = {
  hour: number; time?: string; fhr?: number; cervix_cm?: number; descent_0_5?: number;
  contractions?: 1|2|3|4|5; oxytocin?: number; pulse?: number; bp_sys?: number; bp_dia?: number; temp?: number;
  amniotic_fluid?: 'I'|'C'|'M'|'B'; moulding?: '0'|'+'|'++'|'+++';
  urine_protein?: 'Nil'|'+'|'++'|'+++'; urine_acetone?: 'Nil'|'+'|'++'|'+++'; urine_volume?: '<30'|'30-100'|'>100';
  drugs_iv?: string; _id?: string;
}

export type PatientInfo = {
  name: string; gravida: number; para: number; hospital_number: string;
  admission_date: string; admission_time: string; ruptured_membranes_hours: number; hours_since_rupture: number;
}

interface PartographChartProps {
  entries: PartoEntry[]; patient: PatientInfo; editable?: boolean;
  onChangePatient?: (field: string, value: any) => void;
  onUpdateEntry?: (hour: number, key: keyof PartoEntry, value: any) => void;
  onDeleteEntry?: (entryId: string) => void; onClearAll?: () => void;
  canUndo?: boolean; canRedo?: boolean; onUndo?: () => void; onRedo?: () => void; staffId?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const CELL_W = 42; const LABEL_W = 108; const CHART_H = 220

const AMNIOTIC_OPTS = ['', 'I', 'C', 'M', 'B']
const MOULDING_OPTS = ['', '0', '+', '++', '+++']
const CONTRACTION_OPTS = ['', '1', '2', '3', '4', '5']
const OXYTOCIN_OPTS = ['', '0', '5', '10', '15', '20', '30', '40', '50']
const PROTEIN_OPTS = ['', 'Nil', '+', '++', '+++']
const VOLUME_OPTS = ['', '<30', '30-100', '>100']

function mapY(v: number, mn: number, mx: number, h: number) { return h - ((v - mn) / (mx - mn)) * h }
function snap(v: number, s: number) { return Math.round(v / s) * s }

// ── Reusable grid helpers ──
function HourCells({ render }: { render: (h: number) => React.ReactNode }) {
  return <>{HOURS.map((h) => <div key={h} className="border-r border-slate-300 flex-shrink-0" style={{ width: CELL_W }}>{render(h)}</div>)}</>
}

function YAxis({ vals, height, label }: { vals: number[]; height: number; label?: string }) {
  return (
    <div className="flex flex-col justify-between border-r border-slate-400 pr-0.5 py-0.5 flex-shrink-0 relative" style={{ width: 26, height }}>
      {label && <span className="absolute left-0.5 -top-3 text-[5px] text-slate-400 font-medium whitespace-nowrap">{label}</span>}
      {vals.map((v) => <span key={v} className="text-[6px] text-slate-500 text-right leading-none">{v}</span>)}
    </div>
  )
}

function GridBg({ rows, cols, rowScale, colScale, height, snapTo }: {
  rows: number[]; cols: number[]; rowScale: [number, number]; colScale: [number, number]; height: number; snapTo?: number
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {rows.map((v) => {
        const is5 = v % (snapTo || 10) === 0
        return <div key={v} className={`absolute left-0 right-0 ${is5 ? 'border-t border-slate-500' : 'border-t border-dashed border-slate-300'}`} style={{ top: mapY(v, rowScale[0], rowScale[1], height) }} />
      })}
      {cols.map((h) => <div key={h} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: h * CELL_W }} />)}
      {cols.filter(h => h % 2 === 0).map((h) => <div key={`v${h}`} className="absolute top-0 bottom-0 border-l border-slate-400" style={{ left: h * CELL_W }} />)}
    </div>
  )
}

function SelectCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      className="w-full h-full text-[7px] border-0 bg-transparent outline-none cursor-pointer text-center appearance-none hover:bg-blue-50 block">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function InputCell({ value, onChange, type = 'text', step, min, max, placeholder }: {
  value: any; onChange: (v: any) => void; type?: string; step?: number; min?: number; max?: number; placeholder?: string
}) {
  return (
    <input type={type} step={step} min={min} max={max} value={value ?? ''}
      onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      placeholder={placeholder}
      className="w-full h-full text-[7px] border-0 bg-transparent outline-none text-center hover:bg-blue-50" />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 border-r border-black flex items-center justify-center p-0.5" style={{ width: LABEL_W, minHeight: 22 }}>
      <span className="text-[6.5px] font-bold text-slate-700 leading-tight text-center">{children}</span>
    </div>
  )
}

// ── Main Component ──
export default function PartographChart({
  entries = [], patient, editable = false, onChangePatient, onUpdateEntry, onDeleteEntry, onClearAll,
  canUndo, canRedo, onUndo, onRedo, staffId,
}: PartographChartProps) {

  const emap = useCallback(() => { const m: Record<number, PartoEntry> = {}; for (const e of entries) m[e.hour] = e; return m }, [entries])
  const get = (h: number) => emap()[h]
  const upd = (h: number, k: keyof PartoEntry, v: any) => onUpdateEntry?.(h, k, v)

  // ── FHR click ──
  function fhrClick(e: React.MouseEvent) {
    if (!editable) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left; const y = e.clientY - rect.top
    const hour = Math.max(0, Math.min(23, Math.floor(x / CELL_W)))
    const v = snap(200 - y / rect.height * 120, 10)
    get(hour)?.fhr ? upd(hour, 'fhr', null) : upd(hour, 'fhr', Math.max(80, Math.min(200, v)))
  }

  // ── Cervix/Descent click ──
  function cxClick(e: React.MouseEvent) {
    if (!editable) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left; const y = e.clientY - rect.top
    const hour = Math.max(0, Math.min(23, Math.floor(x / CELL_W)))
    const isShift = (e as any).shiftKey
    if (isShift) {
      const v = snap(5 - y / rect.height * 5, 1)
      get(hour)?.descent_0_5 ? upd(hour, 'descent_0_5', null) : upd(hour, 'descent_0_5', Math.max(0, Math.min(5, v)))
    } else {
      const v = snap(10 - y / rect.height * 10, 1)
      get(hour)?.cervix_cm ? upd(hour, 'cervix_cm', null) : upd(hour, 'cervix_cm', Math.max(0, Math.min(10, v)))
    }
  }

  // ── Vitals ──
  const [bpDrawing, setBpDrawing] = useState(false)
  const [bpHour, setBpHour] = useState<number | null>(null)
  const bpStartRef = useRef({ y: 0, clientY: 0 })
  const [bpDiaDraft, setBpDiaDraft] = useState<number | null>(null)

  function vitalsDown(e: React.MouseEvent) {
    if (!editable) return
    const grid = (e.target as HTMLElement).closest('[data-vitals-grid]') as HTMLElement
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const x = e.clientX - rect.left; const y = e.clientY - rect.top
    const hour = Math.max(0, Math.min(23, Math.floor(x / CELL_W)))
    const sys = snap(180 - y / rect.height * 120, 5)
    bpStartRef.current = { y, clientY: e.clientY }
    setBpHour(hour); setBpDrawing(true); setBpDiaDraft(null)
    upd(hour, 'bp_sys', Math.max(60, Math.min(180, sys)))
  }

  function vitalsUp(e: React.MouseEvent) {
    if (!bpDrawing || bpHour == null) { setBpDrawing(false); return }
    const grid = (e.target as HTMLElement).closest('[data-vitals-grid]') as HTMLElement
    const dy = Math.abs(e.clientY - bpStartRef.current.clientY)
    if (dy < 5) {
      // Short click — toggle pulse
      if (grid) {
        const rect = grid.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top
        const hour = Math.max(0, Math.min(23, Math.floor(x / CELL_W)))
        const v = snap(180 - y / rect.height * 120, 10)
        get(hour)?.pulse ? upd(hour, 'pulse', null) : upd(hour, 'pulse', Math.max(60, Math.min(180, v)))
      }
    } else if (grid) {
      const rect = grid.getBoundingClientRect(); const y = e.clientY - rect.top
      const dia = snap(180 - y / rect.height * 120, 5)
      upd(bpHour, 'bp_dia', Math.max(40, Math.min(160, dia)))
    }
    setBpDrawing(false); setBpHour(null); setBpDiaDraft(null)
  }

  function vitalsLeave() { if (bpDrawing) { setBpDrawing(false); setBpHour(null); setBpDiaDraft(null) } }

  // ── SVG helpers ──
  const pts = (key: keyof PartoEntry, mn: number, mx: number, h: number) => {
    const r: { x: number; y: number; v: number; id?: string }[] = []
    for (const hr of HOURS) { const e = get(hr); const v = e?.[key]; if (v != null) r.push({ x: hr * CELL_W + CELL_W / 2, y: mapY(Number(v), mn, mx, h), v: Number(v), id: e._id }) }
    return r
  }
  const pathD = (p: { x: number; y: number }[]) => { if (!p.length) return ''; let d = `M ${p[0].x} ${p[0].y}`; for (let i = 1; i < p.length; i++) d += ` L ${p[i].x} ${p[i].y}`; return d }

  const fhrPts = pts('fhr', 80, 200, 240)
  const cxPts = pts('cervix_cm', 0, 10, 220)
  const dsPts = pts('descent_0_5', 0, 5, 220)
  const pulsePts = pts('pulse', 60, 180, 220)
  const bpPts = pts('bp_sys', 60, 180, 220)

  // ── WHO Alert/Action logic ──
  let alertCrossed = false, actionCrossed = false
  for (const e of entries) {
    if (e.cervix_cm != null) {
      const aHr = e.cervix_cm - 4; if (e.hour > aHr && aHr >= 0) alertCrossed = true
      const acHr = e.cervix_cm; if (e.hour > acHr && acHr >= 0) actionCrossed = true
    }
  }

  return (
    <div className="bg-white border-2 border-slate-700 rounded-lg overflow-hidden shadow-lg max-w-full print:border-black print:shadow-none" style={{ minWidth: 24 * CELL_W + LABEL_W + 26 }}>
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 border-b border-slate-500 text-[9px] print:hidden">
          <span className="font-semibold text-slate-700">PARTOGRAPH — WHO 1994</span>
          <button onClick={onUndo} disabled={!canUndo} className="px-1.5 py-0.5 rounded bg-white border border-slate-300 disabled:opacity-30">↩</button>
          <button onClick={onRedo} disabled={!canRedo} className="px-1.5 py-0.5 rounded bg-white border border-slate-300 disabled:opacity-30">↪</button>
          <div className="flex-1" />
          {actionCrossed && <span className="text-white bg-red-600 px-2 py-0.5 rounded animate-pulse font-bold text-[10px]">ACTION REQUIRED</span>}
          {alertCrossed && !actionCrossed && <span className="text-amber-800 bg-amber-200 px-2 py-0.5 rounded font-bold text-[10px]">Crossed Alert Line</span>}
          <span className="text-[7px] text-slate-400">{entries.length} entries</span>
          <button onClick={onClearAll} className="px-1.5 py-0.5 rounded bg-white border border-red-300 text-red-600">Clear</button>
        </div>
      )}

      {/* ═══════ HEADER ═══════ */}
      <div className="border-b border-black">
        <div className="flex border-b border-black">
          {[
            { label: 'Name', key: 'name', type: 'text' },
            { label: 'Gravida', key: 'gravida', type: 'number' },
            { label: 'Para', key: 'para', type: 'number' },
            { label: 'Hospital number', key: 'hospital_number', type: 'text' },
          ].map((f) => (
            <div key={f.key} className="flex-1 border-r border-black p-1">
              <span className="text-[7px] font-bold text-slate-600 block">{f.label}</span>
              {editable && onChangePatient ? (
                <input type={f.type} value={(patient as any)[f.key] ?? ''} min={0}
                  onChange={(e) => onChangePatient(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  className="w-full text-[10px] font-medium border-0 outline-none bg-transparent" />
              ) : <span className="text-[10px] font-medium">{(patient as any)[f.key] || '—'}</span>}
            </div>
          ))}
        </div>
        <div className="flex">
          {[
            { label: 'Date of admission', key: 'admission_date', type: 'date' },
            { label: 'Time of admission', key: 'admission_time', type: 'time' },
            { label: 'Ruptured membranes (h)', key: 'ruptured_membranes_hours', type: 'number' },
            { label: 'hours since', key: 'hours_since_rupture', type: 'number' },
          ].map((f) => (
            <div key={f.key} className="flex-1 border-r border-black p-1">
              <span className="text-[7px] font-bold text-slate-600 block">{f.label}</span>
              {editable && onChangePatient ? (
                <input type={f.type} value={(patient as any)[f.key] ?? ''} min={0}
                  onChange={(e) => onChangePatient(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  className="w-full text-[10px] font-medium border-0 outline-none bg-transparent" />
              ) : <span className="text-[10px] font-medium">{(patient as any)[f.key] || '—'}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ 1. FETAL HEART RATE ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel><span style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>Fetal heart rate</span></SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: 24 * CELL_W + 26 }}>
              <div className="flex">
                <YAxis vals={[200,190,180,170,160,150,140,130,120,110,100,90,80]} height={240} />
                <div className="flex-1 relative cursor-crosshair select-none" style={{ height: 240 }} onClick={fhrClick}>
                  {/* Shading zones */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-0 right-0 bg-red-200/25" style={{ top: 0, height: mapY(110,80,200,240) }} />
                    <div className="absolute left-0 right-0 bg-red-200/25" style={{ top: mapY(160,80,200,240), bottom: 0 }} />
                    <div className="absolute left-0 right-0 bg-amber-200/25" style={{ top: mapY(110,80,200,240), height: mapY(120,80,200,240)-mapY(110,80,200,240) }} />
                    <div className="absolute left-0 right-0 bg-amber-200/25" style={{ top: mapY(150,80,200,240), height: mapY(160,80,200,240)-mapY(150,80,200,240) }} />
                    <div className="absolute left-0 right-0 bg-green-200/25" style={{ top: mapY(150,80,200,240), height: mapY(120,80,200,240)-mapY(150,80,200,240) }} />
                  </div>
                  <GridBg rows={[200,190,180,170,160,150,140,130,120,110,100,90,80]} cols={HOURS} rowScale={[80,200]} colScale={[0,23]} height={240} snapTo={10} />
                  {/* Thick lines at 90 and 180 */}
                  <div className="absolute left-0 right-0 border-t-2 border-slate-700" style={{ top: mapY(180,80,200,240) }} />
                  <div className="absolute left-0 right-0 border-t-2 border-slate-700" style={{ top: mapY(90,80,200,240) }} />
                  <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                    {fhrPts.length > 1 && <path d={pathD(fhrPts)} fill="none" stroke="#2563eb" strokeWidth={1.5} />}
                    {fhrPts.map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r={5} fill="transparent" className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); upd(Math.round(pt.x / CELL_W), 'fhr', null) }} />
                        <circle cx={pt.x} cy={pt.y} r={2.5} fill="#2563eb" />
                      </g>
                    ))}
                  </svg>
                  {editable && <div className="absolute bottom-0.5 right-1 text-[6px] text-slate-400 bg-white/80 px-0.5 rounded">Click to plot FHR</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 2. AMNIOTIC FLUID / MOULDING ═══════ */}
      <div className="flex border-b border-black">
        <SectionLabel>Amniotic fluid<br />Moulding</SectionLabel>
        <div className="flex-1 overflow-x-auto">
          <div className="flex" style={{ width: 24 * CELL_W + 26 }}>
            {HOURS.map((h) => {
              const e = get(h)
              return (
                <div key={h} className="border-r border-slate-300 flex" style={{ width: CELL_W }}>
                  <div className="w-1/2 border-r border-slate-200">
                    {editable ? <SelectCell value={e?.amniotic_fluid ?? ''} options={AMNIOTIC_OPTS} onChange={(v) => upd(h, 'amniotic_fluid', v || undefined)} /> : <span className="text-[7px] block text-center">{e?.amniotic_fluid || ''}</span>}
                  </div>
                  <div className="w-1/2">
                    {editable ? <SelectCell value={e?.moulding ?? ''} options={MOULDING_OPTS} onChange={(v) => upd(h, 'moulding', v || undefined)} /> : <span className="text-[7px] block text-center">{e?.moulding || ''}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══════ 3. CERVIX / DESCENT (CORE PARTOGRAPH) ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Cervix (cm)<br />(Plot X)<br /><span className="text-[6px] text-blue-600">Descent (Plot O)</span></SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: 24 * CELL_W + 26 + 22 }}>
              <div className="flex">
                {/* Outer Y-axis: Cervix 0-10 */}
                <div className="flex flex-col justify-between border-r border-slate-400 pr-0.5 py-0.5 flex-shrink-0" style={{ width: 26, height: 220 }}>
                  {[10,9,8,7,6,5,4,3,2,1,0].map((v) => <span key={v} className="text-[6px] text-slate-600 text-right leading-none font-bold">{v}</span>)}
                </div>
                {/* Inner Y-axis: Descent 0-5 */}
                <div className="flex flex-col justify-between border-r border-slate-400 pr-0.5 py-0.5 flex-shrink-0 bg-blue-50/30" style={{ width: 20, height: 220 }}>
                  {[5,4,3,2,1,0].map((v) => <span key={v} className="text-[5px] text-blue-600 text-right leading-none font-bold">{v}</span>)}
                </div>
                <div className="flex-1 relative cursor-crosshair select-none" style={{ height: 220 }} onClick={cxClick}>
                  <GridBg rows={[10,9,8,7,6,5,4,3,2,1,0]} cols={HOURS} rowScale={[0,10]} colScale={[0,23]} height={220} snapTo={5} />
                  {/* Descent midline at station 0 (value 3 on 0-5 scale) */}
                  <div className="absolute left-0 right-0 border-t border-dotted border-blue-400" style={{ top: mapY(3,0,5,220) }} />
                  <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                    {/* Alert line: from [4cm, H0] to [10cm, H6] */}
                    <line x1={0*CELL_W+CELL_W/2} y1={mapY(4,0,10,220)} x2={6*CELL_W+CELL_W/2} y2={mapY(10,0,10,220)} stroke="black" strokeWidth={1.2} />
                    <text x={6*CELL_W+CELL_W/2-8} y={mapY(10,0,10,220)+9} fontSize={7} fill="black" dominantBaseline="hanging">Alert</text>
                    {/* Action line: from [4cm, H4] to [10cm, H10] */}
                    <line x1={4*CELL_W+CELL_W/2} y1={mapY(4,0,10,220)} x2={10*CELL_W+CELL_W/2} y2={mapY(10,0,10,220)} stroke="#dc2626" strokeWidth={2} strokeDasharray="5,3" />
                    <text x={10*CELL_W+CELL_W/2-14} y={mapY(10,0,10,220)+9} fontSize={7} fill="#dc2626" dominantBaseline="hanging">Action</text>
                    {/* Cervix X marks */}
                    {cxPts.map((pt, i) => (
                      <g key={i}>
                        <rect x={pt.x-5} y={pt.y-5} width={10} height={10} fill="transparent" className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); upd(Math.round(pt.x/CELL_W),'cervix_cm',null) }} />
                        <line x1={pt.x-3.5} y1={pt.y-3.5} x2={pt.x+3.5} y2={pt.y+3.5} stroke="#dc2626" strokeWidth={1.5} />
                        <line x1={pt.x+3.5} y1={pt.y-3.5} x2={pt.x-3.5} y2={pt.y+3.5} stroke="#dc2626" strokeWidth={1.5} />
                      </g>
                    ))}
                    {/* Descent O marks */}
                    {dsPts.map((pt, i) => (
                      <g key={i}>
                        <rect x={pt.x-5} y={pt.y-5} width={10} height={10} fill="transparent" className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); upd(Math.round(pt.x/CELL_W),'descent_0_5',null) }} />
                        <circle cx={pt.x} cy={pt.y} r={3.5} fill="none" stroke="#2563eb" strokeWidth={1.5} />
                      </g>
                    ))}
                  </svg>
                  {editable && <div className="absolute bottom-0.5 right-1 text-[6px] text-slate-400 bg-white/80 px-0.5 rounded">Click X · Shift+Click O</div>}
                </div>
              </div>
              {/* Hours row */}
              <div className="flex border-t border-slate-500 bg-slate-50">
                <div className="flex-shrink-0 text-center font-bold text-[6px] text-slate-500 border-r border-slate-300 py-0.5" style={{ width: 48 }}>HOURS</div>
                {HOURS.map((h) => <div key={h} className="border-r border-slate-300 text-center text-[6px] font-bold text-slate-600 py-0.5" style={{ width: CELL_W }}>{h}</div>)}
              </div>
              {/* Time row */}
              <div className="flex border-t border-slate-300">
                <div className="flex-shrink-0 text-center font-bold text-[6px] text-slate-500 border-r border-slate-300 py-0.5" style={{ width: 48 }}>TIME</div>
                {HOURS.map((h) => {
                  const e = get(h)
                  return <div key={h} className="border-r border-slate-300" style={{ width: CELL_W }}>
                    {editable ? <input type="time" value={e?.time ?? ''} onChange={(e2) => upd(h, 'time', e2.target.value)} className="w-full text-[6px] border-0 outline-none text-center bg-transparent hover:bg-blue-50" /> : <span className="text-[6px] block text-center">{e?.time || ''}</span>}
                  </div>
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 4. CONTRACTIONS PER 10 MIN ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Contractions<br />per 10 min</SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div className="flex" style={{ width: 24 * CELL_W + 26 }}>
              <div className="flex flex-col justify-between border-r border-slate-400 py-0.5 flex-shrink-0" style={{ width: 26, height: 90 }}>
                {[5,4,3,2,1].map((v) => <span key={v} className="text-[6px] text-slate-500 text-right leading-none">{v}</span>)}
              </div>
              <div className="flex-1">
                <div className="flex" style={{ height: 90 }}>
                  {HOURS.map((h) => (
                    <div key={h} className="border-r border-slate-200 flex-shrink-0" style={{ width: CELL_W }}>
                      {editable ? (
                        <SelectCell value={String(get(h)?.contractions ?? '')} options={CONTRACTION_OPTS} onChange={(v) => upd(h, 'contractions', v ? Number(v) as 1|2|3|4|5 : undefined)} />
                      ) : (
                        <span className="text-[7px] block text-center pt-6">{get(h)?.contractions ?? ''}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 5. OXYTOCIN ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Oxytocin<br />U/L drops/min</SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div className="flex" style={{ width: 24 * CELL_W + 26 }}>
              {HOURS.map((h) => (
                <div key={h} className="border-r border-slate-200 flex-shrink-0" style={{ width: CELL_W }}>
                  {editable ? (
                    <SelectCell value={String(get(h)?.oxytocin ?? '')} options={OXYTOCIN_OPTS} onChange={(v) => upd(h, 'oxytocin', v ? Number(v) : undefined)} />
                  ) : (
                    <span className="text-[7px] block text-center py-4">{get(h)?.oxytocin ?? ''}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 6. DRUGS GIVEN AND IV FLUIDS ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Drugs given<br />and IV fluids</SectionLabel>
          <div className="flex-1 overflow-x-auto" style={{ minHeight: 66 }}>
            {editable ? (
              <textarea value={entries.find(e => e.drugs_iv)?.drugs_iv ?? ''}
                onChange={(e) => { const first = entries[0]; if (first) upd(first.hour, 'drugs_iv', e.target.value) }}
                className="w-full h-full min-h-[66px] text-[7px] border-0 outline-none resize-none p-1" placeholder="Record drugs and IV fluids given..." />
            ) : (
              <p className="text-[7px] p-1">{entries.find(e => e.drugs_iv)?.drugs_iv || ''}</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ 7. MATERNAL VITAL SIGNS ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Pulse ●<br />and BP ↑</SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: 24 * CELL_W + 26 }}>
              <div className="flex">
                <YAxis vals={[180,170,160,150,140,130,120,110,100,90,80,70,60]} height={220} />
                <div className="flex-1 relative cursor-crosshair select-none" style={{ height: 220 }}
                  data-vitals-grid
                  onMouseDown={vitalsDown} onMouseUp={vitalsUp} onMouseLeave={vitalsLeave}>
                  <GridBg rows={[180,170,160,150,140,130,120,110,100,90,80,70,60]} cols={HOURS} rowScale={[60,180]} colScale={[0,23]} height={220} snapTo={20} />
                  <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                    {pulsePts.map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r={6} fill="transparent" className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); upd(Math.round(pt.x/CELL_W),'pulse',null) }} />
                        <circle cx={pt.x} cy={pt.y} r={3} fill="#2563eb" />
                      </g>
                    ))}
                    {bpPts.map((pt, i) => {
                      const e = get(Math.round(pt.x/CELL_W))
                      const dia = e?.bp_dia != null ? mapY(e.bp_dia,60,180,220) : pt.y+30
                      return (
                        <g key={i}>
                          <rect x={pt.x-6} y={Math.min(pt.y,dia)-6} width={12} height={Math.abs(dia-pt.y)+12} fill="transparent" className="cursor-pointer pointer-events-auto"
                            onClick={(e) => { e.stopPropagation(); upd(Math.round(pt.x/CELL_W),'bp_sys',null); upd(Math.round(pt.x/CELL_W),'bp_dia',null) }} />
                          <line x1={pt.x} y1={pt.y} x2={pt.x} y2={dia} stroke="#dc2626" strokeWidth={1.5} />
                          <polygon points={`${pt.x-3},${pt.y+4} ${pt.x+3},${pt.y+4} ${pt.x},${pt.y-1}`} fill="#dc2626" />
                          <text x={pt.x+4} y={pt.y+3} fontSize={5} fill="#dc2626" fontWeight="bold">S</text>
                          <text x={pt.x+4} y={dia+3} fontSize={5} fill="#dc2626">D</text>
                        </g>
                      )
                    })}
                  </svg>
                  {editable && <div className="absolute bottom-0.5 right-1 text-[6px] text-slate-400 bg-white/80 px-0.5 rounded">Click ● · Drag ↑</div>}
                </div>
              </div>
              <div className="flex border-t border-slate-300 bg-slate-50 py-0.5 px-1 text-[6px] text-slate-500 gap-3">
                <span>● = Pulse</span><span>↑ = BP Systolic/Diastolic</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 8. TEMPERATURE ═══════ */}
      <div className="border-b border-black">
        <div className="flex">
          <SectionLabel>Temp °C</SectionLabel>
          <div className="flex-1 overflow-x-auto">
            <div className="flex" style={{ width: 24 * CELL_W + 26 }}>
              {HOURS.map((h) => (
                <div key={h} className="border-r border-slate-200 flex-shrink-0" style={{ width: CELL_W }}>
                  {editable ? (
                    <InputCell value={get(h)?.temp ?? ''} onChange={(v) => upd(h, 'temp', v)} type="number" step={0.1} min={30} max={42} />
                  ) : (
                    <span className="text-[7px] block text-center py-2">{(() => { const e = get(h); return e?.temp != null ? e.temp.toFixed(1) : '' })()}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 9. URINE ═══════ */}
      <div className="border-b border-black">
        <div className="flex border-b border-slate-200">
          <SectionLabel>Urine</SectionLabel>
          <div className="flex-1" />
        </div>
        {[
          { label: 'protein', key: 'urine_protein' as const, opts: PROTEIN_OPTS },
          { label: 'acetone', key: 'urine_acetone' as const, opts: PROTEIN_OPTS },
          { label: 'volume', key: 'urine_volume' as const, opts: VOLUME_OPTS },
        ].map((row) => (
          <div key={row.label} className="flex border-t border-slate-200">
            <div className="flex-shrink-0 border-r border-slate-300 p-0.5 bg-slate-50" style={{ width: LABEL_W }}>
              <span className="text-[6px] font-semibold text-slate-500">{row.label}</span>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex" style={{ width: 24 * CELL_W + 26 }}>
                {HOURS.map((h) => (
                  <div key={h} className="border-r border-slate-200 flex-shrink-0" style={{ width: CELL_W }}>
                    {editable ? (
                      row.key === 'urine_volume'
                        ? <SelectCell value={get(h)?.urine_volume ?? ''} options={VOLUME_OPTS} onChange={(v) => upd(h, 'urine_volume', v as any)} />
                        : <SelectCell value={(get(h) as any)?.[row.key] ?? ''} options={PROTEIN_OPTS} onChange={(v) => upd(h, row.key, v || undefined)} />
                    ) : (
                      <span className="text-[6px] block text-center">{(get(h) as any)?.[row.key] || ''}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════ BOTTOM: HOURS + TIME ═══════ */}
      <div className="border-t border-black">
        <div className="flex border-b border-slate-300">
          <div className="flex-shrink-0 font-bold text-[6px] text-slate-500 border-r border-slate-300 p-0.5 text-center" style={{ width: LABEL_W }}>HOURS</div>
          {HOURS.map((h) => <div key={h} className="border-r border-slate-300 text-center text-[6px] font-bold text-slate-600 py-0.5" style={{ width: CELL_W }}>{h}</div>)}
        </div>
        <div className="flex">
          <div className="flex-shrink-0 font-bold text-[6px] text-slate-500 border-r border-slate-300 p-0.5 text-center" style={{ width: LABEL_W }}>TIME</div>
          {HOURS.map((h) => {
            const e = get(h)
            return (
              <div key={h} className="border-r border-slate-300" style={{ width: CELL_W }}>
                {editable ? (
                  <input type="time" value={e?.time ?? ''} onChange={(e2) => upd(h, 'time', e2.target.value)}
                    className="w-full text-[6px] border-0 outline-none text-center bg-transparent hover:bg-blue-50" />
                ) : (
                  <span className="text-[6px] block text-center">{e?.time || ''}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
