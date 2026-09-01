import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Users, Stethoscope, Loader2, Building2, Clock, Zap, AlertTriangle,
  CheckCircle, Eye, ArrowRight, Calendar, Pill, Beaker, Shield, Send, TrendingUp,
} from 'lucide-react'

interface ReferredPatient {
  patient_id: string
  hospital_number: string
  full_name: string
  sex: string
  referral_id: string
  referral_number: string
  priority: string
  referral_status: string
  reason: string
  referred_by_name: string
  referred_at: string
  accepted_by_name?: string | null
}

interface Stats { pending: number; accepted: number; in_consultation: number; completed: number; total: number }

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    accepted: 'bg-blue-100 text-blue-700',
    in_consultation: 'bg-violet-100 text-violet-700',
    completed: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function ConsultantDashboard() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<ReferredPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 })
  const [mySent, setMySent] = useState<any[]>([])

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
  const currentDept: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).department_name || null } catch {} return null })()

  const load = useCallback(async () => {
    try {
      const [queueRes, statsRes, sentRes] = await Promise.all([
        api.get('/consultants/referred-patients', { params: { staff_id: currentStaffId } }).catch(() => ({ data: [] })),
        api.get('/consultants/stats', { params: { staff_id: currentStaffId } }).catch(() => ({ data: { pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 } })),
        api.get('/referrals/dashboard', { params: { referred_by: currentStaffId || '' } }).catch(() => ({ data: [] })),
      ])
      setRecent((queueRes.data || []).slice(0, 5))
      setStats(statsRes.data || { pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 })
      setMySent(sentRes.data || [])
    } catch {} finally { setLoading(false) }
  }, [currentStaffId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  const emergencyPending = recent.filter((p) => p.priority === 'emergency' && p.referral_status === 'pending')

  const statCards = [
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Accepted', value: stats.accepted, icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'In Consultation', value: stats.in_consultation, icon: Stethoscope, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: 'Completed', value: stats.completed, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Total', value: stats.total, icon: Users, color: 'text-slate-600', bg: 'bg-slate-100' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Stethoscope size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Consultant Dashboard</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 flex-wrap">
              Welcome back
              {currentDept && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-medium">
                  <Building2 className="w-3 h-3" /> {currentDept}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/consultant/patients')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          <Users className="w-4 h-4" /> Referred Patients <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Emergency alert */}
      {emergencyPending.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-rose-700">
                {emergencyPending.length} emergency referral{emergencyPending.length !== 1 ? 's' : ''} awaiting action
              </p>
              <div className="mt-1.5 space-y-1">
                {emergencyPending.map((p) => (
                  <p key={p.referral_id} className="text-xs text-rose-600">
                    {p.full_name} ({p.hospital_number}) — {p.reason || 'No reason'}
                  </p>
                ))}
              </div>
            </div>
            <button
              onClick={() => navigate('/consultant/patients')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
            >
              <Eye className="w-3.5 h-3.5" /> Review Now
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.label}
              onClick={() => navigate('/consultant/patients')}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-left hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}><Icon size={18} className={s.color} /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => navigate('/consultant/patients')} className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-left hover:bg-indigo-100 transition-colors">
          <Users size={20} className="text-indigo-600" />
          <div><p className="text-sm font-medium text-slate-800">Referred Patients</p><p className="text-xs text-slate-500">Accept, consult and complete</p></div>
        </button>
        <button onClick={() => navigate('/consultant/my-consultations')} className="flex items-center gap-3 p-4 rounded-xl bg-violet-50 border border-violet-100 text-left hover:bg-violet-100 transition-colors">
          <Stethoscope size={20} className="text-violet-600" />
          <div><p className="text-sm font-medium text-slate-800">My Consultations</p><p className="text-xs text-slate-500">Your encounter history</p></div>
        </button>
        <button onClick={() => navigate('/doctor/results')} className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-left hover:bg-amber-100 transition-colors">
          <Beaker size={20} className="text-amber-600" />
          <div><p className="text-sm font-medium text-slate-800">Results</p><p className="text-xs text-slate-500">Lab & radiology results</p></div>
        </button>
        <button onClick={() => navigate('/my-prescriptions')} className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-left hover:bg-emerald-100 transition-colors">
          <Pill size={20} className="text-emerald-600" />
          <div><p className="text-sm font-medium text-slate-800">Prescriptions</p><p className="text-xs text-slate-500">View and manage</p></div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent referred patients */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-800">Recent Referred Patients</h2>
            </div>
            <button onClick={() => navigate('/consultant/patients')} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">View all</button>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No referred patients yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recent.map((p) => (
                <div key={p.referral_id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/60">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                    <p className="text-[11px] text-slate-400">{p.hospital_number} · {p.referred_by_name ? `by ${p.referred_by_name}` : ''}</p>
                  </div>
                  <PriorityBadge priority={p.priority} />
                  <StatusBadge status={p.referral_status} />
                  <button
                    onClick={() => navigate(`/consultant/consultation/${p.patient_id}?consultant=1&referral_id=${p.referral_id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My referrals sent */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Send size={18} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-800">Referrals I Sent</h2>
            </div>
            <button onClick={() => navigate('/referrals')} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Manage</button>
          </div>
          {mySent.length === 0 ? (
            <div className="py-12 text-center">
              <Send className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">You haven't referred any patients</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {mySent.slice(0, 5).map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/60">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.patient_name}</p>
                    <p className="text-[11px] text-slate-400">{r.to_department_name || '—'} · {r.referral_number}</p>
                  </div>
                  <PriorityBadge priority={r.priority} />
                  <StatusBadge status={r.status} />
                  <button onClick={() => navigate(`/patient/${r.patient_id}`)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100">
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
