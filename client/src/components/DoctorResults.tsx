import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, Loader2, FileText, Clock, ArrowLeft, Pill, FlaskConical, Scan, User, X, Filter, Calendar, ChevronDown, CheckCircle, AlertTriangle, XCircle, BarChart3, ArrowUp, ArrowDown, Building2,
} from 'lucide-react'

const PER_PAGE = 20

type DateFilterValue = 'all' | 'today' | 'yesterday' | 'this-week' | 'this-month' | 'this-year' | 'custom-date' | 'custom-range'

const DATE_FILTERS: { value: DateFilterValue; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom-date', label: 'Custom Date' },
  { value: 'custom-range', label: 'Custom Range' },
]

function getDateRange(f: DateFilterValue): { start: Date; end: Date } | null {
  var now = new Date()
  var s = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (f === 'today') return { start: s, end: now }
  if (f === 'yesterday') { s.setDate(s.getDate() - 1); var e = new Date(s); e.setHours(23, 59, 59, 999); return { start: s, end: e } }
  if (f === 'this-week') { s.setDate(s.getDate() - s.getDay()); return { start: s, end: now } }
  if (f === 'this-month') { s.setDate(1); return { start: s, end: now } }
  if (f === 'this-year') { s = new Date(now.getFullYear(), 0, 1); return { start: s, end: now } }
  return null
}

const statusMeta: Record<string, { label: string; color: string }> = {
  ordered: { label: 'Ordered', color: 'bg-blue-100 text-blue-700' },
  collected: { label: 'Collected', color: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Processing', color: 'bg-purple-100 text-purple-700' },
  review: { label: 'In Review', color: 'bg-rose-100 text-rose-700' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
}

type ResultItem = {
  type: 'lab' | 'radiology'
  id: string
  patient_name: string
  patient_id?: string
  hospital_number?: string
  test_name?: string
  imaging_type?: string
  status: string
  created_at: string
  completed_at?: string
  doctor_name: string
  results?: any[]
  report_text?: string
  image_path?: string
  reported_by_name?: string
  reported_at?: string
  entered_by_name?: string
  approved_by_name?: string
  approved_at?: string
  lab_number?: string
  imaging_number?: string
  is_paid?: boolean
  specimen_type?: string
  priority?: string
}

export default function DoctorResults() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ResultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'lab' | 'radiology'>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all')
  const [customDate, setCustomDate] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showDateDropdown, setShowDateDropdown] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<ResultItem | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('doctor_read_results') || '[]')) } catch { return new Set<string>() }
  })
  const readIdsRef = useRef(readIds)
  readIdsRef.current = readIds
  const dateRef = useRef<HTMLDivElement>(null)

  const staffId = useMemo(() => {
    try { const u = JSON.parse(localStorage.getItem('sretan_user') || '{}'); return u.id } catch { return null }
  }, [])

  useEffect(() => {
    if (!staffId) return
    loadData()
  }, [staffId])

  // Sync readIds from localStorage whenever items change (re-fetch, etc.)
  useEffect(() => {
    try {
      var stored: string[] = JSON.parse(localStorage.getItem('doctor_read_results') || '[]')
      setReadIds(new Set(stored))
    } catch {}
  }, [items])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setShowDateDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [labRes, radRes] = await Promise.all([
        api.get(`/lab-orders?doctor_id=${staffId}`).catch(() => ({ data: [] })),
        api.get(`/radiology-orders?doctor_id=${staffId}`).catch(() => ({ data: [] })),
      ])
      var combined: ResultItem[] = [
        ...(labRes.data || []).map((r: any) => ({ type: 'lab' as const, ...r })),
        ...(radRes.data || []).map((r: any) => ({ type: 'radiology' as const, ...r })),
      ]
      setItems(combined)
    } catch {} finally { setLoading(false) }
  }

  async function loadLabResults(item: ResultItem) {
    try {
      const res = await api.get(`/lab-results/${item.id}${item.status === 'completed' ? '' : '?status=completed'}`)
      setDetail({ ...item, results: res.data || [] })
    } catch { setDetail(item) }
  }

  async function loadRadDetail(item: ResultItem) {
    setDetail(item)
  }

  const filtered = items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (statusFilter) {
      if (statusFilter === 'review') {
        if (item.status !== 'review' && item.status !== 'rejected') return false
      } else if (item.status !== statusFilter) return false
    }
    if (dateFilter !== 'all') {
      var dr = dateFilter === 'custom-date'
        ? (customDate ? { start: new Date(customDate), end: new Date(customDate + 'T23:59:59') } : null)
        : dateFilter === 'custom-range'
          ? (customFrom && customTo ? { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') } : null)
          : getDateRange(dateFilter)
      if (dr) {
        var pd = new Date(item.created_at)
        if (pd < dr.start || pd > dr.end) return false
      }
    }
    if (search) {
      var q = search.toLowerCase()
      var name = (item.patient_name || '').toLowerCase()
      var test = ((item.test_name || item.imaging_type || '')).toLowerCase()
      var num = (item.lab_number || item.imaging_number || '').toLowerCase()
      var hn = (item.hospital_number || '').toLowerCase()
      if (!name.includes(q) && !test.includes(q) && !num.includes(q) && !hn.includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    var da = new Date(a.created_at).getTime()
    var db = new Date(b.created_at).getTime()
    return sortOrder === 'desc' ? db - da : da - db
  })

  const totalPages = Math.ceil(sorted.length / PER_PAGE)
  const paged = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const itemLabel = (item: ResultItem) => item.test_name || item.imaging_type || ''

  function markAsRead(item: ResultItem) {
    if (item.status !== 'completed') return
    var key = `${item.type}-${item.id}`
    if (!readIdsRef.current.has(key)) {
      var next = new Set(readIdsRef.current)
      next.add(key)
      setReadIds(next)
      readIdsRef.current = next
      localStorage.setItem('doctor_read_results', JSON.stringify([...next]))
      try { window.dispatchEvent(new CustomEvent('doctorResultsRead', { detail: { id: key } })) } catch {}
    }
  }

  function statusDisplay(item: ResultItem): { label: string; color: string } {
    if (item.type === 'radiology' && (item.status === 'processing' || item.status === 'review' || item.status === 'rejected')) {
      return { label: 'In Review', color: 'bg-rose-100 text-rose-700' }
    }
    if (item.type === 'lab' && item.status === 'rejected') {
      return { label: 'In Review', color: 'bg-rose-100 text-rose-700' }
    }
    return statusMeta[item.status] || { label: item.status, color: 'bg-slate-100 text-slate-600' }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const statusCounts = items.reduce((acc: Record<string, number>, item) => {
    var s = item.status
    if (s === 'rejected') s = 'review'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><FileText size={22} className="text-indigo-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Results</h1>
          <p className="text-sm text-slate-500">{items.length} total (lab: {items.filter((i) => i.type === 'lab').length} · radiology: {items.filter((i) => i.type === 'radiology').length})</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(['all', 'lab', 'radiology'] as const).map((t) => {
            const Icon = t === 'lab' ? FlaskConical : t === 'radiology' ? Scan : Filter
            return (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(0) }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${typeFilter === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t !== 'all' && <Icon size={14} />}{t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          })}
        </div>

        {/* Date filter */}
        <div className="relative" ref={dateRef}>
          <button onClick={() => setShowDateDropdown(!showDateDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Calendar size={15} className="text-primary" />
            {DATE_FILTERS.find((d) => d.value === dateFilter)?.label || 'All Time'}
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showDateDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showDateDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 w-48 overflow-hidden">
              {DATE_FILTERS.map((opt) => (
                <button key={opt.value} onClick={() => { setDateFilter(opt.value); setShowDateDropdown(false); if (opt.value !== 'custom-date' && opt.value !== 'custom-range') { setCustomDate(''); setCustomFrom(''); setCustomTo('') } }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${dateFilter === opt.value ? 'bg-primary/5 text-primary font-medium' : 'text-slate-600'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {(dateFilter === 'custom-date' || dateFilter === 'custom-range') && (
            <div className="flex items-center gap-2 mt-2">
              <input type="date" value={customDate || customFrom} onChange={(e) => { if (dateFilter === 'custom-date') setCustomDate(e.target.value); else setCustomFrom(e.target.value) }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
              {dateFilter === 'custom-range' && (
                <>
                  <span className="text-xs text-slate-400">to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </>
              )}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
            <option value="">All Statuses</option>
            {Object.entries(statusMeta).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>

        <button onClick={() => setSortOrder((p) => (p === 'desc' ? 'asc' : 'desc'))}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          {sortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
        </button>

        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient or test..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
      </div>

      {/* Results list */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <FileText size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No results found</p>
          <p className="text-xs mt-1">You haven&apos;t ordered any tests yet.</p>
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-10 text-slate-400"><p className="text-sm">No results on this page</p></div>
      ) : (
        <div className="space-y-3">
          {paged.map((item) => {
            const sd = statusDisplay(item)
            const Icon = item.type === 'lab' ? FlaskConical : Scan
            const isCompleted = item.status === 'completed'
            const isUnread = isCompleted && !readIds.has(`${item.type}-${item.id}`)
            return (
              <div key={`${item.type}-${item.id}`} onClick={() => { if (item.type === 'lab') loadLabResults(item); else loadRadDetail(item); markAsRead(item) }}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${isUnread ? 'border-l-4 border-l-blue-500 border-slate-200' : 'border-slate-200'}`}>
                <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.type === 'lab' ? 'bg-purple-100' : 'bg-indigo-100'}`}>
                      <Icon size={16} className={item.type === 'lab' ? 'text-purple-600' : 'text-indigo-600'} />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 truncate">{itemLabel(item)}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex-shrink-0 ${sd.color}`}>{sd.label}</span>
                    {item.is_paid === false && <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">Unpaid</span>}
                    {item.lab_number && <span className="text-xs text-slate-400 font-mono flex-shrink-0">{item.lab_number}</span>}
                    {item.imaging_number && <span className="text-xs text-slate-400 font-mono flex-shrink-0">{item.imaging_number}</span>}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{formatDate(item.created_at)}</span>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <button onClick={(e) => { e.stopPropagation(); if (item.patient_id) navigate(`/patient/${item.patient_id}`) }}
                        className="text-sm font-medium text-slate-800 flex items-center gap-2 hover:text-primary transition-colors">
                        <User size={14} className="text-slate-400" /> {item.patient_name || '—'}
                      </button>
                      {item.hospital_number && <p className="text-[10px] text-slate-400 ml-6">{item.hospital_number}</p>}
                    {item.entered_by_name && isCompleted && (
                      <p className="text-[10px] text-sky-600 mt-0.5">Entered by: {item.entered_by_name}{item.approved_at ? ` · ${formatDate(item.approved_at)}` : ''}</p>
                    )}
                    {item.reported_by_name && isCompleted && (
                      <p className="text-[10px] text-indigo-600 mt-0.5">Reported by: {item.reported_by_name} · {formatDate(item.reported_at || item.created_at)}</p>
                    )}
                    {item.approved_by_name && isCompleted && (
                      <p className="text-[10px] text-purple-600 mt-0.5">Approved by: {item.approved_by_name} · {formatDate(item.approved_at || item.created_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {isCompleted && (
                      <span className="text-xs text-primary font-medium flex items-center gap-1">
                        View <FileText size={12} />
                      </span>
                    )}
                    {!isCompleted && (
                      <span className="text-xs text-slate-400">{statusDisplay(item).label}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium disabled:opacity-30 hover:bg-slate-50">Previous</button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium disabled:opacity-30 hover:bg-slate-50">Next</button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (detail) markAsRead(detail); setDetail(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                {detail.type === 'lab' ? <FlaskConical size={22} className="text-purple-500" /> : <Scan size={22} className="text-indigo-500" />}
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{itemLabel(detail)}</h2>
                  <p className="text-xs text-slate-400">{detail.type === 'lab' ? `Lab #${detail.lab_number || ''}` : `Imaging #${detail.imaging_number || ''}`} · {detail.patient_name}</p>
                </div>
              </div>
              <button onClick={() => { if (detail) markAsRead(detail); setDetail(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold">{detail.patient_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${statusDisplay(detail).color}`}>
                    {detail.status === 'completed' && <CheckCircle size={12} />}
                    {statusDisplay(detail).label}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Date Ordered</p>
                  <p className="text-sm font-semibold">{formatDate(detail.created_at)}</p>
                </div>
              </div>

              {detail.type === 'lab' && detail.results && detail.results.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Lab Results</h4>
                  <div className="space-y-2">
                    {detail.results.map((r: any) => (
                      <div key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm flex-wrap ${r.is_abnormal ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50 border border-slate-100'}`}>
                        <span className="font-medium flex-1 min-w-0 text-slate-700">{r.analyte_name}</span>
                        <span className={`font-bold flex-shrink-0 ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                        <span className="text-slate-400 flex-shrink-0 text-xs">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                        {r.is_abnormal && <AlertTriangle size={12} className="text-rose-500 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.type === 'radiology' && detail.report_text && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Radiology Report</h4>
                  <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detail.report_text}</div>
                </div>
              )}

              {detail.type === 'radiology' && detail.image_path && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attached Image</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center justify-center">
                    <img src={detail.image_path} alt="Radiology" className="max-w-full max-h-80 rounded-lg object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                </div>
              )}

              {detail.entered_by_name && (
                <div className="bg-sky-50 rounded-xl p-4 border border-sky-100">
                  <p className="text-xs text-slate-500 mb-1">Entered By</p>
                  <p className="text-sm font-semibold text-slate-800">{detail.entered_by_name}</p>
                  {detail.approved_at && <p className="text-xs text-slate-500 mt-0.5">{formatDate(detail.approved_at)}</p>}
                </div>
              )}
              {detail.reported_by_name && detail.type === 'radiology' && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <p className="text-xs text-slate-500 mb-1">Reported By</p>
                  <p className="text-sm font-semibold text-slate-800">{detail.reported_by_name}</p>
                  {detail.reported_at && <p className="text-xs text-slate-500 mt-0.5">{formatDate(detail.reported_at)}</p>}
                </div>
              )}
              {detail.approved_by_name && (
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <p className="text-xs text-slate-500 mb-1">Approved By</p>
                  <p className="text-sm font-semibold text-slate-800">{detail.approved_by_name}</p>
                  {detail.approved_at && <p className="text-xs text-slate-500 mt-0.5">{formatDate(detail.approved_at)}</p>}
                </div>
              )}

              {detail.priority && <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between text-sm"><span className="text-slate-500">Priority</span><span className="font-medium capitalize">{detail.priority}</span></div>}
              {detail.specimen_type && <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between text-sm"><span className="text-slate-500">Specimen</span><span className="font-medium">{detail.specimen_type}</span></div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => { if (detail) markAsRead(detail); setDetail(null) }} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
