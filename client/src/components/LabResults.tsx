import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { printLabReport } from '../utils/labPrint'
import {
  FlaskConical, Search, Loader2, CheckCircle, XCircle, FileText, X, AlertTriangle, Clock, Copy, Users, Printer
} from 'lucide-react'

const PER_PAGE = 15

function usePagination<T>(items: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PER_PAGE
  return { items: items.slice(start, start + PER_PAGE), totalPages }
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (n: number) => void }) {
  if (totalPages <= 1) return null
  const pages: number[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 3) {
    for (let i = 1; i <= maxVisible; i++) pages.push(i)
  } else if (page >= totalPages - 2) {
    for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i)
  } else {
    for (let i = page - 2; i <= page + 2; i++) pages.push(i)
  }
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
    </div>
  )
}

const staffId = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

function resultTypeLabel(t?: string): string {
  if (t === 'free_text') return 'text'
  return t || 'numeric'
}

function specimensLabel(o: any): string {
  if (o.specimens && o.specimens.length) return o.specimens.join(', ')
  return o.specimen_type || ''
}

export default function LabResults() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'pending' | 'not-collected' | 'collected' | 'completed'>('pending')
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<any[]>([])
  const [uncollectedComplete, setUncollectedComplete] = useState<any[]>([])
  const [collectedOrders, setCollectedOrders] = useState<any[]>([])
  const [allCompleted, setAllCompleted] = useState<any[]>([])
  const [stats, setStats] = useState({ pendingApproval: 0, totalCompleted: 0, notCollected: 0, collected: 0, completedToday: 0 })
  const [pendingPage, setPendingPage] = useState(1)
  const [completedPage, setCompletedPage] = useState(1)
  const [search, setSearch] = useState('')
  const [completedSort, setCompletedSort] = useState<'newest' | 'oldest' | 'patient-az' | 'patient-za' | 'test-az'>('newest')
  const [printModal, setPrintModal] = useState<any | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [viewGroup, setViewGroup] = useState<any | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api.get('/lab-results?status=draft')
      setDrafts(res.data || [])
    } catch {}
  }, [])

  const loadCompletedCollected = useCallback(async () => {
    try {
      const completedRes = await api.get('/lab-orders?status=completed').catch(() => ({ data: [] }))
      var allComplete = completedRes.data || []
      setAllCompleted(allComplete)
      setUncollectedComplete(allComplete.filter((o: any) => !o.results_collected_at && !o.encounter_id))
      setCollectedOrders(allComplete.filter((o: any) => o.results_collected_at))
    } catch {}
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const [draftRes, completedRes] = await Promise.all([
        api.get('/lab-results?status=draft').catch(() => ({ data: [] })),
        api.get('/lab-orders?status=completed').catch(() => ({ data: [] })),
      ])
      var allComplete = completedRes.data || []
      var todayStr = new Date().toISOString().slice(0, 10)
      var completedToday = allComplete.filter((o: any) => { var d = new Date(o.created_at); return d.toISOString().slice(0, 10) === todayStr })
      setStats({
        pendingApproval: new Set((draftRes.data || []).map((r: any) => r.lab_order_id)).size,
        totalCompleted: allComplete.length,
        notCollected: allComplete.filter((o: any) => !o.results_collected_at && !o.encounter_id).length,
        collected: allComplete.filter((o: any) => o.results_collected_at).length,
        completedToday: completedToday.length,
      })
    } catch {}
  }, [])

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    await Promise.all([loadDrafts(), loadCompletedCollected(), loadStats()])
    if (!silent) setLoading(false)
  }, [loadDrafts, loadCompletedCollected, loadStats])

  useEffect(() => {
    loadAll()
    const interval = setInterval(() => loadAll(true), 10000)
    const onFocus = () => loadAll(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [loadAll])

  // Group draft results by lab order so a test shows as one card with its analytes inside.
  const pendingGroups = useMemo(() => {
    const map = new Map<string, any>()
    for (const d of drafts) {
      const key = d.lab_order_id || d.id
      if (!map.has(key)) {
        map.set(key, { ...d, analytes: [d] })
      } else {
        map.get(key).analytes.push(d)
      }
    }
    return Array.from(map.values())
  }, [drafts])

  async function handleApproveGroup(orderId: string) {
    setProcessingId(orderId)
    try {
      const group = drafts.filter((d: any) => (d.lab_order_id || d.id) === orderId)
      for (const d of group) {
        await api.put(`/lab-results/${d.id}/approve`, { approved_by: staffId })
      }
      await loadAll()
    } catch (err: any) { console.error('Approve failed:', err) } finally { setProcessingId(null) }
  }

  async function handleRejectGroup(orderId: string) {
    setProcessingId(orderId)
    try {
      const group = drafts.filter((d: any) => (d.lab_order_id || d.id) === orderId)
      for (const d of group) {
        await api.put(`/lab-results/${d.id}/reject`)
      }
      await loadAll()
    } catch (err: any) { console.error('Reject failed:', err) } finally { setProcessingId(null) }
  }

  async function handleMarkCollected(order: any) {
    setProcessingId(order.id)
    try {
      await api.put(`/lab-orders/${order.id}`, { results_collected_at: new Date().toISOString(), results_collected_by: staffId })
      await loadAll()
    } catch (err: any) { console.error('Mark collected failed:', err) } finally { setProcessingId(null) }
  }

  async function openPrintModal(order: any) {
    try {
      const res = await api.get(`/lab-results/${order.id}`)
      setPrintModal({ ...order, results: res.data || [] })
    } catch { setPrintModal(order) }
  }

  const filterBySearch = (items: any[]) => items.filter((o: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (o.patient_name || '').toLowerCase().includes(q) || (o.test_name || '').toLowerCase().includes(q) || (o.lab_number || '').toLowerCase().includes(q)
  })

  const sortedCompleted = useMemo(() => {
    const items = filterBySearch(allCompleted).slice()
    const dateOf = (o: any) => new Date(o.approved_at || o.created_at).getTime()
    switch (completedSort) {
      case 'oldest':
        items.sort((a, b) => dateOf(a) - dateOf(b))
        break
      case 'patient-az':
        items.sort((a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''))
        break
      case 'patient-za':
        items.sort((a, b) => (b.patient_name || '').localeCompare(a.patient_name || ''))
        break
      case 'test-az':
        items.sort((a, b) => (a.test_name || '').localeCompare(b.test_name || ''))
        break
      default:
        items.sort((a, b) => dateOf(b) - dateOf(a))
    }
    return items
  }, [allCompleted, search, completedSort])

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab Results</h1>
          <p className="text-sm text-slate-500">Approve results and view completed reports</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-amber-600">{stats.pendingApproval}</p>
          <p className="text-xs text-slate-500">Pending Approval</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{stats.totalCompleted}</p>
          <p className="text-xs text-slate-500">Total Completed</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{stats.notCollected}</p>
          <p className="text-xs text-slate-500">Not Collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-indigo-600">{stats.collected}</p>
          <p className="text-xs text-slate-500">Collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-blue-600">{stats.completedToday}</p>
          <p className="text-xs text-slate-500">Completed Today</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => { setActiveTab('pending'); setPendingPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Pending Approval ({stats.pendingApproval})
        </button>
        <button onClick={() => { setActiveTab('completed'); setCompletedPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'completed' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Completed ({stats.totalCompleted})
        </button>
        <button onClick={() => { setActiveTab('not-collected'); setCompletedPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'not-collected' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Not Collected ({stats.notCollected})
        </button>
        <button onClick={() => { setActiveTab('collected'); setCompletedPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'collected' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Collected ({stats.collected})
        </button>
      </div>

      {/* Pending Approval Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          {drafts.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckCircle size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">All results approved</p>
              <p className="text-xs mt-1">No drafts pending your review</p>
            </div>
          ) : (
            <>
              {usePagination(pendingGroups, pendingPage).items.map((g: any) => (
                <div key={g.lab_order_id || g.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-800 truncate">{g.test_name}</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">Draft</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-600 flex-shrink-0">{g.analytes.length} result{g.analytes.length > 1 ? 's' : ''}</span>
                    </div>
                    {g.lab_number && <span className="text-xs text-slate-400 font-mono flex-shrink-0 ml-3">#{g.lab_number}</span>}
                  </div>
                  <div className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-800">{g.full_patient_name || g.patient_name || '—'}</p>
                    <div className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {g.analytes.map((d: any) => (
                        <div key={d.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${d.is_abnormal ? 'bg-amber-50' : 'bg-white'}`}>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-700">{d.analyte_name}</span>
                            <span className={`font-bold ml-2 ${d.is_abnormal ? 'text-amber-700' : 'text-slate-800'}`}>{d.value}{d.unit ? ` ${d.unit}` : ''}</span>
                            {(d.ref_range_text || d.reference_range_low || d.reference_range_high) && (
                              <span className="text-xs text-slate-400 ml-2">Ref: {d.ref_range_text || `${d.reference_range_low || ''}–${d.reference_range_high || ''}`}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {d.remarks && <span className="text-xs text-slate-400 max-w-[160px] truncate">{d.remarks}</span>}
                            {d.is_abnormal && <AlertTriangle size={13} className="text-amber-600" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button onClick={() => setViewGroup(g)} disabled={processingId === (g.lab_order_id || g.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-50">
                      <FileText size={12} /> View
                    </button>
                    <button onClick={() => handleRejectGroup(g.lab_order_id || g.id)} disabled={processingId === (g.lab_order_id || g.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50">
                      {processingId === (g.lab_order_id || g.id) ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Reject All
                    </button>
                    <button onClick={() => handleApproveGroup(g.lab_order_id || g.id)} disabled={processingId === (g.lab_order_id || g.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
                      {processingId === (g.lab_order_id || g.id) ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Approve All
                    </button>
                  </div>
                </div>
              ))}
              <Pagination page={pendingPage} totalPages={usePagination(pendingGroups, pendingPage).totalPages} onChange={setPendingPage} />
            </>
          )}
        </div>
      )}

      {/* Not Collected Tab */}
      {activeTab === 'not-collected' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name, test, or lab #..." value={search} onChange={(e) => { setSearch(e.target.value); setCompletedPage(1) }}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {uncollectedComplete.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <FileText size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">All results collected</p>
              <p className="text-xs mt-1">No completed results waiting for patient collection</p>
            </div>
          ) : (
            <>
              {filterBySearch(uncollectedComplete).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No results match your search</p>
              ) : (
                usePagination(filterBySearch(uncollectedComplete), completedPage).items.map((o: any) => (
                  <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Completed</span>
                        {!o.encounter_id && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-sky-100 text-sky-700 flex-shrink-0">Walk-in</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                        {o.lab_number && <p className="text-xs text-slate-400 font-mono">#{o.lab_number}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <button onClick={() => openPrintModal(o)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"><FileText size={12} /> View</button>
                        {!o.encounter_id && (
                          <button onClick={() => handleMarkCollected(o)} disabled={processingId === o.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-xs font-medium hover:bg-sky-100 transition-colors disabled:opacity-50">
                            {processingId === o.id ? <Loader2 size={12} className="animate-spin" /> : null}
                            Mark as Collected
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <Pagination page={completedPage} totalPages={usePagination(filterBySearch(uncollectedComplete), completedPage).totalPages} onChange={setCompletedPage} />
            </>
          )}
        </div>
      )}

      {/* Collected Tab */}
      {activeTab === 'collected' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name, test, or lab #..." value={search} onChange={(e) => { setSearch(e.target.value); setCompletedPage(1) }}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {collectedOrders.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckCircle size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No collected results</p>
              <p className="text-xs mt-1">Results that patients have collected will appear here</p>
            </div>
          ) : (
            <>
              {filterBySearch(collectedOrders).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No results match your search</p>
              ) : (
                usePagination(filterBySearch(collectedOrders), completedPage).items.map((o: any) => (
                  <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Collected</span>
                        {!o.encounter_id && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-sky-100 text-sky-700 flex-shrink-0">Walk-in</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                        {o.lab_number && <p className="text-xs text-slate-400 font-mono">#{o.lab_number}</p>}
                        {o.results_collected_at && (
                          <p className="text-[10px] text-sky-600 mt-0.5">
                            Collected {new Date(o.results_collected_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <button onClick={() => openPrintModal(o)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex-shrink-0 ml-3">
                        <FileText size={12} /> View
                      </button>
                    </div>
                  </div>
                ))
              )}
              <Pagination page={completedPage} totalPages={usePagination(filterBySearch(collectedOrders), completedPage).totalPages} onChange={setCompletedPage} />
            </>
          )}
        </div>
      )}

      {/* Completed Tab (registered patients only) */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by name, test, or lab #..." value={search} onChange={(e) => { setSearch(e.target.value); setCompletedPage(1) }}
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
            </div>
            <select value={completedSort} onChange={(e) => { setCompletedSort(e.target.value as any); setCompletedPage(1) }}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="patient-az">Patient A–Z</option>
              <option value="patient-za">Patient Z–A</option>
              <option value="test-az">Test A–Z</option>
            </select>
          </div>
          {allCompleted.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckCircle size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No completed results</p>
              <p className="text-xs mt-1">All completed lab results will appear here</p>
            </div>
          ) : (
            <>
              {sortedCompleted.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No results match your search</p>
              ) : (
                usePagination(sortedCompleted, completedPage).items.map((o: any) => (
                  <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Completed</span>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                        {o.lab_number && <p className="text-xs text-slate-400 font-mono">#{o.lab_number}</p>}
                      </div>
                      <button onClick={() => openPrintModal(o)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex-shrink-0 ml-3">
                        <FileText size={12} /> View
                      </button>
                    </div>
                  </div>
                ))
              )}
              <Pagination page={completedPage} totalPages={usePagination(sortedCompleted, completedPage).totalPages} onChange={setCompletedPage} />
            </>
          )}
        </div>
      )}

      {/* Comprehensive Pending View Modal */}
      {viewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!processingId) setViewGroup(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FlaskConical size={18} className="text-purple-500" /> {viewGroup.test_name}</h2>
              <button onClick={() => setViewGroup(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Order header */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="col-span-2 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-medium">{viewGroup.full_patient_name || viewGroup.patient_name || 'Walk-in Patient'}</span>
                  {viewGroup.lab_number && <span className="text-slate-400 font-mono text-xs">#{viewGroup.lab_number}</span>}
                </div>
                {specimensLabel(viewGroup) && <div><span className="text-slate-500">Specimen:</span> <span className="font-medium">{specimensLabel(viewGroup)}</span></div>}
                {viewGroup.priority && <div><span className="text-slate-500">Priority:</span> <span className="font-medium uppercase">{viewGroup.priority}</span></div>}
                {viewGroup.doctor_name && <div><span className="text-slate-500">Requested by:</span> <span className="font-medium">{viewGroup.doctor_name}</span></div>}
                {viewGroup.created_at && <div><span className="text-slate-500">Ordered:</span> <span className="font-medium">{new Date(viewGroup.created_at).toLocaleString()}</span></div>}
                {(viewGroup.entered_by_name || viewGroup.entered_at) && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Entered by:</span>{' '}
                    <span className="font-medium">{viewGroup.entered_by_name || '—'}</span>
                    {viewGroup.entered_at ? ` · ${new Date(viewGroup.entered_at).toLocaleString()}` : ''}
                  </div>
                )}
              </div>
              {viewGroup.doctor_comment && (
                <div className="text-sm bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                  <span className="text-slate-500 font-medium">Doctor's Comment:</span>{' '}
                  <span className="text-slate-700">{viewGroup.doctor_comment}</span>
                </div>
              )}

              {/* Analytes */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results ({viewGroup.analytes.length})</p>
                <div className="space-y-3">
                  {viewGroup.analytes.map((d: any) => (
                    <div key={d.id} className={`px-4 py-4 border border-slate-200 rounded-xl ${d.flag_status === 'critical' ? 'bg-rose-50' : d.flag_status === 'abnormal' || d.is_abnormal ? 'bg-amber-50' : 'bg-white'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-800">{d.analyte_name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 capitalize">{resultTypeLabel(d.result_type)}</span>
                          {(d.flag_status === 'critical' || d.flag_status === 'abnormal' || d.is_abnormal) && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.flag_status === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {(d.flag_status || 'abnormal').toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm mt-1">
                        <span className={`font-bold ${d.flag_status === 'critical' ? 'text-rose-700' : d.flag_status === 'abnormal' || d.is_abnormal ? 'text-amber-700' : 'text-slate-800'}`}>
                          {d.value}{d.unit ? ` ${d.unit}` : ''}
                        </span>
                        {(d.ref_range_text || d.reference_range_low || d.reference_range_high) && (
                          <span className="text-xs text-slate-400 ml-3">
                            Ref: {d.ref_range_text || `${d.reference_range_low || ''}–${d.reference_range_high || ''}`}
                          </span>
                        )}
                      </p>
                      {d.remarks && <p className="text-xs text-slate-500 mt-1"><span className="font-medium">Note:</span> <span className="italic">{d.remarks}</span></p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Report-level remarks */}
              {viewGroup.order_remarks && (
                <div className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">General Lab Remarks</span>
                  <p className="text-slate-700 whitespace-pre-wrap">{viewGroup.order_remarks}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-3 flex-shrink-0">
              <span className="text-xs text-slate-400">Approve or reject the entire test above.</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewGroup(null)} disabled={!!processingId}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button onClick={async () => { await handleRejectGroup(viewGroup.lab_order_id || viewGroup.id); setViewGroup(null) }} disabled={!!processingId}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-colors disabled:opacity-50">
                  {processingId ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                </button>
                <button onClick={async () => { await handleApproveGroup(viewGroup.lab_order_id || viewGroup.id); setViewGroup(null) }} disabled={!!processingId}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
                  {processingId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View/Print Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setPrintModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-slate-500">Patient:</span> <span className="font-medium">{printModal.patient_name || 'Walk-in Patient'}</span></div>
                <div><span className="text-slate-500">Lab #:</span> <span className="font-medium font-mono">{printModal.lab_number || '—'}</span></div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{printModal.test_name}</span></div>
                <div><span className="text-slate-500">Specimen:</span> <span className="font-medium">{specimensLabel(printModal) || '—'}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(printModal.created_at).toLocaleString()}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{printModal.status}</span></div>
                {printModal.doctor_name && <div><span className="text-slate-500">Requested by:</span> <span className="font-medium">{printModal.doctor_name}</span></div>}
                {(printModal.results?.[0]?.entered_by_name || printModal.results?.[0]?.entered_at) && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Entered by:</span>{' '}
                    <span className="font-medium">{printModal.results?.[0]?.entered_by_name || '—'}</span>
                    {printModal.results?.[0]?.entered_at ? ` · ${new Date(printModal.results?.[0]?.entered_at).toLocaleString()}` : ''}
                  </div>
                )}
              </div>

              {printModal.results && printModal.results.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                  <div className="space-y-3">
                    {printModal.results.map((r: any) => (
                      <div key={r.id} className={`px-5 py-4 border border-slate-200 rounded-xl ${r.flag_status === 'critical' ? 'bg-rose-50' : r.flag_status === 'abnormal' || r.is_abnormal ? 'bg-amber-50' : 'bg-white'}`}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-sm">
                            <span className="text-slate-500">Analyte:</span>{' '}
                            <span className="font-semibold text-slate-800">{r.analyte_name}</span>
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 capitalize">{resultTypeLabel(r.result_type)}</span>
                            {(r.flag_status === 'critical' || r.flag_status === 'abnormal' || r.is_abnormal) && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.flag_status === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {(r.flag_status || 'abnormal').toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm mt-2">
                          <span className="text-slate-500">Value:</span>{' '}
                          <span className={`font-bold ${r.flag_status === 'critical' ? 'text-rose-700' : r.flag_status === 'abnormal' || r.is_abnormal ? 'text-amber-700' : 'text-slate-800'}`}>
                            {r.value}{r.unit ? ` ${r.unit}` : ''}
                          </span>
                        </p>
                        {(r.ref_range_text || r.reference_range_low || r.reference_range_high) && (
                          <p className="text-sm mt-1">
                            <span className="text-slate-500">Ref:</span>{' '}
                            <span className="font-medium text-slate-700">{r.ref_range_text || `${r.reference_range_low || ''}–${r.reference_range_high || ''}`}</span>
                          </p>
                        )}
                        {r.remarks && (
                          <p className="text-sm mt-1">
                            <span className="text-slate-500">Note:</span>{' '}
                            <span className="text-slate-700 italic">{r.remarks}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
              )}

              {printModal.remarks && (
                <div className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">General Lab Remarks</span>
                  <p className="text-slate-700 whitespace-pre-wrap">{printModal.remarks}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => {
                const resultsTxt = (printModal.results || []).map((r: any) => {
                  const ref = r.ref_range_text || (r.reference_range_low || r.reference_range_high ? `${r.reference_range_low || ''}–${r.reference_range_high || ''}` : '')
                  const flag = r.flag_status && r.flag_status !== 'normal' ? ` [${r.flag_status.toUpperCase()}]` : (r.is_abnormal ? ' [ABNORMAL]' : '')
                  return `Analyte: ${r.analyte_name}\nValue: ${r.value}${r.unit ? ` ${r.unit}` : ''}${ref ? `\nRef: ${ref}` : ''}${r.remarks ? `\nNote: ${r.remarks}` : ''}${flag ? `\nFlag: ${flag.trim()}` : ''}`
                }).join('\n\n')
                const txt = `Lab Result\nPatient: ${printModal.patient_name || 'Walk-in Patient'}\nLab #: ${printModal.lab_number || '—'}\nTest: ${printModal.test_name}\nSpecimen: ${specimensLabel(printModal) || '—'}\nDate: ${new Date(printModal.created_at).toLocaleString()}\nStatus: ${printModal.status}${printModal.doctor_name ? `\nRequested by: ${printModal.doctor_name}` : ''}${resultsTxt ? '\n\nResults:\n' + resultsTxt : ''}`
                navigator.clipboard?.writeText(txt)
              }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                <Copy size={14} /> Copy
              </button>
              <button onClick={() => printLabReport(printModal, printModal.results || [])} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                <Printer size={14} /> Print
              </button>
              <button onClick={() => setPrintModal(null)} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
