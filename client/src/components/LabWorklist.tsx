import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  FlaskConical, Search, Loader2, CheckCircle, XCircle, AlertTriangle, Plus, X, FileText, Clock, Copy
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

const currentUser: { id: string; name: string; role: string } | null = (() => {
  try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
  return null
})()

const isDoctor = currentUser?.role === 'Doctor'

const statusStyles: Record<string, string> = {
  ordered: 'bg-blue-100 text-blue-700',
  collected: 'bg-amber-100 text-amber-700',
  processing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

const statusLabels: Record<string, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  processing: 'Processing',
  completed: 'Completed',
  collected_results: 'Results Collected',
}

export default function LabWorklist() {
  const [orders, setOrders] = useState<any[]>([])
  const [stats, setStats] = useState({ ordered: 0, collected: 0, processing: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showMyOrders, setShowMyOrders] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [collectModal, setCollectModal] = useState<any | null>(null)
  const [printModal, setPrintModal] = useState<any | null>(null)
  const [analytes, setAnalytes] = useState<{ name: string; value: string; refLow: string; refHigh: string }[]>([{ name: '', value: '', refLow: '', refHigh: '' }])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (isDoctor && !showMyOrders && currentUser?.id) params.set('doctor_id', currentUser.id)
        const paramStr = params.toString()
        const [ordRes, statsRes] = await Promise.all([
          api.get(`/lab-orders${paramStr ? `?${paramStr}` : ''}`).catch(() => ({ data: [] })),
          api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
        ])
        setOrders(ordRes.data || [])
        setStats(statsRes.data || { ordered: 0, collected: 0, processing: 0, completed: 0 })
      } catch (err) { console.error('Failed to load lab worklist:', err) } finally { setLoading(false) }
    }
    load()
  }, [showMyOrders])

  async function handleCollect(id: string) {
    setCollectingId(id)
    try {
      await api.put(`/lab-orders/${id}`, { status: 'collected', collected_at: new Date().toISOString() })
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: 'collected' } : o))
      setStats((prev) => ({ ...prev, ordered: Math.max(0, prev.ordered - 1), collected: prev.collected + 1 }))
    } catch (err) { console.error('Collect failed:', err) } finally { setCollectingId(null) }
  }

  function addAnalyte() {
    setAnalytes((prev) => [...prev, { name: '', value: '', refLow: '', refHigh: '' }])
  }

  function updateAnalyte(idx: number, field: string, val: string) {
    setAnalytes((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a))
  }

  function removeAnalyte(idx: number) {
    setAnalytes((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmitResults() {
    if (!selectedOrder) return
    const valid = analytes.filter((a) => a.name && a.value)
    if (valid.length === 0) return
    setSubmitting(true)
    try {
      for (const a of valid) {
        const isAbnormal = a.refLow && a.refHigh &&
          (parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh))
        await api.post('/lab-results', {
          lab_order_id: selectedOrder.id,
          analyte_name: a.name,
          value: a.value,
          reference_range_low: a.refLow || null,
          reference_range_high: a.refHigh || null,
          is_abnormal: isAbnormal || false,
        })
      }
      setAnalytes([{ name: '', value: '', refLow: '', refHigh: '' }])
      setSelectedOrder(null)
      const [ordRes, statsRes] = await Promise.all([
        api.get('/lab-orders').catch(() => ({ data: [] })),
        api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
      ])
      setOrders(ordRes.data || [])
      setStats(statsRes.data)
    } catch (err) { console.error('Submit results failed:', err) } finally { setSubmitting(false) }
  }

  async function handleMarkCollected() {
    if (!collectModal) return
    try {
      await api.put(`/lab-orders/${collectModal.id}`, { results_collected_at: new Date().toISOString() })
      setOrders((prev) => prev.map((x) => x.id === collectModal.id ? { ...x, results_collected_at: new Date().toISOString() } : x))
      setCollectModal(null)
    } catch (err) { console.error('Mark collected failed:', err) }
  }

  async function openPrintModal(orderId: string) {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    try {
      const res = await api.get(`/lab-results/${orderId}`)
      setPrintModal({ ...order, results: res.data || [] })
    } catch { setPrintModal(order) }
  }

  const filteredOrders = orders.filter((o: any) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (o.patient_name || '').toLowerCase().includes(q) ||
      (o.lab_number || '').toLowerCase().includes(q) ||
      (o.test_name || '').toLowerCase().includes(q) ||
      (o.doctor_name || '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || (statusFilter === 'collected_results' ? !!o.results_collected_at : o.status === statusFilter)
    return matchSearch && matchStatus
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab Worklist</h1>
          <p className="text-sm text-slate-500">Manage lab orders, samples, and results</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Ordered', value: stats.ordered, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Collected', value: stats.collected, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Processing', value: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient, lab #, or test..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          <option value="ordered">Ordered</option>
          <option value="collected">Collected</option>
          <option value="processing">Processing</option>
          <option value="collected_results">Results Collected</option>
        </select>
        {isDoctor && (
          <button onClick={() => setShowMyOrders((p) => !p)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
              showMyOrders ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-primary text-white shadow-md'
            }`}>
            {showMyOrders ? 'All Orders' : 'My Orders'}
          </button>
        )}
      </div>

      {/* Order Cards */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FlaskConical size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No lab orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usePagination(filteredOrders, page).items.map((o: any) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex-shrink-0 ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                    {statusLabels[o.status] || o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                  </span>
                  {o.is_paid === false && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">Unpaid</span>
                  )}
                  {o.is_paid === true && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Paid</span>
                  )}
                  {o.priority && o.priority !== 'routine' && (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0 ${o.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {o.priority.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                  {o.lab_number && <p className="text-xs text-slate-400 font-mono">
                    {o.request_number ? `#${o.request_number} / ${o.order_number}` : `#${o.lab_number}`}
                  </p>}
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    {o.specimen_type && <span>Specimen: {o.specimen_type}</span>}
                    {o.doctor_name && <span>Requested by: {o.doctor_name}</span>}
                    {o.referred_by && !o.doctor_name && <span>Referred by: {o.referred_by}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {o.status === 'ordered' && o.is_paid !== false && (
                    <button onClick={() => handleCollect(o.id)} disabled={collectingId === o.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50">
                      {collectingId === o.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Collect Sample
                    </button>
                  )}
                  {(o.status === 'collected' || o.status === 'ordered') && o.is_paid !== false && !o.results_collected_at && (
                    <button onClick={() => setSelectedOrder(o)}
                      className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100 transition-colors">Enter Results</button>
                  )}
                  {o.status === 'ordered' && o.is_paid === false && (
                    <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed">Awaiting Payment</span>
                  )}
                  {o.status === 'completed' && (
                    <>
                      <button onClick={() => openPrintModal(o.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"><FileText size={12} /> View</button>
                      {o.results_collected_at ? (
                        <span className="text-xs text-sky-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Collected</span>
                      ) : (
                        <button onClick={() => setCollectModal(o)}
                          className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-xs font-medium hover:bg-sky-100 transition-colors">Mark Collected</button>
                      )}
                    </>
                  )}
                  {o.status === 'processing' && o.is_paid !== false && (
                    <button onClick={() => setSelectedOrder(o)}
                      className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100 transition-colors">Enter Results</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={usePagination(filteredOrders, page).totalPages} onChange={setPage} />

      {/* Analyte Entry Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setSelectedOrder(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FlaskConical size={18} className="text-purple-500" /> {selectedOrder.test_name}
              </h2>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-sm text-slate-500">Patient: <strong>{selectedOrder.patient_name || 'Walk-in Patient'}</strong>
                {selectedOrder.lab_number && <span className="text-slate-400 font-mono ml-2">#{selectedOrder.lab_number}</span>}
              </p>
              {analytes.map((a, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Analyte {idx + 1}</span>
                    {analytes.length > 1 && (
                      <button onClick={() => removeAnalyte(idx)} className="text-rose-400 hover:text-rose-600 p-0.5"><X size={14} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Analyte name" value={a.name}
                      onChange={(e) => updateAnalyte(idx, 'name', e.target.value)}
                      className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    <input type="text" placeholder="Value" value={a.value}
                      onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <input type="text" placeholder="Ref low" value={a.refLow}
                        onChange={(e) => updateAnalyte(idx, 'refLow', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <span>–</span>
                      <input type="text" placeholder="Ref high" value={a.refHigh}
                        onChange={(e) => updateAnalyte(idx, 'refHigh', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  </div>
                  {a.refLow && a.refHigh && a.value && (
                    <p className={`text-xs ${(parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh)) ? 'text-rose-600 font-medium' : 'text-emerald-600'}`}>
                      {(parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh)) ? '⚠ Abnormal' : '✓ Within range'}
                    </p>
                  )}
                </div>
              ))}
              <button onClick={addAnalyte}
                className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                <Plus size={14} /> Add another analyte
              </button>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmitResults} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Saving...' : 'Save Results'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Confirmation Modal */}
      {collectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setCollectModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-sky-500" /> Mark as Collected</h2>
              <button onClick={() => setCollectModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Confirm that <strong>{collectModal.patient_name || 'this patient'}</strong> has collected their results?
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Test: {collectModal.test_name} &middot; {collectModal.lab_number ? `#${collectModal.lab_number}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setCollectModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleMarkCollected} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all">
                <CheckCircle size={14} /> Confirm Collected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print / View Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setPrintModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800">SRETAN EMR</h3>
                <p className="text-xs text-slate-400">Laboratory Report</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-medium">{printModal.patient_name || 'Walk-in Patient'}</span>
                  {printModal.lab_number && <span className="text-slate-400 font-mono text-xs">#{printModal.lab_number}{printModal.request_number ? ` / ${printModal.request_number}` : ''}{printModal.order_number ? ` / ${printModal.order_number}` : ''}</span>}
                </div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{printModal.test_name}</span></div>
                <div><span className="text-slate-500">Specimen:</span> <span className="font-medium">{printModal.specimen_type || '—'}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(printModal.created_at).toLocaleString()}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{printModal.status}</span>
                  {printModal.results_collected_at && <span className="ml-2 text-sky-600 text-xs">— Collected {new Date(printModal.results_collected_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
              {printModal.doctor_name && (
                <p className="text-sm text-slate-500">Requested by: <strong>{printModal.doctor_name}</strong></p>
              )}
              {printModal.referred_by && (
                <p className="text-sm text-slate-500">Referred by: <strong>{printModal.referred_by}</strong></p>
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
                          <span className="text-xs text-slate-400">
                            Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}
                          </span>
                          {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                          {r.result_number && <span className="text-xs text-slate-400 font-mono">#{r.result_number}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 text-center pt-3 border-t border-slate-100">This is a computer-generated report.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => {
                const resultsTxt = (printModal.results || []).map((r: any) => `${r.analyte_name}: ${r.value} (Ref: ${r.reference_range_low || '?'}–${r.reference_range_high || '?'})`).join('\n')
                const txt = `SRETAN EMR - Laboratory Report\n#${printModal.lab_number || ''}\nPatient: ${printModal.patient_name || 'Walk-in Patient'}\nTest: ${printModal.test_name}\nSpecimen: ${printModal.specimen_type || '—'}\nDate: ${new Date(printModal.created_at).toLocaleString()}\nStatus: ${printModal.status}\n${resultsTxt ? '\nResults:\n' + resultsTxt : ''}`
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
