import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Baby, Search, Loader2, UserPlus, ArrowLeft, HeartPulse, CalendarCheck, AlertTriangle, PenLine } from 'lucide-react'

export default function MaternityPatientList() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [smartFilter, setSmartFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<any>({})
  const [role, setRole] = useState('')
  const limit = 25

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setRole(JSON.parse(u).role || '') } catch {}
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/maternity-patients/stats', {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setStats(data)
    } catch {}
  }

  async function fetchPatients() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statusFilter) params.append('status', statusFilter)
      if (smartFilter) params.append('smart_filter', smartFilter)
      params.append('page', String(page))
      params.append('limit', String(limit))
      const res = await fetch(`/api/maternity-patients?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setPatients(Array.isArray(data.rows) ? data.rows : [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const f = params.get('filter')
    if (f === 'due_this_week' || f === 'overdue_anc') setSmartFilter(f)
  }, [])

  useEffect(() => { fetchStats() }, [])
  useEffect(() => { fetchPatients() }, [statusFilter, smartFilter, page])

  function handleSearch() { setSmartFilter(''); setPage(1); fetchPatients() }

  const totalPages = Math.ceil(total / limit)

  function gestAgeFromLMP(lmp: string): { weeks: number; days: number; text: string } {
    if (!lmp) return { weeks: 0, days: 0, text: '—' }
    const ms = Date.now() - new Date(lmp).getTime()
    const weeks = Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)))
    const days = Math.max(0, Math.floor((ms % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000)))
    return { weeks, days, text: `${weeks}w ${days}d` }
  }

  function daysUntil(date: string): number {
    if (!date) return 999
    return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center"><Baby size={22} className="text-pink-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Maternity Patients</h1>
          <p className="text-sm text-slate-500">Manage pregnancy records</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center"><Baby size={18} className="text-pink-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.active_pregnancies ?? '—'}</p>
              <p className="text-xs text-slate-400">Active Pregnancies</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><HeartPulse size={18} className="text-emerald-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.deliveries_today ?? '—'}</p>
              <p className="text-xs text-slate-400">Deliveries Today</p>
            </div>
          </div>
        </div>
        <button onClick={() => { setSmartFilter(smartFilter === 'due_this_week' ? '' : 'due_this_week'); setPage(1); setStatusFilter('') }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left w-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><CalendarCheck size={18} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.due_this_week ?? '—'}</p>
              <p className="text-xs text-slate-400">Due This Week</p>
            </div>
          </div>
        </button>
        <button onClick={() => { setSmartFilter(smartFilter === 'overdue_anc' ? '' : 'overdue_anc'); setPage(1); setStatusFilter('') }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left w-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center"><AlertTriangle size={18} className="text-rose-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.overdue_anc ?? '—'}</p>
              <p className="text-xs text-slate-400">Overdue ANC</p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by name, hospital #, or phone..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <button onClick={() => { setSmartFilter(smartFilter === 'due_this_week' ? '' : 'due_this_week'); setPage(1); setStatusFilter('') }}
          className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${smartFilter === 'due_this_week' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'}`}>
          Due This Week
        </button>
        <button onClick={() => { setSmartFilter(smartFilter === 'overdue_anc' ? '' : 'overdue_anc'); setPage(1); setStatusFilter('') }}
          className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${smartFilter === 'overdue_anc' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-rose-50'}`}>
          Overdue ANC
        </button>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSmartFilter('') }}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="delivered">Delivered</option>
          <option value="transferred">Transferred</option>
          <option value="anc_lost">ANC Lost</option>
        </select>
        <button onClick={handleSearch}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Search</button>
        <span className="text-xs text-slate-400 ml-auto">{total} patient{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : patients.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Baby size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No maternity patients found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">EDD</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Gest. Age</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">G/P</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Risk</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Last Visit</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const isActive = p.status === 'active'
                  const ga = isActive && p.lmp ? gestAgeFromLMP(p.lmp) : null
                  const dueIn = daysUntil(p.edd)
                  const isOverdue = isActive && dueIn < 0
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800">{p.full_name}</p>
                          {p.pregnancy_number > 1 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">#{p.pregnancy_number}</span>}
                        </div>
                        <p className="text-xs text-slate-400">{p.hospital_number}</p>
                        {p.booking_code && <p className="text-[10px] font-mono text-primary">{p.booking_code}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {p.edd ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOverdue ? 'bg-red-100 text-red-700' : dueIn <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>{p.edd.slice(0, 10)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {ga ? (
                          <>
                            <span className={`text-xs font-medium ${isOverdue ? 'text-rose-600' : 'text-slate-600'}`}>{ga.text}</span>
                            {isOverdue && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">Overdue</span>}
                          </>
                        ) : p.status === 'delivered' ? (
                          <span className="text-xs text-emerald-600 font-medium">Delivered</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">G{p.gravida} P{p.para}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>{p.risk_level}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'active' ? 'bg-blue-100 text-blue-700' :
                          p.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.last_visit_date?.slice(0, 10) || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => navigate(`/maternity/patients/${p.id}`)}
                            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium">View</button>
                          {p.status === 'active' && (
                            <button onClick={() => navigate(`/consultation/${p.patient_id}?type=maternity`)}
                              className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-medium flex items-center gap-1"><PenLine size={11} /> Consult</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
