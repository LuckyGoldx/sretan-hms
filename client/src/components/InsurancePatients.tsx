import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Shield, PlusCircle, Eye, X } from 'lucide-react'
import api from '../hooks/useAxios'

type DateFilterValue = 'all' | 'today' | 'this_week' | 'this_month' | 'custom'

const DATE_FILTERS: { value: DateFilterValue; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtShort(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InsurancePatients() {
  const [patients, setPatients] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [user, setUser] = useState<any>(null)
  const [filterProvider, setFilterProvider] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const requestRef = useRef(0)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setUser(JSON.parse(u)) } catch {}
    api.get('/insurance/providers?with_patients=1')
      .then((res) => setProviders(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProviders([]))
  }, [])

  function computeRange(): { from: string; to: string } | null {
    if (dateFilter === 'today') {
      const to = fmtDate(new Date())
      return { from: to, to }
    }
    if (dateFilter === 'this_week') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - start.getDay())
      return { from: fmtDate(start), to: fmtDate(new Date()) }
    }
    if (dateFilter === 'this_month') {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmtDate(start), to: fmtDate(now) }
    }
    if (dateFilter === 'custom') {
      if (!customFrom || !customTo) return null
      return { from: customFrom, to: customTo }
    }
    return null
  }

  async function fetchPatients() {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const q = search.trim()
      if (q.length >= 2) params.set('search', q)
      if (filterProvider) params.set('provider_id', filterProvider)
      const range = computeRange()
      if (range) {
        params.set('date_from', range.from)
        params.set('date_to', range.to)
      }
      const query = params.toString()
      const res = await api.get(`/insurance/patients${query ? `?${query}` : ''}`)
      if (requestId !== requestRef.current) return
      setPatients(Array.isArray(res.data) ? res.data : [])
    } catch {
      if (requestId === requestRef.current) setPatients([])
    }
    finally { if (requestId === requestRef.current) setLoading(false) }
  }

  useEffect(() => {
    if (search.length > 0 && search.length < 2) return
    if (dateFilter === 'custom' && (!customFrom || !customTo)) return
    const timer = setTimeout(() => { fetchPatients() }, search.length >= 2 ? 400 : 0)
    return () => clearTimeout(timer)
  }, [search, filterProvider, dateFilter, customFrom, customTo])

  function handleSearch() {
    fetchPatients()
  }

  const hasFilters = Boolean(filterProvider) || dateFilter !== 'all' || search.trim().length >= 2
  const hasActiveDateFilter = dateFilter !== 'all'

  function clearFilters() {
    setFilterProvider('')
    setDateFilter('all')
    setCustomFrom('')
    setCustomTo('')
    setSearch('')
  }

  const providerName = user?.provider_id ? 'Provider Patients' : 'All Insurance Patients'
  const activeFilterLabel = [
    filterProvider ? (providers.find((p: any) => p.id === filterProvider)?.name || 'Selected provider') : '',
    dateFilter === 'all' ? '' : DATE_FILTERS.find((d) => d.value === dateFilter)?.label || '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Insurance Patients</h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? '' : `${patients.length} patient${patients.length !== 1 ? 's' : ''} with insurance — ${providerName}`}
          {hasFilters && <span className="text-slate-400"> · filtered by {activeFilterLabel || 'filters'}</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or hospital #..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value as DateFilterValue); setCustomFrom(''); setCustomTo('') }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            {DATE_FILTERS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          )}

          <select
            value={filterProvider}
            onChange={e => setFilterProvider(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="">All providers</option>
            {providers.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}{Number(p.patient_count || 0) > 0 ? ` (${p.patient_count})` : ''}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {!loading && patients.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Shield className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm">
            {search ? `No patients found matching "${search}"` : hasFilters ? 'No patients match the current filters' : 'No insured patients yet'}
          </p>
        </div>
      )}

      {!loading && patients.length > 0 && (
        <div className="space-y-3">
          {patients.map((p: any) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-800">{p.full_name}</h3>
                    {p.active_cases > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <Shield className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.hospital_number} &middot; {p.sex || '—'}
                    {p.dob && <span> &middot; {p.dob?.slice(0, 10)}</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                    <span>{p.total_cases || 0} case{(p.total_cases || 0) !== 1 ? 's' : ''}</span>
                    {p.active_cases > 0 && <span className="text-emerald-600 font-medium">{p.active_cases} active</span>}
                    {p.primary_provider && <span className="text-slate-600 font-medium">{p.primary_provider}{p.coverage_tag === 'primary' ? ' (Primary)' : ''}</span>}
                    {!p.primary_provider && p.insurance_type && <span className="text-slate-400">{p.insurance_type}{p.insurance && p.insurance !== '__other__' ? ` (${p.insurance})` : ''}</span>}
                    {hasActiveDateFilter && p.last_insurance_activity && <span>Last activity {fmtShort(p.last_insurance_activity)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={`/insurance/cases?patientId=${p.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition-all">
                    <Eye className="w-3.5 h-3.5" /> Cases
                  </a>
                  <a href={`/insurance/cases/new`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all">
                    <PlusCircle className="w-3.5 h-3.5" /> New Case
                  </a>
                  <a href={`/insurance/patients/${p.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-all">
                    <Shield className="w-3.5 h-3.5" /> Insurance
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
