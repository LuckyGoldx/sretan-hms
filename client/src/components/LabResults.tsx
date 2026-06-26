import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  FlaskConical, Search, Loader2, CheckCircle, XCircle, FileText, X, AlertTriangle, Clock, Copy, Users
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
  const [printModal, setPrintModal] = useState<any | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

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
        pendingApproval: (draftRes.data || []).length,
        totalCompleted: allComplete.length,
        notCollected: allComplete.filter((o: any) => !o.results_collected_at && !o.encounter_id).length,
        collected: allComplete.filter((o: any) => o.results_collected_at).length,
        completedToday: completedToday.length,
      })
    } catch {}
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadDrafts(), loadCompletedCollected(), loadStats()])
    setLoading(false)
  }, [loadDrafts, loadCompletedCollected, loadStats])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleApprove(id: string) {
    setProcessingId(id)
    try {
      await api.put(`/lab-results/${id}/approve`, { approved_by: staffId })
      await loadAll()
    } catch (err: any) { console.error('Approve failed:', err) } finally { setProcessingId(null) }
  }

  async function handleReject(id: string) {
    setProcessingId(id)
    try {
      await api.put(`/lab-results/${id}/reject`)
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
      const res = await api.get(`/lab-results/${order.id}?status=completed`)
      setPrintModal({ ...order, results: res.data || [] })
    } catch { setPrintModal(order) }
  }

  const filterBySearch = (items: any[]) => items.filter((o: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (o.patient_name || '').toLowerCase().includes(q) || (o.test_name || '').toLowerCase().includes(q) || (o.lab_number || '').toLowerCase().includes(q)
  })

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
              {usePagination(drafts, pendingPage).items.map((d: any) => (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-800 truncate">{d.test_name}</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">Draft</span>
                    </div>
                  </div>
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{d.patient_name || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="font-medium">{d.analyte_name}</span>
                        <span className={`ml-2 font-bold ${d.is_abnormal ? 'text-rose-600' : 'text-slate-700'}`}>{d.value}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Ref: {d.reference_range_low || '?'}–{d.reference_range_high || '?'}
                        {d.is_abnormal && <AlertTriangle size={12} className="inline ml-1 text-rose-500" />}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <button onClick={() => handleReject(d.id)} disabled={processingId === d.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50">
                        {processingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Reject
                      </button>
                      <button onClick={() => handleApprove(d.id)} disabled={processingId === d.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
                        {processingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <Pagination page={pendingPage} totalPages={usePagination(drafts, pendingPage).totalPages} onChange={setPendingPage} />
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
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name, test, or lab #..." value={search} onChange={(e) => { setSearch(e.target.value); setCompletedPage(1) }}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {allCompleted.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckCircle size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No completed results</p>
              <p className="text-xs mt-1">All completed lab results will appear here</p>
            </div>
          ) : (
            <>
              {filterBySearch(allCompleted).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No results match your search</p>
              ) : (
                usePagination(filterBySearch(allCompleted), completedPage).items.map((o: any) => (
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
              <Pagination page={completedPage} totalPages={usePagination(filterBySearch(allCompleted), completedPage).totalPages} onChange={setCompletedPage} />
            </>
          )}
        </div>
      )}

      {/* View/Print Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setPrintModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Patient:</span> <span className="font-medium">{printModal.patient_name || 'Walk-in Patient'}</span></div>
                <div><span className="text-slate-500">Lab #:</span> <span className="font-medium font-mono">{printModal.lab_number || '—'}</span></div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{printModal.test_name}</span></div>
                <div><span className="text-slate-500">Specimen:</span> <span className="font-medium">{printModal.specimen_type || '—'}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(printModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{printModal.status}</span></div>
              </div>
              {printModal.doctor_name && (
                <p className="text-sm text-slate-500">Requested by: <strong>{printModal.doctor_name}</strong></p>
              )}

              {printModal.results && printModal.results.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {printModal.results.map((r: any) => (
                      <div key={r.id} className={`px-4 py-3 flex items-center justify-between text-sm ${r.is_abnormal ? 'bg-rose-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-medium text-slate-700">{r.analyte_name}</span>
                          <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-slate-400">Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}</span>
                          {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!printModal.results || printModal.results.length === 0) && (
                <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => {
                const resultsTxt = (printModal.results || []).map((r: any) => `${r.analyte_name}: ${r.value} (Ref: ${r.reference_range_low || '?'}–${r.reference_range_high || '?'})${r.is_abnormal ? ' [ABNORMAL]' : ''}`).join('\n')
                const txt = `Lab Result\nPatient: ${printModal.patient_name || 'Walk-in Patient'}\nLab #: ${printModal.lab_number || '—'}\nTest: ${printModal.test_name}\nSpecimen: ${printModal.specimen_type || '—'}\nDate: ${new Date(printModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}\nStatus: ${printModal.status}${printModal.doctor_name ? `\nRequested by: ${printModal.doctor_name}` : ''}${resultsTxt ? '\n\nResults:\n' + resultsTxt : ''}`
                navigator.clipboard?.writeText(txt)
              }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                <Copy size={14} /> Copy
              </button>
              <button onClick={() => setPrintModal(null)} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
