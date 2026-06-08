import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Home, Loader2, Users, Clock, LogOut, Stethoscope, Search, X, CheckCircle, AlertTriangle, FileText,
  ChevronUp, ChevronDown
} from 'lucide-react'

const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

type SortField = 'ward_name' | 'admitted_at' | 'discharged_at' | 'patient_name'

export default function AdmissionsPage() {
  const navigate = useNavigate()
  const [activeAdmissions, setActiveAdmissions] = useState<any[]>([])
  const [allAdmissions, setAllAdmissions] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [search, setSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [dischargeModal, setDischargeModal] = useState<any | null>(null)
  const [discharging, setDischarging] = useState(false)
  const [sortField, setSortField] = useState<SortField>('admitted_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [wardFilter, setWardFilter] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customDay, setCustomDay] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [activeRes, wardsRes] = await Promise.all([
          api.get('/admissions/active').catch(() => ({ data: [] })),
          api.get('/wards').catch(() => ({ data: [] })),
        ])
        setActiveAdmissions(activeRes.data || [])
        setWards(wardsRes.data || [])
        const allRes = await api.get('/admissions').catch(() => ({ data: [] }))
        setAllAdmissions(allRes.data || [])
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  function getDateRange() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    switch (datePreset) {
      case 'today': {
        const s = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        return { from: s, to: s }
      }
      case 'yesterday': {
        const yd = new Date(now); yd.setDate(d-1)
        const s = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,'0')}-${String(yd.getDate()).padStart(2,'0')}`
        return { from: s, to: s }
      }
      case 'week': {
        const mon = new Date(now); mon.setDate(d - ((now.getDay() + 6) % 7))
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
        return {
          from: `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`,
          to: `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`
        }
      }
      case 'month':
        return { from: `${y}-${String(m+1).padStart(2,'0')}-01`, to: `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}` }
      case 'custom_day':
        return { from: customDay, to: customDay }
      case 'year':
        return { from: `${y}-01-01`, to: `${y}-12-31` }
      case 'custom':
        return { from: dateFrom, to: dateTo }
      default:
        return { from: '', to: '' }
    }
  }

  const dateRange = getDateRange()

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  function sortItems(items: any[]): any[] {
    return [...items].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortField === 'admitted_at' || sortField === 'discharged_at') {
        const aVal = a[sortField] ? new Date(a[sortField]).getTime() : 0
        const bVal = b[sortField] ? new Date(b[sortField]).getTime() : 0
        return (aVal - bVal) * dir
      }
      return ((a[sortField] || '').localeCompare(b[sortField] || '')) * dir
    })
  }

  async function handleDischarge() {
    if (!dischargeModal) return
    setDischarging(true)
    try {
      await api.put(`/admissions/${dischargeModal.id}/discharge`, { discharged_by: currentUserId })
      setActiveAdmissions((prev) => prev.filter((a) => a.id !== dischargeModal.id))
      setDischargeModal(null)
    } catch {} finally { setDischarging(false) }
  }

  const activeWardNames = [...new Set(activeAdmissions.map((a: any) => a.ward_name))]
  const historyWardNames = [...new Set(allAdmissions.filter((a: any) => a.status !== 'active').map((a: any) => a.ward_name))]
  const allAdmissionWardNames = [...new Set(allAdmissions.map((a: any) => a.ward_name))]

  const stats = {
    active: activeAdmissions.length,
    total: allAdmissions.length,
    wardsWithHistory: allAdmissionWardNames.length,
    byWard: allAdmissionWardNames.map((name: string) => ({
      name,
      count: activeAdmissions.filter((a: any) => a.ward_name === name).length,
    })),
  }

  const filteredActive = activeAdmissions.filter((a: any) => {
    const matchSearch = a.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.hospital_number?.toLowerCase().includes(search.toLowerCase())
    const matchWard = !wardFilter || a.ward_name === wardFilter
    const admitDate = new Date(a.admitted_at)
    const matchFrom = !dateRange.from || admitDate >= new Date(dateRange.from)
    const matchTo = !dateRange.to || admitDate <= new Date(dateRange.to + 'T23:59:59')
    return matchSearch && matchWard && matchFrom && matchTo
  })

  const historyList = allAdmissions
    .filter((a: any) => a.status !== 'active')
    .filter((a: any) => {
      const matchSearch = (a.patient_name || '').toLowerCase().includes(historySearch.toLowerCase()) ||
        (a.hospital_number || '').toLowerCase().includes(historySearch.toLowerCase())
      const matchWard = !wardFilter || a.ward_name === wardFilter
      const admitDate = new Date(a.admitted_at)
      const matchFrom = !dateRange.from || admitDate >= new Date(dateRange.from)
      const matchTo = !dateRange.to || admitDate <= new Date(dateRange.to + 'T23:59:59')
      return matchSearch && matchWard && matchFrom && matchTo
    })

  const sortedHistory = sortItems(historyList)

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Home size={22} className="text-indigo-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Admissions Management</h1>
          <p className="text-sm text-slate-500">{stats.active} currently admitted &middot; {stats.total} total admissions</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
          <p className="text-xs text-slate-500">Currently Admitted</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-500">Total Admissions</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-indigo-600">{stats.wardsWithHistory}</p>
          <p className="text-xs text-slate-500">Wards with History</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">{historyList.length}</p>
          <p className="text-xs text-slate-500">Discharged</p>
        </div>
      </div>

      {/* Ward Occupancy */}
      {tab === 'active' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.byWard.filter((w: { count: number }) => w.count > 0).map((w: { name: string; count: number }) => (
            <div key={w.name} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{w.name}</span>
              <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{w.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('active')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'active' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Active Admissions ({activeAdmissions.length})
        </button>
        <button onClick={() => setTab('history')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'history' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Admission History ({historyList.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder={tab === 'active' ? 'Search patients...' : 'Search history...'}
            value={tab === 'active' ? search : historySearch}
            onChange={(e) => tab === 'active' ? setSearch(e.target.value) : setHistorySearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Wards</option>
          {(tab === 'active' ? activeWardNames : historyWardNames).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom_day">Custom Day</option>
          <option value="custom">Custom Range</option>
        </select>
        {datePreset === 'custom_day' && (
          <input type="date" value={customDay} onChange={(e) => setCustomDay(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" />
        )}
        {datePreset === 'custom' && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" title="From" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" title="To" />
          </>
        )}
      </div>

      {/* Active Admissions */}
      {tab === 'active' && (
        <>
          {filteredActive.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Home size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">{search || wardFilter || dateFrom ? 'No matching patients' : 'No patients currently admitted'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActive.map((a: any) => (
                <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Home size={16} className="text-indigo-600" />
                      <div>
                        <span className="text-sm font-semibold text-indigo-800">{a.ward_name}</span>
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Active</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(a.admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                        className="text-base font-semibold text-slate-800 hover:text-primary transition-colors">{a.patient_name}</button>
                      <p className="text-xs text-slate-400">{a.hospital_number || a.patient_id?.slice(0, 8)}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={11} />Admitted {new Date(a.admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        {a.admitted_by_name && <span className="flex items-center gap-1"><Stethoscope size={11} />by {a.admitted_by_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"><FileText size={12} /> Chart</button>
                      <button onClick={() => navigate(`/consultation/${a.patient_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors">Consult</button>
                      <button onClick={() => setDischargeModal(a)}
                        className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors flex items-center gap-1"><LogOut size={12} /> Discharge</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Admission History */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {sortedHistory.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckCircle size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">{historySearch || wardFilter || dateFrom ? 'No matching records' : 'No discharge history'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {([
                      { key: 'patient_name', label: 'Patient' },
                      { key: 'ward_name', label: 'Ward' },
                      { key: 'admitted_at', label: 'Admitted' },
                      { key: 'discharged_at', label: 'Discharged' },
                    ] as const).map((h) => (
                      <th key={h.key} onClick={() => toggleSort(h.key)}
                        className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">
                        {h.label} {sortIcon(h.key)}
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Admitted By</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Discharged By</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedHistory.map((a: any) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                          className="font-medium text-slate-800 hover:text-primary transition-colors">{a.patient_name || 'Unknown'}</button>
                        <p className="text-xs text-slate-400">{a.hospital_number || a.patient_id?.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{a.ward_name}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{new Date(a.admitted_at).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{a.discharged_at ? new Date(a.discharged_at).toLocaleString() : '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">{a.admitted_by_name || '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">{a.discharged_by_name || '—'}</td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                          className="px-3 py-1 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"><FileText size={12} /> Chart</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Discharge Confirmation Modal */}
      {dischargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!discharging) setDischargeModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><LogOut size={18} className="text-rose-500" /> Discharge Patient</h2>
              <button onClick={() => setDischargeModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Discharge {dischargeModal.patient_name}?</p>
                  <p className="text-xs text-amber-600 mt-1">From: <strong>{dischargeModal.ward_name}</strong> &middot; Admitted: {new Date(dischargeModal.admitted_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setDischargeModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleDischarge} disabled={discharging}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all disabled:opacity-50">
                {discharging ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirm Discharge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
