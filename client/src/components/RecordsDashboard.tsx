import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Users, UserPlus, FileText, Clock, Calendar, Search, X, Loader2, ArrowRight, FileUp, Activity,
} from 'lucide-react'

export default function RecordsDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ total: 0, todayRegistrations: 0, checkedIn: 0, pendingRequests: 0 })
  const [recentPatients, setRecentPatients] = useState<any[]>([])
  const [recentRequests, setRecentRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [patRes, reqRes] = await Promise.all([
          api.get('/patients').catch(() => ({ data: [] })),
          api.get('/record-requests?status=pending').catch(() => ({ data: [] })),
        ])
        const patients = patRes.data || []
        const today = new Date().toISOString().slice(0, 10)
        setStats({
          total: patients.length,
          todayRegistrations: patients.filter((p: any) => p.created_at?.startsWith(today)).length,
          checkedIn: patients.filter((p: any) => p.status === 'checked_in').length,
          pendingRequests: (reqRes.data || []).length,
        })
        setRecentPatients(patients.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10))
        setRecentRequests((reqRes.data || []).slice(0, 5))
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get(`/patients/search?q=${encodeURIComponent(searchQuery)}`)
        setSearchResults(res.data || [])
      } catch {} finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Records Dashboard</h1>
          <p className="text-sm text-slate-400">Patient registration, document management, and record requests</p>
        </div>
        <button onClick={() => navigate('/patients/register')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm">
          <UserPlus size={16} /> Register Patient
        </button>
      </div>

      {/* Quick Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search patients by name, hospital number, or phone..." value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-11 pr-10 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="absolute right-4 top-1/2 -translate-y-1/2"><X size={16} className="text-slate-400" /></button>
        )}
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 max-h-64 overflow-y-auto">
            {searchResults.map((p: any) => (
              <button key={p.id} onClick={() => navigate(`/records/documents/${p.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><UserPlus size={14} className="text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                  <p className="text-xs text-slate-400">{p.hospital_number} &middot; {p.sex} &middot; {p.dob?.slice(0, 10)}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{p.status?.replace('_', ' ')}</span>
              </button>
            ))}
          </div>
        )}
        {searching && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><Users size={18} className="text-primary" /><h3 className="text-sm font-semibold text-slate-700">Total Patients</h3></div>
          <p className="text-3xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><UserPlus size={18} className="text-emerald-500" /><h3 className="text-sm font-semibold text-slate-700">Today's Registrations</h3></div>
          <p className="text-3xl font-bold text-emerald-600">{stats.todayRegistrations}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><Activity size={18} className="text-amber-500" /><h3 className="text-sm font-semibold text-slate-700">Checked In</h3></div>
          <p className="text-3xl font-bold text-amber-600">{stats.checkedIn}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><FileText size={18} className="text-purple-500" /><h3 className="text-sm font-semibold text-slate-700">Pending Requests</h3></div>
          <p className="text-3xl font-bold text-purple-600">{stats.pendingRequests}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Registrations */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><UserPlus size={16} className="text-emerald-500" /> Recent Registrations</h3>
            <button onClick={() => navigate('/patients')} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">View All <ArrowRight size={12} /></button>
          </div>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No patients registered yet</p>
          ) : (
            <div className="space-y-1">
              {recentPatients.map((p: any) => (
                <button key={p.id} onClick={() => navigate(`/patient/${p.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                    <p className="text-xs text-slate-400">{p.hospital_number} &middot; {p.sex}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 ml-3">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pending Record Requests */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FileText size={16} className="text-purple-500" /> Pending Requests</h3>
            <button onClick={() => navigate('/records/requests')} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">Manage <ArrowRight size={12} /></button>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No pending record requests</p>
          ) : (
            <div className="space-y-1">
              {recentRequests.map((r: any) => (
                <button key={r.id} onClick={() => navigate('/records/requests')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.patient_name}</p>
                    <p className="text-xs text-slate-400">{r.requester_name} &middot; {r.purpose || 'No purpose specified'}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 ml-3">{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => navigate('/patients/register')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3"><UserPlus size={20} className="text-primary" /></div>
          <h3 className="text-sm font-semibold text-slate-700">Register Patient</h3>
          <p className="text-xs text-slate-400 mt-1">New patient intake and registration</p>
        </button>
        <button onClick={() => navigate('/patients')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3"><Users size={20} className="text-emerald-500" /></div>
          <h3 className="text-sm font-semibold text-slate-700">Patient List</h3>
          <p className="text-xs text-slate-400 mt-1">View and manage all patients</p>
        </button>
        <button onClick={() => navigate('/records/requests')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3"><FileText size={20} className="text-purple-500" /></div>
          <h3 className="text-sm font-semibold text-slate-700">Record Requests</h3>
          <p className="text-xs text-slate-400 mt-1">Medical record release requests</p>
        </button>
        <button onClick={() => navigate('/appointments')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3"><Calendar size={20} className="text-amber-500" /></div>
          <h3 className="text-sm font-semibold text-slate-700">Appointments</h3>
          <p className="text-xs text-slate-400 mt-1">Schedule and manage appointments</p>
        </button>
      </div>
    </div>
  )
}
