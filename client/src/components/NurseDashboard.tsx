import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Heart, Stethoscope, Activity, Home, ClipboardList, Pill, Users, Calendar, Bed,
  Clock, AlertTriangle, ArrowRight, RefreshCw, Loader2, CheckCircle, Baby, ShieldCheck,
} from 'lucide-react'

const currentUser: { id: string | null; name: string | null } = (() => {
  try {
    const raw = localStorage.getItem('sretan_user')
    if (raw) { const u = JSON.parse(raw); return { id: u.id || null, name: u.name || null } }
  } catch {}
  return { id: null, name: null }
})()

function hoursSince(date?: string | null): number | null {
  if (!date) return null
  const t = new Date(date).getTime()
  if (isNaN(t)) return null
  return (Date.now() - t) / 3600000
}

function dayCount(from?: string | null): number {
  if (!from) return 1
  const t = new Date(from).getTime()
  if (isNaN(t)) return 1
  return Math.max(1, Math.ceil((Date.now() - t) / 86400000))
}

// Functional Health Patterns status for a ward-roster row: a missing baseline
// or a reassessment older than 12h is "due".
function fhpStatus(row: any): { label: string; cls: string; due: boolean } {
  if (!row || !row.baseline_at) return { label: 'Baseline due', cls: 'bg-rose-100 text-rose-700', due: true }
  const h = hoursSince(row.last_assessed_at)
  if (h == null || h >= 12) return { label: 'Reassess due', cls: 'bg-amber-100 text-amber-700', due: true }
  if ((row.concerns || 0) > 0) return { label: `${row.concerns} concern${row.concerns === 1 ? '' : 's'}`, cls: 'bg-orange-100 text-orange-700', due: false }
  return { label: 'Up to date', cls: 'bg-emerald-100 text-emerald-700', due: false }
}

export default function NurseDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [counts, setCounts] = useState<any>({})
  const [patients, setPatients] = useState<any[]>([])
  const [admissions, setAdmissions] = useState<any[]>([])
  const [wardPatients, setWardPatients] = useState<any[]>([])
  const [doses, setDoses] = useState<any[]>([])
  const [handoversToMe, setHandoversToMe] = useState<any[]>([])
  const [fhp, setFhp] = useState<any[]>([])
  const [givingDoseId, setGivingDoseId] = useState<string | null>(null)

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true); else setRefreshing(true)
    const staff = currentUser.id || ''
    const [countsRes, patientsRes, admRes, wardRes, dosesRes, handoverRes, hStatsRes, fhpRes] = await Promise.all([
      api.get('/dashboard/sidebar-counts', { params: { staff_id: staff } }).catch(() => ({ data: {} })),
      api.get('/patients').catch(() => ({ data: [] })),
      api.get('/admissions/active').catch(() => ({ data: [] })),
      api.get('/handovers/ward-patients').catch(() => ({ data: [] })),
      api.get('/nurse-dashboard/doses', { params: { limit: 8 } }).catch(() => ({ data: [] })),
      api.get('/handovers', { params: { handover_to: staff, status: 'pending' } }).catch(() => ({ data: [] })),
      api.get('/handovers/stats', { params: { staff_id: staff } }).catch(() => ({ data: {} })),
      api.get('/nurse-dashboard/fhp').catch(() => ({ data: [] })),
    ])
    setCounts({ ...(countsRes.data || {}), ...(hStatsRes.data || {}) })
    setPatients(Array.isArray(patientsRes.data) ? patientsRes.data : [])
    setAdmissions(Array.isArray(admRes.data) ? admRes.data : [])
    setWardPatients(Array.isArray(wardRes.data) ? wardRes.data : [])
    setDoses(Array.isArray(dosesRes.data) ? dosesRes.data : [])
    setHandoversToMe(Array.isArray(handoverRes.data) ? handoverRes.data : [])
    setFhp(Array.isArray(fhpRes.data) ? fhpRes.data : [])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(false), 60000)
    return () => clearInterval(t)
  }, [load])

  const vitalsByPatient = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const w of wardPatients) if (w.patient_id && !m.has(w.patient_id)) m.set(w.patient_id, w.last_vitals_at || null)
    return m
  }, [wardPatients])

  const fhpByAdmission = useMemo(() => {
    const m = new Map<string, any>()
    for (const f of fhp) m.set(f.admission_id, f)
    return m
  }, [fhp])

  const fhpDueCount = useMemo(
    () => admissions.filter((a) => fhpStatus(fhpByAdmission.get(a.id)).due).length,
    [admissions, fhpByAdmission]
  )
  const fhpLanding = useMemo(() => {
    const first = admissions.find((a) => fhpStatus(fhpByAdmission.get(a.id)).due)
    return first ? `/patient/${first.patient_id}?tab=fhp` : '/admissions'
  }, [admissions, fhpByAdmission])

  const statusCounts = useMemo(() => ({
    checked_in: patients.filter((p) => p.status === 'checked_in').length,
    in_triage: patients.filter((p) => p.status === 'in_triage').length,
    waiting: patients.filter((p) => p.status === 'waiting').length,
    with_doctor: patients.filter((p) => p.status === 'with_doctor').length,
  }), [patients])

  const triageQueue = useMemo(
    () => patients.filter((p) => ['checked_in', 'in_triage'].includes(p.status)).slice(0, 6),
    [patients]
  )

  async function giveDose(id: string) {
    setGivingDoseId(id)
    try {
      await api.put(`/treatment-doses/${id}/administer`, { administered_by: currentUser.id })
      setDoses((prev) => prev.filter((d) => d.id !== id))
    } catch {} finally { setGivingDoseId(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 size={32} className="animate-spin" />
      </div>
    )
  }

  const kpis = [
    { label: 'Admitted Patients', value: admissions.length, icon: Bed, color: 'text-indigo-600', bg: 'bg-indigo-100', to: '/admissions' },
    { label: 'Awaiting Triage', value: statusCounts.checked_in + statusCounts.in_triage, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-100', to: '/triage' },
    { label: 'Waiting Queue', value: statusCounts.waiting, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', to: '/patients' },
    { label: 'In Consultation', value: statusCounts.with_doctor, icon: Stethoscope, color: 'text-violet-600', bg: 'bg-violet-100', to: '/patients' },
    { label: 'Drug Round Due', value: doses.length, icon: Pill, color: 'text-rose-600', bg: 'bg-rose-100', to: '/patients' },
    { label: 'Handovers To Me', value: counts.pending_for_me ?? counts.pending_handovers ?? 0, icon: ClipboardList, color: 'text-teal-600', bg: 'bg-teal-100', to: '/nurse/handover' },
    { label: 'Assessments Due', value: fhpDueCount, icon: ClipboardList, color: 'text-fuchsia-600', bg: 'bg-fuchsia-100', to: fhpLanding },
  ]

  const quickActions = [
    { label: 'Triage', icon: Stethoscope, to: '/triage', color: 'bg-amber-100 text-amber-700' },
    { label: 'Vitals', icon: Heart, to: '/vitals', color: 'bg-rose-100 text-rose-700' },
    { label: 'Admissions', icon: Home, to: '/admissions', color: 'bg-indigo-100 text-indigo-700' },
    { label: 'Handover', icon: ClipboardList, to: '/nurse/handover', color: 'bg-teal-100 text-teal-700' },
    { label: 'Patients', icon: Users, to: '/patients', color: 'bg-blue-100 text-blue-700' },
    { label: 'Maternity', icon: Baby, to: '/maternity', color: 'bg-pink-100 text-pink-700' },
    { label: 'Appointments', icon: Calendar, to: '/appointments', color: 'bg-emerald-100 text-emerald-700' },
    { label: 'Assessments', icon: ClipboardList, to: fhpLanding, color: 'bg-fuchsia-100 text-fuchsia-700' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center">
            <Heart size={24} className="text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Nursing Station</h1>
            <p className="text-sm text-slate-500">Welcome{currentUser.name ? `, ${currentUser.name}` : ''} · live ward overview</p>
          </div>
        </div>
        <button onClick={() => load(false)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <button key={k.label} onClick={() => navigate(k.to)}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-left hover:shadow-md hover:border-slate-200 transition-all">
              <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={k.color} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </button>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {quickActions.map((a) => {
            const Icon = a.icon
            return (
              <button key={a.label} onClick={() => navigate(a.to)}
                className="flex flex-col items-center gap-2 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors">
                <span className={`w-9 h-9 rounded-lg ${a.color} flex items-center justify-center`}><Icon size={18} /></span>
                <span className="text-[11px] font-medium text-slate-600">{a.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Ward roster */}
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Bed size={16} className="text-indigo-500" /> Ward Roster</h2>
            <button onClick={() => navigate('/admissions')} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">Manage <ArrowRight size={12} /></button>
          </div>
          {admissions.length === 0 ? (
            <div className="py-14 text-center text-slate-400 text-sm">No admitted patients.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 font-medium">Patient</th>
                    <th className="px-5 py-3 font-medium">Ward / Bed</th>
                    <th className="px-5 py-3 font-medium">Days</th>
                    <th className="px-5 py-3 font-medium">Vitals</th>
                    <th className="px-5 py-3 font-medium">Patterns</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {admissions.slice(0, 12).map((a) => {
                    const h = hoursSince(vitalsByPatient.get(a.patient_id))
                    const vitals = h == null
                      ? { label: 'No vitals', cls: 'bg-rose-100 text-rose-700' }
                      : h >= 24 ? { label: `${Math.floor(h)}h ago`, cls: 'bg-rose-100 text-rose-700' }
                      : h >= 12 ? { label: `${Math.floor(h)}h ago`, cls: 'bg-amber-100 text-amber-700' }
                      : { label: `${Math.floor(h)}h ago`, cls: 'bg-emerald-100 text-emerald-700' }
                    const pat = fhpStatus(fhpByAdmission.get(a.id))
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <button onClick={() => navigate(`/patient/${a.patient_id}`)} className="font-medium text-slate-800 hover:text-primary text-left">{a.patient_name}</button>
                          <p className="text-[11px] text-slate-400 font-mono">{a.hospital_number}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-slate-700">{a.ward_name}</span>
                          {a.bed_number && <span className="ml-2 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold">{a.bed_number}</span>}
                          {a.discharge_requested_at && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">Pending clearance</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{dayCount(a.admitted_at)}d</td>
                        <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${vitals.cls}`}>{vitals.label}</span></td>
                        <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${pat.cls}`}>{pat.label}</span></td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <button onClick={() => navigate(`/patient/${a.patient_id}?tab=fhp`)}
                            className="px-3 py-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-600 text-xs font-medium hover:bg-fuchsia-100 mr-1.5">Assess</button>
                          <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100">Vitals</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Drug round */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Pill size={16} className="text-rose-500" /> Drug Round</h2>
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{doses.length} due</span>
          </div>
          <div className="divide-y divide-slate-50 max-h-[380px] overflow-y-auto">
            {doses.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <CheckCircle size={26} className="text-emerald-400" /> No doses due
              </div>
            ) : doses.map((d) => (
              <div key={d.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{d.patient_name}</p>
                  <p className="text-xs text-slate-500 truncate">{d.treatment}{d.dosage ? ` · ${d.dosage}` : ''}{d.route ? ` · ${d.route}` : ''}</p>
                  <p className="text-[11px] text-slate-400">{d.scheduled_time || 'No time set'}</p>
                </div>
                <button onClick={() => giveDose(d.id)} disabled={givingDoseId === d.id}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60 flex items-center gap-1">
                  {givingDoseId === d.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Give
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Handover inbox */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ClipboardList size={16} className="text-teal-500" /> Handovers Awaiting Me</h2>
            <button onClick={() => navigate('/nurse/handover')} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">Open <ArrowRight size={12} /></button>
          </div>
          <div className="divide-y divide-slate-50">
            {handoversToMe.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <ShieldCheck size={26} className="text-emerald-400" /> Nothing to acknowledge
              </div>
            ) : handoversToMe.slice(0, 5).map((h) => (
              <button key={h.id} onClick={() => navigate('/nurse/handover')} className="w-full text-left px-5 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{h.ward_name || 'Ward'} · {h.shift || 'shift'}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">{h.patient_count || 0} patients</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">From {h.from_name || '—'} · {h.handover_date ? new Date(h.handover_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Triage queue */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Activity size={16} className="text-amber-500" /> Triage Queue</h2>
            <button onClick={() => navigate('/triage')} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">Open <ArrowRight size={12} /></button>
          </div>
          <div className="divide-y divide-slate-50">
            {triageQueue.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <CheckCircle size={26} className="text-emerald-400" /> Triage queue clear
              </div>
            ) : triageQueue.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => navigate(`/patient/${p.id}`)} className="text-sm font-medium text-slate-800 hover:text-primary truncate text-left">{p.full_name}</button>
                  <p className="text-[11px] text-slate-400 font-mono">{p.hospital_number || p.id?.slice(0, 8)} · {p.sex}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.status === 'in_triage' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  {p.status === 'in_triage' ? 'In Triage' : 'Checked In'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {Number(counts.pending_clearance || 0) > 0 && (
        <button onClick={() => navigate('/admissions')}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800"><AlertTriangle size={16} /> {counts.pending_clearance} admission(s) awaiting discharge clearance</span>
          <ArrowRight size={16} className="text-amber-700" />
        </button>
      )}
    </div>
  )
}
