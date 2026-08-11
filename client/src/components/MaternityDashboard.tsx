import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Baby, Users, Calendar, Stethoscope, Heart, Loader2, UserPlus, Activity,
  AlertTriangle, ChevronRight, TrendingUp, ListChecks, BabyIcon, Shield
} from 'lucide-react'

function daysUntil(date: string): number {
  if (!date) return 999
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export default function MaternityDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setRole(JSON.parse(u).role || '') } catch {}
    async function load() {
      try {
        const res = await fetch('/api/maternity-patients/stats', {
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
        })
        const data = await res.json()
        setStats(data)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  const isRecords = role === 'Records'

  function StatCard({ icon, label, value, color, bg, onClick }: { icon: React.ReactNode; label: string; value: string | number; color: string; bg: string; onClick?: () => void }) {
    const content = (
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
          <p className="text-xs text-slate-400">{label}</p>
        </div>
      </div>
    )
    if (onClick) {
      return <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 w-full text-left hover:shadow-md transition-shadow cursor-pointer">{content}</button>
    }
    return <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">{content}</div>
  }

  function ActionCard({ label, desc, icon, color, bg, onClick }: { label: string; desc: string; icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
    return (
      <button onClick={onClick}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-slate-300 transition-all text-left group">
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>{icon}</div>
        <p className="text-sm font-semibold text-slate-800 group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xs text-slate-400 mt-1">{desc}</p>
      </button>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center"><Baby size={22} className="text-pink-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Maternity Dashboard</h1>
          <p className="text-sm text-slate-500">Pregnancy, delivery, and postnatal care overview</p>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard icon={<Baby size={18} className="text-blue-600" />} label="Active Pregnancies" value={stats.active_pregnancies} color="blue" bg="bg-blue-100" />
          <StatCard icon={<Activity size={18} className="text-emerald-600" />} label="Deliveries Today" value={stats.deliveries_today} color="emerald" bg="bg-emerald-100" />
          <StatCard icon={<TrendingUp size={18} className="text-indigo-600" />} label="Deliveries This Month" value={stats.deliveries_this_month} color="indigo" bg="bg-indigo-100" />
          <StatCard icon={<Calendar size={18} className="text-amber-600" />} label="Due This Week" value={stats.due_this_week} color="amber" bg="bg-amber-100" onClick={() => navigate('/maternity/patients?filter=due_this_week')} />
          <StatCard icon={<AlertTriangle size={18} className="text-rose-600" />} label="Overdue ANC" value={stats.overdue_anc} color="rose" bg="bg-rose-100" onClick={() => navigate('/maternity/patients?filter=overdue_anc')} />
          <StatCard icon={<Heart size={18} className="text-red-600" />} label="High Risk" value={stats.high_risk_pregnancies} color="red" bg="bg-red-100" />
          <StatCard icon={<ListChecks size={18} className="text-purple-600" />} label="Total Deliveries" value={stats.total_deliveries} color="purple" bg="bg-purple-100" />
        </div>
      )}

      {/* Main Content: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Due This Week */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-800">Due This Week</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{stats?.due_this_week || 0}</span>
              </div>
              <button onClick={() => navigate('/maternity/patients')} className="text-xs text-primary font-medium hover:underline">View all</button>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {stats?.due_this_week_list?.length > 0 ? stats.due_this_week_list.map((p: any) => {
                const days = daysUntil(p.edd)
                return (
                  <button key={p.id} onClick={() => navigate(`/maternity/patients/${p.id}`)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                        {p.full_name}
                        {p.primary_provider && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                            <Shield size={10} /> {p.primary_provider}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{p.hospital_number} · EDD: {p.edd?.slice(0, 10)}</p>
                    </div>
                    <span className={`ml-3 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                      days < 0 ? 'bg-red-100 text-red-700' : days <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>{days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}</span>
                  </button>
                )
              }) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
                  None due this week
                </div>
              )}
            </div>
          </div>

          {/* Overdue ANC */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-500" />
                <h2 className="text-sm font-semibold text-slate-800">Overdue ANC</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{stats?.overdue_anc || 0}</span>
              </div>
              <button onClick={() => navigate('/maternity/anc')} className="text-xs text-primary font-medium hover:underline">Record visit</button>
            </div>
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {stats?.overdue_anc_list?.length > 0 ? stats.overdue_anc_list.map((p: any) => (
                <button key={p.id} onClick={() => navigate(`/maternity/patients/${p.id}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                      {p.full_name}
                      {p.primary_provider && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                          <Shield size={10} /> {p.primary_provider}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{p.hospital_number} · Last: {p.last_appointment?.slice(0, 10) || 'Never'}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 flex-shrink-0 ml-2" />
                </button>
              )) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  <AlertTriangle size={24} className="mx-auto mb-2 text-slate-300" />
                  No overdue ANC visits
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middle Column: Recent Deliveries */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-800">Recent Deliveries</h2>
              </div>
              <button onClick={() => navigate('/maternity/labour-summary')} className="text-xs text-primary font-medium hover:underline">View all</button>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {stats?.recent_deliveries?.length > 0 ? stats.recent_deliveries.map((d: any, i: number) => (
                <button key={i} onClick={() => navigate(`/maternity/patients/${d.maternity_patient_id}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                      {d.full_name}
                      {d.primary_provider && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                          <Shield size={10} /> {d.primary_provider}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {d.delivery_date?.slice(0, 10)} · {d.delivery_type || '—'} · {d.outcome || '—'}
                    </p>
                  </div>
                  <span className={`ml-3 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                    d.delivery_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>{d.delivery_status}</span>
                </button>
              )) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  <Activity size={24} className="mx-auto mb-2 text-slate-300" />
                  No deliveries recorded
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Stethoscope size={16} className="text-slate-500" /> Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => navigate('/maternity/patients')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <Users size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">Patients</span>
              </button>
              <button onClick={() => navigate('/maternity/booking')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <UserPlus size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">Book</span>
              </button>
              <button onClick={() => navigate('/maternity/anc')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <Calendar size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">ANC</span>
              </button>
              <button onClick={() => navigate('/maternity/labour')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <BabyIcon size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">Labour</span>
              </button>
              <button onClick={() => navigate('/maternity/labour-summary')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <ListChecks size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">Summary</span>
              </button>
              <button onClick={() => navigate('/maternity/postnatal')}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary transition-colors">
                <Heart size={18} className="text-slate-500" />
                <span className="text-[10px] font-medium text-slate-600">Postnatal</span>
              </button>
            </div>
          </div>

          {/* Patient Stats Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-slate-500" /> At a Glance</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Active pregnancies</span>
                <span className="text-sm font-bold text-slate-800">{stats?.active_pregnancies ?? 0}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, ((stats?.active_pregnancies || 0) / Math.max(1, stats?.active_pregnancies + stats?.total_deliveries)) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">High risk</span>
                <span className="text-sm font-bold text-rose-600">{stats?.high_risk_pregnancies ?? 0}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, ((stats?.high_risk_pregnancies || 0) / Math.max(1, stats?.active_pregnancies || 1)) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Deliveries this month</span>
                <span className="text-sm font-bold text-slate-800">{stats?.deliveries_this_month ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Overdue ANC</span>
                <span className="text-sm font-bold text-amber-600">{stats?.overdue_anc ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
