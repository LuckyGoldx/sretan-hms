import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import ConsultantTag from './ConsultantTag'
import {
  FlaskConical, Search, Loader2, CheckCircle, Clock, FileText, X, AlertTriangle, ArrowLeft
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
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
    </div>
  )
}

const currentUser: { id: string; name: string; role: string } | null = (() => {
  try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
  return null
})()

export default function DoctorLabResults() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [viewModal, setViewModal] = useState<any | null>(null)
  const [viewResults, setViewResults] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (currentUser?.id) params.set('doctor_id', currentUser.id)
        const res = await api.get(`/lab-orders?${params}`)
        setOrders(res.data || [])
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = orders.filter((o: any) => {
    const q = search.toLowerCase()
    const matchSearch = (o.patient_name || '').toLowerCase().includes(q) ||
      (o.test_name || '').toLowerCase().includes(q) ||
      (o.lab_number || '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const sorted = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const isUnread = (o: any) => o.status === 'completed' && !o.doctor_read_at

  async function openView(order: any) {
    setViewModal(order)
    setViewResults([])
    try {
      const res = await api.get(`/lab-results/${order.id}`)
      setViewResults(res.data || [])
    } catch {}
    if (isUnread(order)) {
      try {
        await api.post('/lab-orders/mark-read', { ids: [order.id] })
        setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, doctor_read_at: new Date().toISOString() } : o))
      } catch {}
    }
  }

  const unreadCount = orders.filter(isUnread).length

  const stats = {
    ordered: orders.filter((o) => o.status === 'ordered').length,
    processing: orders.filter((o) => o.status === 'processing' || o.status === 'collected').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    unread: unreadCount,
    total: orders.length,
  }

  const statusStyles: Record<string, string> = {
    ordered: 'bg-blue-100 text-blue-700',
    collected: 'bg-amber-100 text-amber-700',
    processing: 'bg-purple-100 text-purple-700',
    completed: 'bg-emerald-100 text-emerald-700',
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Lab Results</h1>
          <p className="text-sm text-slate-500">Tests and results you requested</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Requested', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Pending', value: stats.ordered, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Processing', value: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Unread', value: stats.unread, color: 'text-rose-600', bg: 'bg-rose-100' },
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
          <input type="text" placeholder="Search patient, test, or lab #..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          <option value="ordered">Requested</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FlaskConical size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">{search || statusFilter ? 'No matching results' : 'No lab tests requested yet'}</p>
          <p className="text-xs mt-1">Order lab tests from the Consultation page</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usePagination(sorted, page).items.map((o: any) => {
            const dt = new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            return (
              <div key={o.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${isUnread(o) ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'}`}>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FlaskConical size={15} className="text-purple-500" />
                    {isUnread(o) && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                    <span className={`text-sm font-semibold ${isUnread(o) ? 'text-slate-900' : 'text-slate-800'}`}>{o.test_name}</span>
                    {(o.is_consultation || o.doctor_role === 'Consultant') && (
                      <ConsultantTag departmentName={o.department_name} />
                    )}
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                      {o.status === 'processing' ? 'Processing' : o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{dt}</span>
                </div>
                <div className="px-5 py-3 flex items-center justify-between border-t border-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{o.patient_name || '—'}</p>
                    {o.lab_number && <p className="text-xs text-slate-400 font-mono">#{o.lab_number}</p>}
                  </div>
                  {o.status === 'completed' ? (
                    <button onClick={() => openView(o)} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors flex items-center gap-1">
                      <FileText size={12} /> View Results
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{o.specimen_type ? `Specimen: ${o.specimen_type}` : ''}</span>
                  )}
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={usePagination(sorted, page).totalPages} onChange={setPage} />
        </div>
      )}

      {/* Result View Modal */}
      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setViewModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Patient:</span> <span className="font-medium">{viewModal.patient_name || '—'}</span></div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{viewModal.test_name}</span></div>
                <div><span className="text-slate-500">Requested:</span> <span className="font-medium">{new Date(viewModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{viewModal.status}</span></div>
              </div>

              {viewResults.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {viewResults.map((r: any) => (
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
              {viewResults.length === 0 && viewModal.status === 'completed' && (
                <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end">
              <button onClick={() => setViewModal(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
