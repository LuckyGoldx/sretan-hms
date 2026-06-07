import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Clock, Activity, UserCheck, Stethoscope, LogOut, RefreshCw, FileText, Plus, X, Loader2, Home } from 'lucide-react'
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

function BloodTypeBadge({ type }: { type: string }) {
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

export default function MyPatients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [admissionMap, setAdmissionMap] = useState<Record<string, { id: string; ward_name: string; admitted_at: string; admitted_by_name?: string }>>({})
  const [wards, setWards] = useState<{ id: string; name: string }[]>([])
  const [admitModal, setAdmitModal] = useState<{ patientId: string; patientName: string } | null>(null)
  const [selectedWard, setSelectedWard] = useState('')
  const [admitting, setAdmitting] = useState(false)

  const doctorId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = tab === 'mine' && doctorId ? `?doctor_id=${doctorId}` : ''
      const { data } = await api.get<Patient[]>(`/patients${params}`)
      setPatients(data)
      const admRes = await api.get('/admissions?status=active').catch(() => ({ data: [] }))
      const map: Record<string, { id: string; ward_name: string; admitted_at: string; admitted_by_name?: string }> = {}
      ;(admRes.data || []).forEach((a: any) => {
        map[a.patient_id] = { id: a.id, ward_name: a.ward_name, admitted_at: a.admitted_at, admitted_by_name: a.admitted_by_name }
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
                    className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statCfg.bg} ${statCfg.text}`}
                  >
                    {statCfg.label}
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
                    <div className="flex items-center gap-1"><Home size={12} /><span className="font-medium">{admissionMap[patient.id].ward_name}</span></div>
                    <span className="text-indigo-300">·</span>
                    <span>Admitted {new Date(admissionMap[patient.id].admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {admissionMap[patient.id].admitted_by_name && (
                      <><span className="text-indigo-300">·</span><span>by {admissionMap[patient.id].admitted_by_name}</span></>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button onClick={() => navigate(`/consultation/${patient.id}`)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:scale-[1.01] transition-all duration-200 shadow-sm">
                    <Stethoscope className="w-3.5 h-3.5" /> Consult
                  </button>
                  <button onClick={() => navigate(`/patient/${patient.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all duration-200">
                    <FileText className="w-3.5 h-3.5" /> Chart
                  </button>

                  {patient.status !== 'in_triage' && patient.status !== 'discharged' && (
                    <button onClick={() => handleStatusUpdate(patient.id, 'in_triage')} disabled={actionLoading === patient.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 text-xs font-semibold rounded-xl border border-amber-200 hover:bg-amber-100 transition-all duration-200 disabled:opacity-50">
                      {actionLoading === patient.id ? <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                      Send to Triage
                    </button>
                  )}

                  {admissionMap[patient.id] ? (
                    <button onClick={() => handleDischarge(patient.id, admissionMap[patient.id].id)} disabled={actionLoading === patient.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 hover:bg-rose-100 transition-all duration-200 disabled:opacity-50">
                      {actionLoading === patient.id ? <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                      Discharge from Ward
                    </button>
                  ) : (
                    patient.status !== 'discharged' && (
                      <button onClick={() => setAdmitModal({ patientId: patient.id, patientName: patient.full_name })}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 hover:bg-indigo-100 transition-all duration-200">
                        <Home className="w-3.5 h-3.5" /> Admit to Ward
                      </button>
                    )
                  )}
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
    </div>
  )
}
