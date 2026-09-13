import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import VoiceTextInput from './VoiceTextInput'
import ReadMore from './ReadMore'
import { getClinicInfo } from '../utils/clinicInfo'
import {
  ArrowLeft, Loader2, Plus, Search, ClipboardList, X, CheckCircle, ChevronLeft, ChevronRight,
  Printer, User, FileText, ExternalLink, Calendar, Eye,
} from 'lucide-react'

const currentUser: any = (() => { try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch {} return null })()
const role = currentUser?.role || ''
const canCreate = ['Nurse', 'Admin'].includes(role)
const canAck = ['Nurse', 'Admin', 'Doctor', 'Specialist'].includes(role)
const LIMIT = 20
const DRAFT_KEY = 'handover_draft_' + (currentUser?.id || 'anon')

const FLAG_OPTIONS = ['Deteriorating', 'Isolation', 'Falls risk', 'Allergies', 'NPO', 'IV / Lines', 'Pressure areas', 'Pending results', 'Critical']
const PRIORITIES = [{ v: 'routine', l: 'Routine', c: 'bg-slate-100 text-slate-600' }, { v: 'watch', l: 'Watch', c: 'bg-amber-100 text-amber-700' }, { v: 'critical', l: 'Critical', c: 'bg-rose-100 text-rose-700' }]

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function getDateRange(preset: string, customDay: string, from: string, to: string): { from: string; to: string } {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today': return { from: ymd(start), to: ymd(start) }
    case 'yesterday': { const y = new Date(start); y.setDate(y.getDate() - 1); return { from: ymd(y), to: ymd(y) } }
    case 'week': { const w = new Date(start); w.setDate(w.getDate() - 6); return { from: ymd(w), to: ymd(start) } }
    case 'month': { const m = new Date(now.getFullYear(), now.getMonth(), 1); return { from: ymd(m), to: ymd(start) } }
    case 'year': { const y = new Date(now.getFullYear(), 0, 1); return { from: ymd(y), to: ymd(start) } }
    case 'custom_day': return { from: customDay, to: customDay }
    case 'custom': return { from, to }
    default: return { from: '', to: '' }
  }
}
function defaultForm() {
  return { ward_id: '', shift: 'morning', handover_date: new Date().toISOString().slice(0, 10), handover_to_ids: [] as string[], general_notes: '', voice_notes: {} as Record<string, string> }
}
function loadDraft(): any { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null } catch { return null } }
function escapeHtml(value?: any): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export default function NurseHandover() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'shifts' | 'patients'>('shifts')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wards, setWards] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})

  const [wardFilter, setWardFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [customDay, setCustomDay] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const dateRange = getDateRange(datePreset, customDay, customFrom, customTo)

  const [detail, setDetail] = useState<any | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Create form — restored from the logged-in user's draft, auto-saved on change.
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<any>(() => loadDraft()?.form || defaultForm())
  const [wardPatients, setWardPatients] = useState<any[]>([])
  const [selected, setSelected] = useState<Record<string, any>>(() => loadDraft()?.selected || {})
  const [saving, setSaving] = useState(false)
  const [nurseSearch, setNurseSearch] = useState('')

  // Patient handovers tab
  const [notes, setNotes] = useState<any[]>([])
  const [noteTotal, setNoteTotal] = useState(0)
  const [notePage, setNotePage] = useState(1)
  const [noteLoading, setNoteLoading] = useState(false)
  const noteReqRef = useRef(0)
  const [noteSearch, setNoteSearch] = useState('')
  const [notePreset, setNotePreset] = useState('all')
  const [noteDay, setNoteDay] = useState('')
  const [noteDetail, setNoteDetail] = useState<any | null>(null)
  const noteRange = getDateRange(notePreset, noteDay, '', '')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const notePages = Math.max(1, Math.ceil(noteTotal / LIMIT))
  const nurses = staff.filter((s: any) => s.role === 'Nurse')

  // Auto-save the draft (tied to the logged-in user) as the nurse types.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, selected })) } catch {}
  }, [form, selected])

  async function load() {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      p.append('page', String(page)); p.append('limit', String(LIMIT))
      if (wardFilter) p.append('ward_id', wardFilter)
      if (shiftFilter) p.append('shift', shiftFilter)
      if (statusFilter) p.append('status', statusFilter)
      if (search) p.append('search', search)
      if (dateRange.from) p.append('date_from', dateRange.from)
      if (dateRange.to) p.append('date_to', dateRange.to)
      const r = await api.get(`/handovers?${p.toString()}`)
      setRows(r.data?.rows || []); setTotal(r.data?.total || 0)
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load handovers.'); setRows([]); setTotal(0) } finally { setLoading(false) }
  }
  async function loadRefs() {
    try { const r = await api.get('/wards'); setWards(r.data || []) } catch {}
    try { const r = await api.get('/staff'); setStaff((r.data || []).filter((s: any) => s.status === 'active')) } catch {}
    try { const r = await api.get(`/handovers/stats?staff_id=${currentUser?.id || ''}`); setStats(r.data || {}) } catch {}
  }
  async function loadNotes() {
    const reqId = ++noteReqRef.current
    setNoteLoading(true)
    try {
      const p = new URLSearchParams()
      p.append('note_type', 'handover'); p.append('page', String(notePage)); p.append('limit', String(LIMIT))
      if (noteSearch) p.append('search', noteSearch)
      if (noteRange.from) p.append('date_from', noteRange.from)
      if (noteRange.to) p.append('date_to', noteRange.to)
      const r = await api.get(`/nurse-notes?${p.toString()}`)
      if (reqId !== noteReqRef.current) return // ignore stale responses
      const rows = Array.isArray(r.data) ? r.data : (r.data?.rows || [])
      setNotes(rows)
      setNoteTotal(Array.isArray(r.data) ? rows.length : (r.data?.total || 0))
    } catch {
      // Keep the previously loaded list rather than blanking it.
    } finally {
      if (reqId === noteReqRef.current) setNoteLoading(false)
    }
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, wardFilter, shiftFilter, statusFilter, search, dateRange.from, dateRange.to])
  useEffect(() => {
    if (tab !== 'patients') return
    const t = setTimeout(() => { loadNotes() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, notePage, noteSearch, noteRange.from, noteRange.to])

  async function loadWardPatients(wardId: string) {
    if (!wardId) { setWardPatients([]); return }
    try { const r = await api.get(`/handovers/ward-patients?ward_id=${wardId}`); setWardPatients(r.data || []) } catch { setWardPatients([]) }
  }
  function openCreate() { setShowCreate(true); setError(''); if (form.ward_id) loadWardPatients(form.ward_id) }
  function toggleNurse(id: string) {
    setForm((f: any) => {
      const cur: string[] = f.handover_to_ids || []
      return { ...f, handover_to_ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }
  function togglePatient(p: any, include: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      if (include) next[p.patient_id] = { patient_id: p.patient_id, admission_id: p.admission_id, priority: 'routine', flags: [], situation: '', background: '', assessment: '', recommendation: '', pending_tasks: '', contingency: '', notes: '', voice_notes: {}, _name: p.full_name, _bed: p.bed_number, _ward: p.ward_name }
      else delete next[p.patient_id]
      return next
    })
  }
  function updateSel(pid: string, k: string, v: any) { setSelected((prev) => ({ ...prev, [pid]: { ...prev[pid], [k]: v } })) }
  function toggleFlag(pid: string, flag: string) {
    setSelected((prev) => {
      const cur: string[] = prev[pid]?.flags || []
      const flags = cur.includes(flag) ? cur.filter((f) => f !== flag) : [...cur, flag]
      return { ...prev, [pid]: { ...prev[pid], flags } }
    })
  }

  async function submitCreate() {
    if (!form.ward_id) { setError('Select a ward.'); return }
    const patients = Object.values(selected)
    if (patients.length === 0) { setError('Select at least one patient for the handover.'); return }
    setSaving(true); setError('')
    try {
      await api.post('/handovers', {
        ...form, handover_from: currentUser?.id, created_by: currentUser?.id, actor_role: role,
        handover_to: form.handover_to_ids || [],
        patients: patients.map((p: any) => ({ ...p, _name: undefined, _bed: undefined, _ward: undefined })),
      })
      // Clear the draft once submitted.
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      setForm(defaultForm()); setSelected({}); setWardPatients([]); setShowCreate(false)
      await load(); await loadRefs()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to create handover.') } finally { setSaving(false) }
  }

  async function openDetail(h: any) { try { const r = await api.get(`/handovers/${h.id}`); setDetail(r.data) } catch { setDetail(h) } }
  async function acknowledge(h: any) {
    setBusyId(h.id); setError('')
    try { await api.post(`/handovers/${h.id}/acknowledge`, { acknowledged_by: currentUser?.id, actor_role: role }); setDetail(null); await load(); await loadRefs() }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to acknowledge.') } finally { setBusyId(null) }
  }
  async function acknowledgePatient(hp: any) {
    setBusyId(hp.id); setError('')
    try {
      await api.post(`/handovers/${detail.id}/patients/${hp.id}/acknowledge`, { acknowledged_by: currentUser?.id, actor_role: role })
      const r = await api.get(`/handovers/${detail.id}`); setDetail(r.data)
      await load(); await loadRefs()
    }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to acknowledge.') } finally { setBusyId(null) }
  }

  function printHandover() {
    if (!detail) return
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    const clinic = getClinicInfo()
    const header = [
      clinic?.hospital_name ? `<div class="hospital">${escapeHtml(clinic.hospital_name)}</div>` : '',
      clinic?.address ? `<div class="muted">${escapeHtml(clinic.address)}</div>` : '',
      clinic?.phone_number ? `<div class="muted">Tel: ${escapeHtml(clinic.phone_number)}</div>` : '',
    ].join('')
    const fields: [string, string][] = [
      ['situation', 'Situation'], ['background', 'Background'], ['assessment', 'Assessment'],
      ['recommendation', 'Recommendation'], ['pending_tasks', 'Pending tasks'], ['contingency', 'If…then (contingency)'],
    ]
    const pats = (detail.patients || []).map((p: any) => `
      <div class="card">
        <div class="pname">${escapeHtml(p.full_name)} <span class="muted">${escapeHtml(p.hospital_number || '')} · Bed ${escapeHtml(p.bed_number || '—')} · ${escapeHtml(p.priority || '')}</span></div>
        ${(p.flags || []).length ? `<div class="flags">Flags: ${(p.flags || []).map(escapeHtml).join(', ')}</div>` : ''}
        ${fields.map(([k, l]) => p[k] ? `<div class="field"><div class="lbl">${l}</div><div class="val">${escapeHtml(p[k])}</div></div>` : '').join('')}
        ${p.notes ? `<div class="field"><div class="lbl">Additional notes</div><div class="val">${escapeHtml(p.notes)}</div></div>` : ''}
      </div>`).join('')
    win.document.write(`<html><head><title>Shift Handover</title><style>
      body{font-family:Arial;font-size:12px;padding:16px;color:#1e293b}
      .header{text-align:center;border-bottom:2px solid #334155;padding-bottom:8px;margin-bottom:10px}
      .hospital{font-size:17px;font-weight:700}.muted{color:#64748b;font-size:11px}
      h1{font-size:14px;text-transform:uppercase;letter-spacing:1px;text-align:center}
      table.meta{width:100%;border-collapse:collapse;margin-bottom:10px}table.meta td{border:1px solid #cbd5e1;padding:5px 8px}.label{color:#64748b;width:22%}
      .card{border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin-bottom:10px}
      .pname{font-weight:700;margin-bottom:4px}.flags{color:#b45309;font-size:11px;margin-bottom:6px}
      .field{border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;margin-top:4px}
      .lbl{color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.4px}.val{white-space:pre-wrap}
      .foot{margin-top:14px;color:#94a3b8;font-size:9px;display:flex;justify-content:space-between}
    </style></head><body>
      <div class="header">${header || '<div class="hospital">Hospital</div>'}</div>
      <h1>Nursing Shift Handover</h1>
      <table class="meta">
        <tr><td class="label">Ward</td><td>${escapeHtml(detail.ward_name || '—')}</td><td class="label">Shift</td><td>${escapeHtml(detail.shift || '')}</td></tr>
        <tr><td class="label">Date</td><td>${escapeHtml((detail.handover_date || '').slice(0, 10))}</td><td class="label">Status</td><td>${escapeHtml(detail.status || '')}</td></tr>
        <tr><td class="label">From</td><td>${escapeHtml(detail.from_name || '—')}</td><td class="label">To</td><td>${escapeHtml((detail.recipients || []).map((r: any) => r.name).join(', ') || detail.to_name || '—')}</td></tr>
        <tr><td class="label">Created</td><td colspan="3">${escapeHtml(detail.created_at ? new Date(detail.created_at).toLocaleString() : '—')}</td></tr>
      </table>
      ${detail.general_notes ? `<div class="card"><div class="lbl">General / situational notes</div><div class="val">${escapeHtml(detail.general_notes)}</div></div>` : ''}
      ${pats || '<p class="muted">No patients</p>'}
      <div class="foot"><span>Printed ${escapeHtml(new Date().toLocaleString())}</span><span>${escapeHtml(clinic?.hospital_name || '')}</span></div>
    </body></html>`)
    win.document.close(); setTimeout(() => { try { win.print() } catch {} }, 300)
  }

  const statusBadge = (s: string) => s === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
  const pri = (v: string) => PRIORITIES.find((p) => p.v === v) || PRIORITIES[0]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><ClipboardList size={22} className="text-teal-600" /></div>
          <div><h1 className="text-xl font-bold text-slate-800">Nursing Handover</h1><p className="text-sm text-slate-500">Shift handovers by ward and per-patient handover notes.</p></div>
        </div>
        {canCreate && <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90"><Plus size={15} /> New Handover</button>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-amber-600">{stats.pending_for_me ?? 0}</p><p className="text-xs text-slate-400">Awaiting my acknowledgment</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-slate-800">{stats.pending_total ?? 0}</p><p className="text-xs text-slate-400">Pending total</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-emerald-600">{stats.acknowledged_total ?? 0}</p><p className="text-xs text-slate-400">Acknowledged</p></div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('shifts')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'shifts' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ClipboardList size={14} /> Shift Handovers</button>
        <button onClick={() => setTab('patients')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'patients' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FileText size={14} /> Patient Handovers</button>
      </div>

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">{error}</div>}

      {tab === 'shifts' ? (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search ward, nurse or notes..."
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-primary" />
            </div>
            <select value={wardFilter} onChange={(e) => { setWardFilter(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="">All Wards</option>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select value={shiftFilter} onChange={(e) => { setShiftFilter(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="">All Shifts</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option>
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="">All Status</option><option value="pending">Pending</option><option value="acknowledged">Acknowledged</option>
            </select>
            <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="all">All Time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom_day">Custom Day</option><option value="custom">Custom Range</option>
            </select>
            {datePreset === 'custom_day' && <input type="date" value={customDay} onChange={(e) => { setCustomDay(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" />}
            {datePreset === 'custom' && (<>
              <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="From" />
              <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="To" />
            </>)}
            <span className="text-xs text-slate-400 ml-auto">{total} handover{total !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center"><ClipboardList size={44} className="text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-400">No handovers match your filters.</p></div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-5 py-3">Date</th><th className="px-5 py-3">Ward</th><th className="px-5 py-3">Shift</th>
                      <th className="px-5 py-3">From → To</th><th className="px-5 py-3">Patients</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(h)}>
                        <td className="px-5 py-3 text-xs text-slate-500">{(h.handover_date || '').slice(0, 10)}{h.created_at && <p className="text-[10px] text-slate-400">created {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</td>
                        <td className="px-5 py-3 text-slate-700">{h.ward_name || '—'}</td>
                        <td className="px-5 py-3 capitalize text-slate-600">{h.shift}</td>
                        <td className="px-5 py-3 text-xs text-slate-600">{h.from_name || '—'} → <strong>{(h.recipients || []).map((r: any) => r.name).join(', ') || h.to_name || '—'}</strong></td>
                        <td className="px-5 py-3 text-xs text-slate-500">{h.acknowledged_count}/{h.patient_count} received</td>
                        <td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusBadge(h.status)}`}>{h.status}</span></td>
                        <td className="px-5 py-3 text-right">
                          {h.status === 'pending' && canAck && (role === 'Admin' || (h.recipients || []).some((r: any) => r.staff_id === currentUser?.id)) ? (
                            <button onClick={(ev) => { ev.stopPropagation(); acknowledge(h) }} disabled={busyId === h.id} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">{busyId === h.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Acknowledge</button>
                          ) : (
                            <button onClick={(ev) => { ev.stopPropagation(); openDetail(h) }} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">View</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={13} /> Prev</button>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={noteSearch} onChange={(e) => { setNoteSearch(e.target.value); setNotePage(1) }} placeholder="Search patient or note..."
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-primary" />
            </div>
            <select value={notePreset} onChange={(e) => { setNotePreset(e.target.value); setNotePage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="all">All Time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom_day">Custom Day</option>
            </select>
            {notePreset === 'custom_day' && <input type="date" value={noteDay} onChange={(e) => { setNoteDay(e.target.value); setNotePage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" />}
            <span className="text-xs text-slate-400 ml-auto">{noteTotal} note{noteTotal !== 1 ? 's' : ''}</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {noteLoading && notes.length === 0 ? (
              <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-primary" /></div>
            ) : notes.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">No per-patient handover notes.</p> : (
              <div className="divide-y divide-slate-50">
                {notes.map((n) => (
                  <div key={n.id} onClick={() => setNoteDetail(n)} className="w-full px-5 py-4 hover:bg-slate-50 hover:border-l-2 hover:border-l-primary transition-colors cursor-pointer">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-800 flex items-center gap-1"><User size={13} /> {n.patient_name || '—'} <span className="text-xs text-slate-400 font-mono">{n.hospital_number || ''}</span></p>
                      <div className="flex items-center gap-2">
                        {n.priority && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${n.priority === 'critical' ? 'bg-rose-100 text-rose-700' : n.priority === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{n.priority}</span>}
                        <span className="text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString()}{n.staff_name ? ` · ${n.staff_name}` : ''}</span>
                        <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Eye size={12} /> View</span>
                      </div>
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {n.situation
                        ? <ReadMore text={n.situation} limit={300} className="text-sm text-slate-600" />
                        : <ReadMore text={(n.content || '').replace(/^\[Shift handover[^\]]*\]\n?/, '')} limit={300} className="text-sm text-slate-600" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {notePages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Page {notePage} of {notePages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setNotePage((p) => Math.max(1, p - 1))} disabled={notePage <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={13} /> Prev</button>
                  <button onClick={() => setNotePage((p) => Math.min(notePages, p + 1))} disabled={notePage >= notePages} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={13} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl mx-4 max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><ClipboardList size={17} className="text-teal-500" /> New Shift Handover</h2>
                <p className="text-[11px] text-slate-400">Draft auto-saves as you type (per logged-in user) and clears on submit.</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Ward<Req /></label>
                  <select value={form.ward_id} onChange={(e) => { setForm((f: any) => ({ ...f, ward_id: e.target.value })); loadWardPatients(e.target.value) }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none">
                    <option value="">Select ward...</option>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Shift</label>
                  <select value={form.shift} onChange={(e) => setForm((f: any) => ({ ...f, shift: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none">
                    <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                  <input type="date" value={form.handover_date} onChange={(e) => setForm((f: any) => ({ ...f, handover_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-500">Incoming Nurses ({(form.handover_to_ids || []).length} selected)</label>
                  {(form.handover_to_ids || []).length > 0 && <button type="button" onClick={() => setForm((f: any) => ({ ...f, handover_to_ids: [] }))} className="text-[11px] text-rose-500 font-medium">Clear all</button>}
                </div>
                {(form.handover_to_ids || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {(form.handover_to_ids || []).map((id: string) => {
                      const n = nurses.find((x: any) => x.id === id)
                      return n ? <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-medium">{n.name}<button type="button" onClick={() => toggleNurse(id)} className="hover:text-rose-600"><X size={10} /></button></span> : null
                    })}
                  </div>
                )}
                <input value={nurseSearch} onChange={(e) => setNurseSearch(e.target.value)} placeholder="Search nurse..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mb-1" />
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-50">
                  {nurses.filter((n) => n.name?.toLowerCase().includes(nurseSearch.toLowerCase())).map((n) => (
                    <label key={n.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={(form.handover_to_ids || []).includes(n.id)} onChange={() => toggleNurse(n.id)} className="rounded border-slate-300" />
                      <span className="text-xs text-slate-700">{n.name}</span>
                    </label>
                  ))}
                  {nurses.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-400">No nurses available.</p>}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-500">General / Situational Notes</label>
                  <VoiceTextInput value={form.general_notes || ''} onChange={(v) => setForm((f: any) => ({ ...f, general_notes: v }))} textareaId="handover-general-notes" title="Dictate general notes" />
                </div>
                <textarea id="handover-general-notes" rows={3} value={form.general_notes} onChange={(e) => setForm((f: any) => ({ ...f, general_notes: e.target.value }))} placeholder="Ward acuity, staffing, bed status, incidents, equipment issues, outstanding ward tasks..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary resize-y" />
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Patients ({Object.keys(selected).length} selected)</h3>
                {!form.ward_id ? <p className="text-xs text-slate-400">Select a ward to list its inpatients.</p> : wardPatients.length === 0 ? <p className="text-xs text-slate-400">No active inpatients in this ward.</p> : (
                  <div className="space-y-2">
                    {wardPatients.map((p) => {
                      const sel = selected[p.patient_id]
                      return (
                        <div key={p.patient_id} className={`rounded-xl border ${sel ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200'}`}>
                          <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                            <input type="checkbox" checked={!!sel} onChange={(e) => togglePatient(p, e.target.checked)} className="rounded border-slate-300" />
                            <span className="text-sm font-medium text-slate-800">{p.full_name}</span>
                            <span className="text-xs text-slate-400 font-mono">{p.hospital_number}</span>
                            <span className="text-xs text-slate-400 ml-auto">Bed {p.bed_number || '—'} · {p.ward_name || ''}</span>
                          </label>
                          {sel && (
                            <div className="px-3 pb-3 space-y-2">
                              <div className="flex flex-wrap gap-2 items-center">
                                <select value={sel.priority} onChange={(e) => updateSel(p.patient_id, 'priority', e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none">
                                  {PRIORITIES.map((pr) => <option key={pr.v} value={pr.v}>{pr.l}</option>)}
                                </select>
                                <div className="flex flex-wrap gap-1">
                                  {FLAG_OPTIONS.map((f) => (
                                    <button key={f} type="button" onClick={() => toggleFlag(p.patient_id, f)} className={`px-2 py-1 rounded-full text-[10px] font-medium border ${sel.flags.includes(f) ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}>{f}</button>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {([['situation', 'Situation:'], ['background', 'Background:'], ['assessment', 'Assessment:'], ['recommendation', 'Recommendation:'], ['pending_tasks', 'Pending tasks:'], ['contingency', 'If…then (contingency):']] as const).map(([k, label]) => (
                                  <div key={k}>
                                    <div className="flex items-center justify-between mb-1">
                                      <label className="text-xs font-medium text-slate-600">{label}</label>
                                      <VoiceTextInput value={sel[k] || ''} onChange={(v) => updateSel(p.patient_id, k, v)} textareaId={`ho-${p.patient_id}-${k}`} title={`Dictate ${label.replace(':', '').toLowerCase()}`} />
                                    </div>
                                    <textarea id={`ho-${p.patient_id}-${k}`} rows={2} value={sel[k]} onChange={(e) => updateSel(p.patient_id, k, e.target.value)} placeholder={label.replace(':', '')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none resize-y" />
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium text-slate-600">Additional notes:</label>
                                  <VoiceTextInput value={sel.notes || ''} onChange={(v) => updateSel(p.patient_id, 'notes', v)} textareaId={`ho-${p.patient_id}-notes`} title="Dictate additional notes" />
                                </div>
                                <textarea id={`ho-${p.patient_id}-notes`} rows={2} value={sel.notes} onChange={(e) => updateSel(p.patient_id, 'notes', e.target.value)} placeholder="Additional notes" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none resize-y" />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowCreate(false)} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={submitCreate} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />} Create Handover</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h2 className="text-base font-semibold text-slate-800">Shift Handover</h2><p className="text-xs text-slate-400">{detail.ward_name} · {detail.shift} · {(detail.handover_date || '').slice(0, 10)}</p></div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>From: <strong className="text-slate-700">{detail.from_name || '—'}</strong></span>
                <span>To: <strong className="text-slate-700">{(detail.recipients || []).map((r: any) => r.name).join(', ') || detail.to_name || '—'}</strong></span>
                <span className={`px-2 py-0.5 rounded-full font-bold capitalize ${statusBadge(detail.status)}`}>{detail.status}</span>
                {detail.created_at && <span>Created {new Date(detail.created_at).toLocaleString()}</span>}
                {detail.acknowledged_at && <span>Acknowledged {new Date(detail.acknowledged_at).toLocaleString()}</span>}
              </div>
              {detail.general_notes && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">General / Situational</p><p className="text-slate-700 whitespace-pre-wrap">{detail.general_notes}</p></div>}
              <div className="space-y-3">
                {(detail.patients || []).map((p: any) => {
                  const pr = pri(p.priority)
                  return (
                    <div key={p.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-medium text-slate-800 flex items-center gap-1"><User size={13} /> {p.full_name} <span className="text-xs text-slate-400 font-mono">{p.hospital_number || ''}</span></p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pr.c}`}>{pr.l}</span>
                          {p.acknowledged_at
                            ? <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle size={11} /> Received</span>
                            : canAck && <button onClick={() => acknowledgePatient(p)} disabled={busyId === p.id} className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-50">Mark received</button>}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Bed {p.bed_number || '—'}{(p.flags || []).length ? ` · ${(p.flags || []).join(', ')}` : ''}</p>
                      <div className="mt-2 space-y-2">
                        {([['situation', 'Situation'], ['background', 'Background'], ['assessment', 'Assessment'], ['recommendation', 'Recommendation'], ['pending_tasks', 'Pending tasks'], ['contingency', 'If…then (contingency)']] as const).map(([k, label]) => p[k] ? (
                          <div key={k} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                            <ReadMore text={p[k]} limit={300} className="text-sm text-slate-700" />
                          </div>
                        ) : null)}
                      </div>
                      {p.notes && <p className="text-xs text-slate-500 mt-1">{p.notes}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
              <button onClick={printHandover} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50"><Printer size={14} /> Print</button>
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Close</button>
              {detail.status === 'pending' && canAck && (role === 'Admin' || (detail.recipients || []).some((r: any) => r.staff_id === currentUser?.id)) && (
                <button onClick={() => acknowledge(detail)} disabled={busyId === detail.id} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{busyId === detail.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Acknowledge All</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Patient handover detail modal */}
      {noteDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setNoteDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg mx-4 max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h2 className="text-base font-semibold text-slate-800">Patient Handover Note</h2><p className="text-xs text-slate-400">{noteDetail.patient_name} · {noteDetail.hospital_number || ''}</p></div>
              <button onClick={() => setNoteDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Calendar size={12} /> {new Date(noteDetail.created_at).toLocaleString()}</span>
                <span>Recorded by <strong className="text-slate-700">{noteDetail.staff_name || '—'}</strong></span>
                <span className="capitalize px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{noteDetail.note_type}</span>
                {noteDetail.priority && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${noteDetail.priority === 'critical' ? 'bg-rose-100 text-rose-700' : noteDetail.priority === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{noteDetail.priority}</span>}
              </div>
              {(noteDetail.flags || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {noteDetail.flags.map((f: string) => <span key={f} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">{f}</span>)}
                </div>
              )}
              {(noteDetail.situation || noteDetail.background || noteDetail.assessment || noteDetail.recommendation || noteDetail.pending_tasks || noteDetail.contingency) ? (
                <div className="space-y-2">
                  {([['situation', 'Situation'], ['background', 'Background'], ['assessment', 'Assessment'], ['recommendation', 'Recommendation'], ['pending_tasks', 'Pending tasks'], ['contingency', 'If…then (contingency)']] as const).map(([k, label]) => noteDetail[k] ? (
                    <div key={k} className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                      <ReadMore text={noteDetail[k]} limit={300} className="text-sm text-slate-700" />
                    </div>
                  ) : null)}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <ReadMore text={noteDetail.content} limit={300} className="text-sm text-slate-700" />
                </div>
              )}
              {noteDetail.voice_notes && Object.keys(noteDetail.voice_notes).length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {Object.entries(noteDetail.voice_notes).map(([k, url]) => url ? (
                    <div key={k} className="text-[10px] text-slate-400"><span className="capitalize">{k.replace('_', ' ')}</span><audio controls src={String(url)} className="h-6 mt-0.5" /></div>
                  ) : null)}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setNoteDetail(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Close</button>
              <button onClick={() => navigate(`/patient/${noteDetail.patient_id}`)} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90"><ExternalLink size={14} /> Open Chart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Req() { return <span className="text-rose-500">*</span> }
