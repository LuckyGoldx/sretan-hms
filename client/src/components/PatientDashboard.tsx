import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import type { Patient } from '../types/index'
import DoctorDashboard from './DoctorDashboard'
import {
  Search, Users, MoreHorizontal, Eye, Activity, LogOut, Loader2,
  UserPlus, Stethoscope, Clock, CheckCircle, Pill, AlertTriangle,
  Package, Banknote, FlaskConical, ClipboardList, Truck, Calendar, Home, Shield
} from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'in_triage', label: 'In Triage' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'with_doctor', label: 'In Consultation' },
  { value: 'discharged', label: 'Discharged' },
] as const

const STATUS_BADGE: Record<string, string> = {
  checked_in: 'bg-blue-100 text-blue-700',
  in_triage: 'bg-yellow-100 text-yellow-700',
  waiting: 'bg-orange-100 text-orange-700',
  with_doctor: 'bg-purple-100 text-purple-700',
  discharged: 'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  checked_in: 'Checked In',
  in_triage: 'In Triage',
  waiting: 'Waiting',
  with_doctor: 'In Consultation',
  discharged: 'Discharged',
}

function getRole(): string | null {
  try { const s = localStorage.getItem('sretan_user'); if (s) return JSON.parse(s).role } catch {}
  return null
}

export default function PatientDashboard() {
  const navigate = useNavigate()
  const role = getRole()

  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pendingRx, setPendingRx] = useState(0)

  useEffect(() => {
    if (role === 'Pharmacist') {
      api.get('/prescriptions?status=pending').then((r) => setPendingRx(r.data?.length || 0)).catch(() => {})
    }
  }, [role])

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<Patient[]>('/patients')
      setPatients(data || [])
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load patients')
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = patients.filter((p) => {
    const matchSearch = p.full_name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total: patients.length,
    checked_in: patients.filter((p) => p.status === 'checked_in').length,
    in_triage: patients.filter((p) => p.status === 'in_triage').length,
    with_doctor: patients.filter((p) => p.status === 'with_doctor').length,
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.put(`/patients/${id}`, { status })
      setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
      setOpenMenuId(null)
    } catch {}
  }

  function formatDate(d: string) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 size={32} className="animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center">
          <Users size={28} className="text-rose-500" />
        </div>
        <p className="text-sm text-rose-600 font-medium">{error}</p>
        <button onClick={fetchPatients} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          Retry
        </button>
      </div>
    )
  }

  if (role === 'Doctor') return <DoctorDashboard />

  const roleSpecificLinks: Record<string, { title: string; desc: string; icon: any; route: string }[]> = {
    Pharmacist: [
      { title: 'Pharmacy Overview', desc: 'Stats and quick access', icon: Pill, route: '/pharmacy' },
      { title: 'Dispensing', desc: 'Fill pending prescriptions', icon: ClipboardList, route: '/dispensing' },
      { title: 'Pharmacy Inventory', desc: 'Manage stock levels', icon: Package, route: '/pharmacy-inventory' },
      { title: 'Expiry Monitor', desc: 'Track expiring items', icon: Clock, route: '/pharmacy-expiry' },
      { title: 'Purchase Orders', desc: 'Order stock from suppliers', icon: Truck, route: '/purchase-orders' },
      { title: 'Dispensing History', desc: 'Audit trail of dispensations', icon: ClipboardList, route: '/dispensing-history' },
    ],
    'Lab Scientist': [
      { title: 'Laboratory', desc: 'Manage lab orders and results', icon: FlaskConical, route: '/lab' },
    ],
    Paypoint: [
      { title: 'Paypoint', desc: 'Process payments', icon: Banknote, route: '/paypoint' },
    ],
    Nurse: [
      { title: 'Triage', desc: 'Vitals and patient assessment', icon: Stethoscope, route: '/triage' },
      { title: 'Register Patient', desc: 'Add new patient records', icon: UserPlus, route: '/patients/register' },
      { title: 'Patients', desc: 'View patient list', icon: Users, route: '/patients' },
      { title: 'Appointments', desc: 'Manage appointments', icon: Calendar, route: '/appointments' },
      { title: 'Admissions', desc: 'Manage ward admissions', icon: Home, route: '/admissions' },
      { title: 'Vitals History', desc: 'View patient vitals', icon: Activity, route: '/vitals' },
    ],
  }

  const links = roleSpecificLinks[role || ''] || null

  if (links) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users size={22} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Welcome, {role}</h1>
            <p className="text-sm text-slate-500">Select a module to get started</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((l) => {
            const Icon = l.icon
            return (
              <button key={l.title} onClick={() => navigate(l.route)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left hover:shadow-md hover:border-slate-300 transition-all group">
                <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                  <Icon size={22} className="text-blue-600" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800">{l.title}</h3>
                  {l.title === 'Dispensing' && pendingRx > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">{pendingRx}</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">{l.desc}</p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <Users size={22} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Patient Dashboard</h1>
          <p className="text-sm text-slate-500">Live patient queue and management</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'total', label: 'Total Patients', icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-100' },
          { key: 'checked_in', label: 'Checked In', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
          { key: 'in_triage', label: 'In Triage', icon: Activity, color: 'text-yellow-600', bg: 'bg-yellow-100' },
          { key: 'with_doctor', label: 'In Consultation', icon: Stethoscope, color: 'text-purple-600', bg: 'bg-purple-100' },
        ].map((s) => {
          const Icon = s.icon
          const count = stats[s.key as keyof typeof stats]
          return (
            <div key={s.key} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={24} className={s.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patients by name..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-48 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none cursor-pointer">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Users size={32} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No patients found</p>
              <p className="text-xs text-slate-400 mt-1">
                {search || statusFilter ? 'Try adjusting your search or filter' : 'Register a new patient to get started'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((patient) => (
                <div key={patient.id} className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 relative">
                  {role !== 'Records' && (
                    <div className="absolute top-4 right-4" ref={menuRef}>
                      <button onClick={() => setOpenMenuId(openMenuId === patient.id ? null : patient.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenuId === patient.id && (
                        <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-10">
                          <button onClick={() => { setOpenMenuId(null); navigate(`/consultation/${patient.id}`) }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                            <Eye size={15} className="text-slate-400" /> View Details
                          </button>
                          {patient.status !== 'in_triage' && patient.status !== 'discharged' && (
                            <button onClick={() => updateStatus(patient.id, 'in_triage')}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                              <Activity size={15} className="text-slate-400" /> Send to Triage
                            </button>
                          )}
                          {patient.status !== 'discharged' && (
                            <button onClick={() => updateStatus(patient.id, 'discharged')}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                              <LogOut size={15} className="text-slate-400" /> Discharge
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <h3 className="text-base font-bold text-slate-900 pr-8 truncate flex items-center gap-2">
                    {patient.full_name}
                    {patient.primary_provider && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                        <Shield size={10} /> {patient.primary_provider}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{patient.id}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">{formatDate(patient.dob)}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">{patient.sex}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">{patient.blood_type || '—'}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-3">{patient.phone || '—'}</p>
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold ${STATUS_BADGE[patient.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[patient.status] || patient.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
