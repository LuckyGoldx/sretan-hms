import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Search, Activity, Stethoscope, Bed, Clock, Loader2, Eye,
  UserCheck, Heart, RefreshCw, FileText, Calendar, Zap, X, CheckCircle,
} from 'lucide-react'
import api from '../hooks/useAxios'
import Pagination from './Pagination'

const PER_PAGE = 30

interface VitalsModalState {
  patient: ActivePatient
  form: Record<string, string>
}

interface ActivePatient {
  id: string
  full_name: string
  hospital_number: string
  sex: string
  dob: string
  phone: string
  status: string
  primary_provider?: string
  last_vitals_at?: string | null
  last_vitals_by?: string | null
  last_consultation_at?: string | null
  last_consultation_by?: string | null
  admission_id?: string | null
  ward_name?: string | null
  bed_number?: string | null
  admitted_at?: string | null
  admitted_by_name?: string | null
  last_activity_at?: string | null
}

const SEGMENTS = [
  { key: '', label: 'All Active', icon: Users },
  { key: 'admitted', label: 'In Bed', icon: Bed },
  { key: 'with_doctor', label: 'With Doctor', icon: Stethoscope },
  { key: 'vitals_today', label: 'Vitals Today', icon: Activity },
  { key: 'consulted', label: 'Consulted Today', icon: Calendar },
  { key: 'waiting', label: 'Waiting', icon: Clock },
  { key: 'in_triage', label: 'In Triage', icon: UserCheck },
]

const SINCE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: '1h', label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
]

function formatTime(ts?: string | null): string {
  try {
    return new Date(ts || '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    checked_in: 'bg-blue-100 text-blue-700',
    in_triage: 'bg-amber-100 text-amber-700',
    waiting: 'bg-purple-100 text-purple-700',
    with_doctor: 'bg-indigo-100 text-indigo-700',
    discharged: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function ActivePatients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<ActivePatient[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('')
  const [since, setSince] = useState('')
  const [page, setPage] = useState(1)

  const currentUser = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {} return null })()
  const role = currentUser?.role || ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (segment) params.segment = segment
      if (since) params.since = since
      if (search) params.search = search
      const res = await api.get('/patients/active', { params }).catch(() => ({ data: [] }))
      const rows: ActivePatient[] = res.data || []
      // Defensive sort by newest activity (vitals or consultation)
      rows.sort((a, b) => {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
        return tb - ta
      })
      setPatients(rows)
      setPage(1)
    } catch {} finally { setLoading(false) }
  }, [segment, since, search])

  useEffect(() => { load() }, [load])

  // Segment counts are fetched independently so badges never reset or distort
  // when the user switches segments or applies search/since filters.
  const loadCounts = useCallback(async () => {
    try {
      const res = await api.get('/patients/active/counts').catch(() => ({ data: {} }))
      setCounts(res.data || {})
    } catch {}
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const totalPages = Math.max(1, Math.ceil(patients.length / PER_PAGE))
  const pageRows = patients.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const [dischargingId, setDischargingId] = useState<string | null>(null)

  const [vitalsModal, setVitalsModal] = useState<VitalsModalState | null>(null)
  const [vitalsSaving, setVitalsSaving] = useState(false)

  async function submitVitals() {
    if (!vitalsModal) return
    setVitalsSaving(true)
    try {
      const f = vitalsModal.form
      const currentUser = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {} return null })()
      const encRes = await api.post('/encounters', {
        patient_id: vitalsModal.patient.id, encounter_type: 'vitals', chief_complaint: f.nursing_notes?.slice(0, 200) || '',
        staff_id: currentUser?.id,
      })
      await api.post('/vitals', {
        encounter_id: encRes.data.id,
        recorded_by: currentUser?.id,
        systolic_bp: f.systolic_bp ? parseInt(f.systolic_bp) : null,
        diastolic_bp: f.diastolic_bp ? parseInt(f.diastolic_bp) : null,
        pulse: f.pulse ? parseInt(f.pulse) : null,
        temperature: f.temperature ? parseFloat(f.temperature) : null,
        respiration_rate: f.respiration_rate ? parseInt(f.respiration_rate) : null,
        weight: f.weight ? parseFloat(f.weight) : null,
        spo2: f.spo2 ? parseInt(f.spo2) : null,
        height: f.height ? parseFloat(f.height) : null,
        triage_priority: f.triage_priority || 'green',
        nursing_notes: f.nursing_notes || null,
      })
      setVitalsModal(null)
      load()
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to save vitals')
    } finally { setVitalsSaving(false) }
  }

  async function dischargePatient(p: ActivePatient) {
    if (!p.admission_id) return
    if (!window.confirm(`Discharge ${p.full_name} from ward?`)) return
    setDischargingId(p.id)
    try {
      await api.put(`/admissions/${p.admission_id}/discharge`, { discharged_by: currentUser?.id || null })
      // Remove from the list (no longer active admission)
      setPatients((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to discharge patient')
    } finally { setDischargingId(null) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {SEGMENTS.map((s) => {
            const Icon = s.icon
            const countKey = s.key === '' ? 'all_active' : s.key
            const count = counts[countKey]
            const showBadge = count !== undefined && count > 0
            return (
              <button
                key={s.key}
                onClick={() => { setSegment(s.key); setPage(1) }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  segment === s.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {s.label}
                {showBadge && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${segment === s.key ? 'bg-primary/10 text-primary' : 'bg-slate-200/70 text-slate-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto flex-wrap">
          <select
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SINCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, hospital #..."
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full sm:w-56"
            />
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={30} className="animate-spin text-primary" /></div>
      ) : patients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-14 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {segment === 'admitted' ? 'No patients are currently admitted to a ward' :
             segment === 'vitals_today' ? 'No vitals recorded for any active patient today' :
             segment === 'consulted' ? 'No patients were consulted by a doctor today' :
             segment === 'with_doctor' ? 'No patients are currently with a doctor' :
             segment === 'waiting' ? 'No patients are currently waiting' :
             segment === 'in_triage' ? 'No patients are currently in triage' :
             'No active patients match this view'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {segment ? 'Try a different segment or widen the time filter.' : 'Patients with recent vitals, consultations, or an active admission appear here.'}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pageRows.map((p) => {
            const isAdmitted = !!p.admission_id
            const vitalsAfterConsult = p.last_vitals_at && p.last_consultation_at && new Date(p.last_vitals_at) > new Date(p.last_consultation_at)
            return (
              <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all ${isAdmitted ? 'border-emerald-200' : 'border-slate-100'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isAdmitted ? 'bg-emerald-100' : 'bg-primary/10'}`}>
                    {isAdmitted ? <Bed className="w-5 h-5 text-emerald-600" /> : <Users className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-2">
                      {p.full_name}
                      {p.primary_provider && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                          <Heart size={10} /> {p.primary_provider}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{p.hospital_number} · {p.sex} · {p.dob?.slice(0, 10) || '—'}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>

                {/* Composite status chips */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {isAdmitted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                      <Bed className="w-3 h-3" /> In Bed — {p.ward_name}{p.bed_number ? ` · Bed ${p.bed_number}` : ''}
                    </span>
                  )}
                  {p.last_consultation_at && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                      <Stethoscope className="w-3 h-3" /> Consulted {formatTime(p.last_consultation_at)}{p.last_consultation_by ? ` by ${p.last_consultation_by}` : ''}
                    </span>
                  )}
                  {p.last_vitals_at && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold">
                      <Activity className="w-3 h-3" /> Vitals {formatTime(p.last_vitals_at)}{p.last_vitals_by ? ` by ${p.last_vitals_by}` : ''}
                    </span>
                  )}
                  {vitalsAfterConsult && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                      <Zap className="w-3 h-3" /> Awaiting doctor review
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => navigate(`/patient/${p.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100"
                  >
                    <Eye className="w-3 h-3" /> Chart
                  </button>
                  {(role === 'Doctor' || role === 'Consultant') && isAdmitted && (
                    <button
                      onClick={() => navigate(`/consultation/${p.id}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100"
                    >
                      <Stethoscope className="w-3 h-3" /> Consult
                    </button>
                  )}
                  {isAdmitted && (role === 'Doctor' || role === 'Admin') && (
                    <button
                      onClick={() => dischargePatient(p)}
                      disabled={dischargingId === p.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 disabled:opacity-50"
                    >
                      {dischargingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      Discharge from Ward
                    </button>
                  )}
                  {role === 'Nurse' && (
                    <button
                      onClick={() => setVitalsModal({ patient: p, form: { systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', triage_priority: 'green', nursing_notes: '' } })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-600 text-xs font-medium hover:bg-teal-100"
                    >
                      <Activity className="w-3 h-3" /> Record Vitals
                    </button>
                  )}
                  <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatTime(p.last_activity_at) || '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={patients.length} perPage={PER_PAGE} />
        </div>
        </>
      )}

      {/* Record Vitals Modal (Nurse) */}
      {vitalsModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { if (!vitalsSaving) setVitalsModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center"><Activity className="w-4 h-4 text-teal-600" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Record Vitals</h2>
                  <p className="text-xs text-slate-400">{vitalsModal.patient.full_name} · {vitalsModal.patient.hospital_number}</p>
                </div>
              </div>
              <button onClick={() => { if (!vitalsSaving) setVitalsModal(null) }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'systolic_bp', label: 'Systolic BP', placeholder: '120' },
                  { key: 'diastolic_bp', label: 'Diastolic BP', placeholder: '80' },
                  { key: 'pulse', label: 'Pulse', placeholder: '72 bpm' },
                  { key: 'temperature', label: 'Temperature', placeholder: '36.5 °C' },
                  { key: 'respiration_rate', label: 'Resp. Rate', placeholder: '16' },
                  { key: 'weight', label: 'Weight', placeholder: '70 kg' },
                  { key: 'spo2', label: 'SpO₂', placeholder: '98 %' },
                  { key: 'height', label: 'Height', placeholder: '175 cm' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    <input
                      value={vitalsModal.form[f.key]}
                      onChange={(e) => setVitalsModal((prev) => prev ? { ...prev, form: { ...prev.form, [f.key]: e.target.value } } : prev)}
                      placeholder={f.placeholder}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">Triage Priority</label>
                <select
                  value={vitalsModal.form.triage_priority}
                  onChange={(e) => setVitalsModal((prev) => prev ? { ...prev, form: { ...prev.form, triage_priority: e.target.value } } : prev)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="green">Routine</option>
                  <option value="yellow">Urgent</option>
                  <option value="red">Emergency</option>
                </select>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">Nursing Notes</label>
                <textarea
                  value={vitalsModal.form.nursing_notes}
                  onChange={(e) => setVitalsModal((prev) => prev ? { ...prev, form: { ...prev.form, nursing_notes: e.target.value } } : prev)}
                  rows={3}
                  placeholder="Notes..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <button onClick={() => setVitalsModal(null)} disabled={vitalsSaving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
              <button onClick={submitVitals} disabled={vitalsSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {vitalsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {vitalsSaving ? 'Saving...' : 'Save Vitals'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
