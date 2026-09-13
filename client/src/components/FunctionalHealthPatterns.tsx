import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../hooks/useAxios'
import {
  Activity, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ClipboardList,
  History, Loader2, Plus, Save,
} from 'lucide-react'

const STATUS_META: Record<string, { label: string; cls: string }> = {
  effective: { label: 'Effective', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  at_risk: { label: 'At Risk', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  ineffective: { label: 'Ineffective', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  not_assessed: { label: 'Not assessed', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}
const STATUS_ORDER = ['effective', 'at_risk', 'ineffective', 'not_assessed']

const TYPE_LABEL: Record<string, string> = { baseline: 'Baseline', shift: 'Shift reassessment', discharge: 'Discharge' }

interface Pattern { code: string; label: string; short: string; prompts: { key: string; label: string; critical?: boolean }[] }
interface FindingState { status: string; responses: Record<string, boolean>; notes: string }

const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

function emptyFinding(): FindingState { return { status: 'not_assessed', responses: {}, notes: '' } }

export default function FunctionalHealthPatterns({ admissionId, active = true, onChanged }: { admissionId: string; patientId?: string; active?: boolean; onChanged?: () => void }) {
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [assessments, setAssessments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [assessmentType, setAssessmentType] = useState<'baseline' | 'shift' | 'discharge'>('baseline')
  const [summary, setSummary] = useState('')
  const [findings, setFindings] = useState<Record<string, FindingState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [readOnly, setReadOnly] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)

  const applyAssessment = useCallback((patternsList: Pattern[], a: any) => {
    const next: Record<string, FindingState> = {}
    for (const p of patternsList) next[p.code] = emptyFinding()
    for (const f of (a?.findings || [])) {
      if (next[f.pattern_code]) next[f.pattern_code] = { status: f.status || 'not_assessed', responses: f.responses || {}, notes: f.notes || '' }
    }
    setFindings(next)
    setAssessmentId(a?.id || null)
    setAssessmentType(a?.assessment_type || 'baseline')
    setSummary(a?.summary || '')
    setReadOnly(a ? a.status === 'completed' : false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [tplRes, listRes] = await Promise.all([
        api.get('/fhp/template').catch(() => ({ data: { patterns: [] } })),
        api.get(`/admissions/${admissionId}/fhp`).catch(() => ({ data: [] })),
      ])
      const list: Pattern[] = tplRes.data?.patterns || []
      const history: any[] = Array.isArray(listRes.data) ? listRes.data : []
      setPatterns(list)
      setAssessments(history)
      if (list.length === 0) {
        setError('The assessment template could not be loaded. Please refresh, or contact an administrator.')
        return
      }
      const latest = history[0]
      // The 11 patterns are always opened maximised by default; the nurse may
      // collapse individual ones, and that choice then persists.
      const allExpanded = Object.fromEntries(list.map((p) => [p.code, true]))
      if (latest && latest.status === 'draft') {
        // Resume the open draft so it can be finished.
        applyAssessment(list, latest)
        setExpanded(allExpanded)
      } else if (latest) {
        // Show the last completed assessment read-only; a reassessment starts on demand.
        applyAssessment(list, latest)
        setReadOnly(true)
        setExpanded(allExpanded)
      } else {
        // First assessment for this admission: open an editable baseline right
        // away (cards expanded) so the nurse can start recording immediately.
        const blank: Record<string, FindingState> = {}
        for (const p of list) blank[p.code] = emptyFinding()
        setFindings(blank)
        setAssessmentId(null)
        setAssessmentType('baseline')
        setSummary('')
        setReadOnly(false)
        setExpanded(Object.fromEntries(list.map((p) => [p.code, true])))
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load the assessment template.')
    } finally { setLoading(false) }
  }, [admissionId, applyAssessment])

  useEffect(() => { load() }, [load])

  const baselineDone = useMemo(
    () => assessments.some((a) => a.assessment_type === 'baseline' && a.status === 'completed'),
    [assessments]
  )
  const openCount = useMemo(() => patterns.filter((p) => findings[p.code]?.status !== 'not_assessed').length, [patterns, findings])
  const flaggedCount = useMemo(() => patterns.filter((p) => ['ineffective', 'at_risk'].includes(findings[p.code]?.status || '')).length, [patterns, findings])

  function startNew(type: 'baseline' | 'shift' | 'discharge') {
    const blank: Record<string, FindingState> = {}
    for (const p of patterns) blank[p.code] = emptyFinding()
    setFindings(blank); setAssessmentId(null); setAssessmentType(type)
    setSummary(''); setReadOnly(false); setError(''); setNotice('')
    // Expand every pattern so the findings are immediately visible/clickable.
    setExpanded(Object.fromEntries(patterns.map((p) => [p.code, true])))
  }

  function setPatternStatus(code: string, status: string) {
    if (readOnly) return
    setFindings((prev) => ({ ...prev, [code]: { ...(prev[code] || emptyFinding()), status } }))
  }
  function togglePrompt(code: string, key: string) {
    if (readOnly) return
    // Ticking a finding records it but never changes the pattern status — the
    // nurse decides Effective / At Risk / Ineffective explicitly.
    setFindings((prev) => {
      const cur = prev[code] || emptyFinding()
      return { ...prev, [code]: { ...cur, responses: { ...cur.responses, [key]: !cur.responses[key] } } }
    })
  }
  function setNotes(code: string, notes: string) {
    if (readOnly) return
    setFindings((prev) => ({ ...prev, [code]: { ...(prev[code] || emptyFinding()), notes } }))
  }

  function markRemainingEffective() {
    if (readOnly) return
    setFindings((prev) => {
      const next = { ...prev }
      for (const p of patterns) {
        if ((next[p.code]?.status || 'not_assessed') === 'not_assessed') {
          next[p.code] = { ...(next[p.code] || emptyFinding()), status: 'effective' }
        }
      }
      return next
    })
  }

  async function save(status: 'draft' | 'completed') {
    if (status === 'completed' && assessmentType === 'baseline') {
      const missing = patterns.filter((p) => (findings[p.code]?.status || 'not_assessed') === 'not_assessed')
      if (missing.length > 0) {
        // Always give visible feedback next to the button that was clicked.
        setError(`${missing.length} pattern${missing.length === 1 ? '' : 's'} still need a status. Set each one, or use "Mark unassessed as Effective".`)
        footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const payloadFindings = patterns.map((p) => {
        const f = findings[p.code] || emptyFinding()
        return { pattern_code: p.code, status: f.status, responses: f.responses, notes: f.notes }
      })
      const res = await api.post(`/admissions/${admissionId}/fhp`, {
        assessment_id: assessmentId || undefined,
        assessment_type: assessmentType,
        status,
        summary: summary || null,
        assessed_by: currentUserId,
        findings: payloadFindings,
      })
      const saved = res.data
      setAssessments((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)])
      setAssessmentId(saved.id)
      setReadOnly(saved.status === 'completed')
      setNotice(status === 'completed' ? 'Assessment completed.' : 'Draft saved.')
      onChanged?.()
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save the assessment.')
      footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } finally { setBusy(false) }
  }

  if (loading) return <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-primary" /></div>

  const canWrite = active && !readOnly

  return (
    <div className="space-y-4">
      {/* Header / status */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Activity size={20} className="text-indigo-600" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Functional Health Patterns · {TYPE_LABEL[assessmentType] || assessmentType}{!assessmentId && !readOnly ? ' (unsaved)' : ''}</h3>
            <p className="text-xs text-slate-500">
              {openCount}/{patterns.length} patterns assessed
              {flaggedCount > 0 && <span className="text-rose-600 font-medium"> · {flaggedCount} flagged</span>}
              {!active && <span className="text-amber-600"> · patient not admitted — read-only</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly && active && (
            <div className="flex gap-1.5">
              {!baselineDone && <button onClick={() => startNew('baseline')} title="Record the full 11-pattern assessment on admission" className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700">New baseline</button>}
              {baselineDone && <button onClick={() => startNew('shift')} title="Record this shift's reassessment" className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"><Plus size={12} className="inline mr-1" />Shift reassessment</button>}
              {baselineDone && <button onClick={() => startNew('discharge')} title="Record the patient's final functional status before discharge" className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-medium hover:bg-slate-800">Discharge assessment</button>}
            </div>
          )}
          {assessments.length > 0 && (
            <button onClick={() => setShowHistory((s) => !s)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1">
              <History size={12} /> {assessments.length} record{assessments.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {readOnly && notice && <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700"><CheckCircle size={15} /> {notice}</div>}
      {readOnly && error && <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertTriangle size={15} /> {error}</div>}
      {canWrite && !assessmentId && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-700">
          <AlertTriangle size={15} /> Recording a new {TYPE_LABEL[assessmentType] || assessmentType} assessment — tick the relevant findings and save when done.
        </div>
      )}

      {showHistory && assessments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {assessments.map((a) => {
            const openHist = expandedHistory === a.id
            return (
              <div key={a.id} className="border-b border-slate-100 last:border-b-0">
                <button onClick={() => setExpandedHistory(openHist ? null : a.id)}
                  className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-left hover:bg-slate-50">
                  <span className="text-slate-700">
                    {TYPE_LABEL[a.assessment_type] || a.assessment_type} · {new Date(a.assessed_at).toLocaleString()}
                    {assessmentId === a.id && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">CURRENT</span>}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                    <span className="text-xs text-slate-400">{a.assessed_by_name || '—'}</span>
                    {openHist ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </span>
                </button>
                {openHist && (
                  <div className="px-4 pb-4 pt-1 space-y-2.5 bg-slate-50/70 border-t border-slate-100">
                    {patterns.map((p) => {
                      const f = (a.findings || []).find((x: any) => x.pattern_code === p.code)
                      if (!f) return null
                      const meta = STATUS_META[f.status] || STATUS_META.not_assessed
                      const checked = p.prompts.filter((pr) => f.responses?.[pr.key])
                      return (
                        <div key={p.code} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-700">{p.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}>{meta.label}</span>
                          </div>
                          {checked.length > 0 && (
                            <p className="text-slate-500 mt-0.5">Findings: {checked.map((c) => c.label).join('; ')}</p>
                          )}
                          {f.notes && <p className="text-slate-500 italic mt-0.5">{f.notes}</p>}
                        </div>
                      )
                    })}
                    {a.summary && <p className="text-xs text-slate-600 pt-1"><span className="font-medium">Summary:</span> {a.summary}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pattern cards */}
      <div className="space-y-2.5">
        {patterns.map((p, idx) => {
          const f = findings[p.code] || emptyFinding()
          const meta = STATUS_META[f.status] || STATUS_META.not_assessed
          const open = expanded[p.code]
          const anyCritical = p.prompts.some((pr) => pr.critical && f.responses[pr.key])
          const highlighted = f.status === 'ineffective' || anyCritical
          return (
            <div key={p.code} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${highlighted ? 'border-rose-200' : f.status === 'at_risk' ? 'border-amber-200' : 'border-slate-200'}`}>
              <button onClick={() => setExpanded((e) => ({ ...e, [p.code]: !e[p.code] }))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-800 truncate">{p.label}</span>
                  {anyCritical && <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}>{meta.label}</span>
                  {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                </div>
              </button>

              {open && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_ORDER.map((s) => (
                      <button key={s} disabled={!canWrite} onClick={() => setPatternStatus(p.code, s)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-60 ${
                          f.status === s ? STATUS_META[s].cls : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>{STATUS_META[s].label}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    {p.prompts.map((pr) => (
                      <label key={pr.key} className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
                        <input type="checkbox" disabled={!canWrite} checked={!!f.responses[pr.key]} onChange={() => togglePrompt(p.code, pr.key)}
                          className="mt-0.5 w-4 h-4 accent-primary disabled:opacity-60" />
                        <span className={pr.critical && f.responses[pr.key] ? 'text-rose-600 font-medium' : ''}>{pr.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea rows={2} disabled={!canWrite} value={f.notes} onChange={(e) => setNotes(p.code, e.target.value)}
                    placeholder="Findings / nursing notes for this pattern"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none disabled:bg-slate-50" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {canWrite && (
        <div ref={footerRef} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          {error && <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertTriangle size={15} /> {error}</div>}
          {notice && <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700"><CheckCircle size={15} /> {notice}</div>}
          {assessmentType === 'baseline' && openCount < patterns.length && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span>{patterns.length - openCount} pattern{patterns.length - openCount === 1 ? '' : 's'} still need a status before the baseline can be completed.</span>
              <button type="button" onClick={markRemainingEffective}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700">Mark unassessed as Effective</button>
            </div>
          )}
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="Overall assessment summary (optional)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => save('draft')} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
            </button>
            <button onClick={() => save('completed')} disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Complete assessment
            </button>
          </div>
        </div>
      )}

      {!canWrite && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
          <ClipboardList size={14} />
          {active
            ? 'This assessment is completed and locked. Start a new one above to reassess.'
            : 'This admission is closed. The functional assessment is read-only and cannot be edited unless the patient is re-admitted.'}
        </div>
      )}
    </div>
  )
}
