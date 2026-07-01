import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Clock, Activity, UserCheck, Stethoscope, LogOut, RefreshCw, FileText, Plus, X, Loader2, Bed, Home, Heart, ArrowLeft, Mic } from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient } from '../types/index'

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'in_triage', label: 'In Triage' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_consultation', label: 'In Consultation' },
  { value: 'discharged', label: 'Discharged' },
]

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  checked_in: { label: 'Checked In', bg: 'bg-blue-100', text: 'text-blue-700' },
  in_triage: { label: 'In Triage', bg: 'bg-amber-100', text: 'text-amber-700' },
  waiting: { label: 'Waiting', bg: 'bg-purple-100', text: 'text-purple-700' },
  in_consultation: { label: 'In Consultation', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  discharged: { label: 'Discharged', bg: 'bg-slate-100', text: 'text-slate-600' },
}

function BloodTypeBadge({ type }: { type?: string }) {
  if (!type) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
      {type}
    </span>
  )
}

function Loader() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-slate-400 font-medium">Loading patients...</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
        <Activity className="w-7 h-7 text-red-400" />
      </div>
      <p className="text-sm text-slate-500 max-w-xs text-center">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  )
}

function EmptyState({ search, status }: { search: string; status: string }) {
  const hasFilters = search || status
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Users className="w-7 h-7 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">
        {hasFilters ? 'No patients match your filters' : 'No patients registered yet'}
      </p>
      {hasFilters && (
        <p className="text-xs text-slate-400">Try adjusting your search or filter</p>
      )}
    </div>
  )
}

function VoiceInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const preSpeechValue = useRef('')
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  function toggle() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    if (!SpeechRecognition) { alert('Voice input is not supported in your browser. Try Chrome.'); return }
    preSpeechValue.current = value
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true
    rec.onresult = (event: any) => {
      let t = ''
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      onChange(preSpeechValue.current + (preSpeechValue.current && t ? ' ' : '') + t)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }
  return (
    <button type="button" onClick={toggle}
      className={`p-1.5 rounded-lg transition-colors ${listening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
      title={listening ? 'Stop recording' : 'Start voice input'}>
      <Mic size={14} />
    </button>
  )
}

export default function MyPatients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [admissionMap, setAdmissionMap] = useState<Record<string, { id: string; ward_name: string; admitted_at: string; admitted_by_name?: string; bed_number?: string }>>({})
  const [wards, setWards] = useState<{ id: string; name: string }[]>([])
  const [admitModal, setAdmitModal] = useState<{ patientId: string; patientName: string } | null>(null)
  const [selectedWard, setSelectedWard] = useState('')
  const [admitting, setAdmitting] = useState(false)
  const [vitalsPatient, setVitalsPatient] = useState<any | null>(null)
  const [vitalsForm, setVitalsForm] = useState({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' })
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false)

  const doctorId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
  const currentRole: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()
  const isNurse = currentRole === 'Nurse'

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = tab === 'mine' && doctorId ? `?doctor_id=${doctorId}` : ''
      const { data } = await api.get<Patient[]>(`/patients${params}`)
      setPatients(data.filter(function(p: any) { return p.folder_activated !== false }))
      const admRes = await api.get('/admissions?status=active').catch(() => ({ data: [] }))
      const map: Record<string, { id: string; ward_name: string; admitted_at: string; admitted_by_name?: string; bed_number?: string }> = {}
      ;(admRes.data || []).forEach((a: any) => {
        map[a.patient_id] = { id: a.id, ward_name: a.ward_name, admitted_at: a.admitted_at, admitted_by_name: a.admitted_by_name, bed_number: a.bed_number }
      })
      setAdmissionMap(map)
    } catch {
      setError('Failed to load patients. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [tab, doctorId])

  useEffect(() => {
    api.get('/wards').then((r) => setWards(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  const filtered = patients.filter((p) => {
    const matchesSearch = p.full_name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: patients.length,
    checked_in: patients.filter((p) => p.status === 'checked_in').length,
    in_triage: patients.filter((p) => p.status === 'in_triage').length,
    in_consultation: patients.filter((p) => p.status === 'in_consultation').length,
    admitted: Object.keys(admissionMap).length,
  }

  const handleStatusUpdate = async (patientId: string, status: string) => {
    setActionLoading(patientId)
    try {
      await api.put(`/patients/${patientId}`, { status })
      setPatients((prev) => prev.map((p) => (p.id === patientId ? { ...p, status } : p)))
    } catch { setError('Failed to update patient status.') } finally { setActionLoading(null) }
  }

  async function handleAdmit() {
    if (!admitModal || !selectedWard) return
    setAdmitting(true)
    try {
      const res = await api.post('/admissions', { patient_id: admitModal.patientId, ward_id: selectedWard, admitted_by: doctorId })
      setAdmissionMap((prev) => ({ ...prev, [admitModal.patientId]: { id: res.data.id, ward_name: res.data.ward_name, admitted_at: res.data.admitted_at } }))
      setAdmitModal(null)
      setSelectedWard('')
    } catch { setError('Failed to admit patient.') } finally { setAdmitting(false) }
  }

  async function handleDischarge(patientId: string, admissionId: string) {
    setActionLoading(patientId)
    try {
      await api.put(`/admissions/${admissionId}/discharge`, { discharged_by: doctorId })
      setAdmissionMap((prev) => { const n = { ...prev }; delete n[patientId]; return n })
    } catch { setError('Failed to discharge patient.') } finally { setActionLoading(null) }
  }

  async function handleVitalsSubmit() {
    if (!vitalsPatient) return
    setVitalsSubmitting(true)
    try {
      const currentUser = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {} return null })()
      const encRes = await api.post('/encounters', {
        patient_id: vitalsPatient.id, encounter_type: 'vitals', chief_complaint: vitalsForm.nursing_notes.slice(0, 200),
        staff_id: currentUser?.id,
      })
      await api.post('/vitals', {
        encounter_id: encRes.data.id,
        systolic_bp: vitalsForm.systolic_bp ? parseInt(vitalsForm.systolic_bp) : null,
        diastolic_bp: vitalsForm.diastolic_bp ? parseInt(vitalsForm.diastolic_bp) : null,
        pulse: vitalsForm.pulse ? parseInt(vitalsForm.pulse) : null,
        temperature: vitalsForm.temperature ? parseFloat(vitalsForm.temperature) : null,
        respiration_rate: vitalsForm.respiration_rate ? parseInt(vitalsForm.respiration_rate) : null,
        weight: vitalsForm.weight ? parseFloat(vitalsForm.weight) : null,
        spo2: vitalsForm.spo2 ? parseInt(vitalsForm.spo2) : null,
        height: vitalsForm.height ? parseFloat(vitalsForm.height) : null,
        fetal_heart_rate: vitalsForm.fetal_heart_rate ? parseInt(vitalsForm.fetal_heart_rate) : null,
        fetal_heart_sound: vitalsForm.fetal_heart_sound || null,
        recorded_by: currentUser?.id,
        triage_priority: vitalsForm.triage_priority,
        nursing_notes: vitalsForm.nursing_notes,
      })
      setVitalsPatient(null)
      setVitalsForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' })
      setError('')
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to save vitals') } finally { setVitalsSubmitting(false) }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patients</h1>
          <p className="text-sm text-slate-400">View and manage all registered patients</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button onClick={() => setTab('all')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'all' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}>All Patients</button>
        <button onClick={() => setTab('mine')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'mine' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}>My Patients</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <UserCheck className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Checked In</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.checked_in}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">In Triage</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.in_triage}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-emerald-500 mb-1">
            <Stethoscope className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Consultation</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.in_consultation}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-indigo-500 mb-1">
            <Home className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Admitted</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.admitted}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patients by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow appearance-none min-w-[160px]"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <Loader />}

      {error && !loading && <ErrorState message={error} onRetry={fetchPatients} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState search={search} status={statusFilter} />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((patient) => {
            const statCfg = statusConfig[patient.status] || { label: patient.status, bg: 'bg-slate-100', text: 'text-slate-600' }
            return (
              <div
                key={patient.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-800 truncate">
                      {patient.full_name}
                    </h3>
                    <p className="text-xs font-mono text-slate-400 truncate mt-0.5">
                      {patient.id}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      admissionMap[patient.id] ? 'bg-indigo-100 text-indigo-700' : statCfg.bg
                    } ${admissionMap[patient.id] ? '' : statCfg.text}`}
                  >
                    {admissionMap[patient.id] ? `Admitted (${admissionMap[patient.id].ward_name})` : statCfg.label}{patient.folder_activated === false && !admissionMap[patient.id] ? <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 text-[9px] font-medium">Unpaid</span> : null}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>DOB: {patient.dob ? patient.dob.slice(0, 10) : '—'}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>{patient.sex || '—'}</span>
                  <BloodTypeBadge type={patient.blood_type} />
                </div>

                {patient.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="text-slate-300">{patient.phone}</span>
                  </p>
                )}

                {admissionMap[patient.id] && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-indigo-600 bg-indigo-50 rounded-lg px-2.5 py-1.5 mb-1.5">
                    <div className="flex items-center gap-1"><Bed size={12} /><span className="font-medium">{admissionMap[patient.id].ward_name}</span>{admissionMap[patient.id].bed_number && <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold"><Bed size={9} />{admissionMap[patient.id].bed_number}</span>}</div>
                    <span className="text-indigo-300">·</span>
                    <span>Admitted {new Date(admissionMap[patient.id].admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {admissionMap[patient.id].admitted_by_name && (
                      <><span className="text-indigo-300">·</span><span>by {admissionMap[patient.id].admitted_by_name}</span></>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isNurse ? (
                    <>
                    <button onClick={() => { setVitalsPatient(patient); setVitalsForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' }) }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:scale-[1.01] transition-all duration-200 shadow-sm">
                      <Heart className="w-3.5 h-3.5" /> Vitals
                    </button>
                    
                    </>
                  ) : (
                    <button onClick={() => navigate(`/consultation/${patient.id}`)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:scale-[1.01] transition-all duration-200 shadow-sm">
                      <Stethoscope className="w-3.5 h-3.5" /> Consult
                    </button>
                  )}
                  <button onClick={() => navigate(`/patient/${patient.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all duration-200">
                    <FileText className="w-3.5 h-3.5" /> Chart
                  </button>

                  {!admissionMap[patient.id] && patient.status === 'in_triage' ? (
                    <button onClick={() => handleStatusUpdate(patient.id, 'waiting')} disabled={actionLoading === patient.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-all duration-200 disabled:opacity-50">
                      {actionLoading === patient.id ? <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                      Move to Waiting
                    </button>
                  ) : !admissionMap[patient.id] && patient.status !== 'discharged' && patient.status !== 'in_triage' ? (
                    <button onClick={() => handleStatusUpdate(patient.id, 'in_triage')} disabled={actionLoading === patient.id}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 disabled:opacity-50 ${
                        isNurse ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}>
                      {actionLoading === patient.id ? <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                      Send to Triage
                    </button>
                  ) : null}

                  {!isNurse && admissionMap[patient.id] ? (
                    <button onClick={() => handleDischarge(patient.id, admissionMap[patient.id].id)} disabled={actionLoading === patient.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 hover:bg-rose-100 transition-all duration-200 disabled:opacity-50">
                      {actionLoading === patient.id ? <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                      Discharge from Ward
                    </button>
                  ) : !isNurse && patient.status !== 'discharged' ? (
                    <button onClick={() => setAdmitModal({ patientId: patient.id, patientName: patient.full_name })}
                      className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 hover:bg-indigo-100 transition-all duration-200">
                      <Home className="w-3.5 h-3.5" /> Admit to Ward
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Admit Modal */}
      {admitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!admitting) setAdmitModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Home size={18} className="text-indigo-500" />
                Admit Patient
              </h2>
              <button onClick={() => { setAdmitModal(null); setSelectedWard('') }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-600 mb-1">Patient: <strong>{admitModal.patientName}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Select Ward</label>
                <select value={selectedWard} onChange={(e) => setSelectedWard(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">-- Choose ward --</option>
                  {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => { setAdmitModal(null); setSelectedWard('') }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdmit} disabled={admitting || !selectedWard}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50">
                {admitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Admit Patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vitals Entry Modal for Nurses */}
      {vitalsPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!vitalsSubmitting) setVitalsPatient(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Heart size={18} className="text-primary" /> Record Vitals — {vitalsPatient.full_name}</h2>
              <button onClick={() => setVitalsPatient(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Systolic BP', key: 'systolic_bp', placeholder: '120' },
                  { label: 'Diastolic BP', key: 'diastolic_bp', placeholder: '80' },
                  { label: 'Pulse', key: 'pulse', placeholder: '72 bpm' },
                  { label: 'Temperature', key: 'temperature', placeholder: '36.5 °C' },
                  { label: 'Resp. Rate', key: 'respiration_rate', placeholder: '16' },
                  { label: 'Weight', key: 'weight', placeholder: '70 kg' },
                  { label: 'SpO₂', key: 'spo2', placeholder: '98 %' },
                  { label: 'Height', key: 'height', placeholder: '175 cm' },
                  { label: 'FHR', key: 'fetal_heart_rate', placeholder: '140 bpm' },
                  { label: 'FH Sound', key: 'fetal_heart_sound', placeholder: 'Normal' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    <input type={f.key === 'fetal_heart_sound' ? 'text' : 'number'} step="any" placeholder={f.placeholder} value={(vitalsForm as any)[f.key]}
                      onChange={(e) => setVitalsForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                ))}
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Triage Priority</label>
                  <div className="flex gap-2">
                    {(['red', 'yellow', 'green'] as const).map((p) => (
                      <button key={p} onClick={() => setVitalsForm((prev) => ({ ...prev, triage_priority: p }))}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                          vitalsForm.triage_priority === p
                            ? p === 'red' ? 'bg-red-500 text-white' : p === 'yellow' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                        {p === 'red' ? 'Emergency' : p === 'yellow' ? 'Urgent' : 'Routine'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-2">
                  Nursing Notes
                  <VoiceInput value={vitalsForm.nursing_notes} onChange={(val) => setVitalsForm((p) => ({ ...p, nursing_notes: val }))} />
                </label>
                <textarea rows={3} placeholder="Chief complaint, observations..." value={vitalsForm.nursing_notes}
                  onChange={(e) => setVitalsForm((p) => ({ ...p, nursing_notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setVitalsPatient(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleVitalsSubmit} disabled={vitalsSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {vitalsSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />}
                {vitalsSubmitting ? 'Saving...' : 'Save Vitals'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
