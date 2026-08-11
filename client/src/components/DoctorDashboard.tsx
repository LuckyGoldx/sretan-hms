import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import type { Patient } from '../types'
import {
  Users, Search, Stethoscope, Pill, Beaker, Activity, Loader2,
  ChevronRight, Eye, Calendar, Shield
} from 'lucide-react'

export default function DoctorDashboard() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ total: 0, todayRx: 0, pendingLab: 0, inConsultation: 0, appointments: 0 })
  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [patRes, rxRes, labRes, aptRes] = await Promise.all([
          api.get('/patients').catch(() => ({ data: [] })),
          api.get('/prescriptions?status=pending').catch(() => ({ data: [] })),
          api.get('/lab-orders?status=ordered').catch(() => ({ data: [] })),
          api.get(`/appointments?status=scheduled${currentStaffId ? `&doctor_id=${currentStaffId}` : ''}`).catch(() => ({ data: [] })),
        ])
        const pats = patRes.data || []
        setPatients(pats)
        setStats({
          total: pats.length,
          todayRx: (rxRes.data || []).length,
          pendingLab: (labRes.data || []).length,
          inConsultation: pats.filter((p: Patient) => p.status === 'with_doctor').length,
          appointments: (aptRes.data || []).length,
        })
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Stethoscope size={22} className="text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Doctor Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of patients, prescriptions, and orders</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Patients', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', route: '/patients' },
          { label: 'Pending Rx', value: stats.todayRx, icon: Pill, color: 'text-violet-600', bg: 'bg-violet-100', route: '/my-prescriptions' },
          { label: 'Pending Lab', value: stats.pendingLab, icon: Beaker, color: 'text-amber-600', bg: 'bg-amber-100', route: '/lab' },
          { label: 'Appointments', value: stats.appointments, icon: Calendar, color: 'text-sky-600', bg: 'bg-sky-100', route: '/appointments' },
          { label: 'In Consultation', value: stats.inConsultation, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-100', route: '/patients' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <button key={s.label} onClick={() => navigate(s.route)}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-left hover:shadow-md transition-all group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}><Icon size={24} className={s.color} /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 ml-auto transition-colors" />
              </div>
            </button>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => navigate('/patients')}
          className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 text-left hover:bg-blue-100 transition-colors">
          <Users size={20} className="text-blue-600" />
          <div><p className="text-sm font-medium text-slate-800">Patients</p><p className="text-xs text-slate-500">Full patient list</p></div>
        </button>
        <button onClick={() => navigate('/lab')}
          className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-left hover:bg-amber-100 transition-colors">
          <Beaker size={20} className="text-amber-600" />
          <div><p className="text-sm font-medium text-slate-800">Lab Results</p><p className="text-xs text-slate-500">Review test results</p></div>
        </button>
        <button onClick={() => navigate('/my-prescriptions')}
          className="flex items-center gap-3 p-4 rounded-xl bg-violet-50 border border-violet-100 text-left hover:bg-violet-100 transition-colors">
          <Pill size={20} className="text-violet-600" />
          <div><p className="text-sm font-medium text-slate-800">Prescriptions</p><p className="text-xs text-slate-500">View and manage</p></div>
        </button>
      </div>

      {/* Patient Queue */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-800">Patient Queue</h2>
          </div>
          <button onClick={() => navigate('/patients')} className="text-xs text-blue-600 font-medium hover:underline">View All</button>
        </div>
        <div className="px-5 py-3 border-b border-slate-50">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search patients..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-400">
            <Users size={32} className="text-slate-300 mb-2" />
            <p className="text-sm">No patients found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.slice(0, 10).map((patient) => (
              <div key={patient.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                    {patient.full_name}
                    {patient.primary_provider && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                        <Shield size={10} /> {patient.primary_provider}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">{patient.sex} &middot; {patient.dob?.slice(0, 10) || '—'} &middot; {patient.phone || '—'}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    patient.status === 'checked_in' ? 'bg-blue-100 text-blue-700' :
                    patient.status === 'in_triage' ? 'bg-yellow-100 text-yellow-700' :
                    patient.status === 'with_doctor' ? 'bg-purple-100 text-purple-700' :
                    patient.status === 'discharged' ? 'bg-green-100 text-green-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{patient.status.replace('_', ' ')}</span>
                  <button onClick={() => navigate(`/consultation/${patient.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors flex items-center gap-1">
                    <Eye size={12} /> Consult
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
