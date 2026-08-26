import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  FlaskConical, Search, Loader2, AlertTriangle, X, FileText, Clock, Calendar
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
  if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i) }
  else if (page <= 3) { for (let i = 1; i <= maxVisible; i++) pages.push(i) }
  else if (page >= totalPages - 2) { for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i) }
  else { for (let i = page - 2; i <= page + 2; i++) pages.push(i) }
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
    </div>
  )
}

export default function LabHistory() {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [viewModal, setViewModal] = useState<any | null>(null)
  const [viewDetails, setViewDetails] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await api.get('/lab-results?status=completed')
        setResults(res.data || [])
      } catch (err) { console.error('Failed to load lab history:', err) } finally { setLoading(false) }
    }
    load()
  }, [])

  const totalResults = results.length
  const abnormals = results.filter((r: any) => r.is_abnormal).length
  const uniquePatients = new Set(results.map((r: any) => r.patient_name)).size

  const filtered = results.filter((r: any) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.test_name || '').toLowerCase().includes(q) ||
      (r.result_number || '').toLowerCase().includes(q)
    const matchFrom = !dateFrom || new Date(r.approved_at || r.created_at) >= new Date(dateFrom)
    const matchTo = !dateTo || new Date(r.approved_at || r.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchFrom && matchTo
  })

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.approved_at || b.created_at).getTime() - new Date(a.approved_at || a.created_at).getTime()
  )

  async function openView(r: any) {
    setViewModal(r)
    setViewDetails([])
    setLoadingDetails(true)
    try {
      const res = await api.get(`/lab-results/${r.lab_order_id}`)
      setViewDetails(res.data || [])
    } catch (err) { console.error('Failed to load details:', err) } finally { setLoadingDetails(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab History</h1>
          <p className="text-sm text-slate-500">Completed lab results and past work</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">{totalResults}</p>
          <p className="text-xs text-slate-500">Total Results</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-rose-600">{abnormals}</p>
          <p className="text-xs text-slate-500">Abnormals</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{uniquePatients}</p>
          <p className="text-xs text-slate-500">Unique Patients</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient, test, or result #..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary bg-white"
          />
          <span className="text-xs text-slate-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary bg-white"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <Clock size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No lab history yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usePagination(sorted, page).items.map((r: any) => (
            <div
              key={r.id}
              onClick={() => openView(r)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{r.test_name}</span>
                  {r.result_number && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-600 flex-shrink-0 font-mono">
                      #{r.result_number}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">
                  {r.approved_at
                    ? new Date(r.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{r.patient_name || '—'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-sm font-semibold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-700'}`}>
                      {r.analyte_name}: {r.value}
                    </span>
                    {(r.reference_range_low || r.reference_range_high) && (
                      <span className="text-xs text-slate-400">
                        Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}
                      </span>
                    )}
                    {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {r.approved_by && (
                    <span className="text-xs text-slate-400 truncate max-w-[120px]">
                      {r.approved_by}
                    </span>
                  )}
                  <FileText size={14} className="text-slate-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={usePagination(sorted, page).totalPages} onChange={setPage} />

      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-primary" /> {viewModal.test_name}
              </h2>
              <button onClick={() => setViewModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800">MACHOKO MEMORIAL HOSPITAL</h3>
                <p className="text-xs text-slate-400">Machoko Diamond Plaza, Mile 6 Road Bye-Pass, Jalingo, Taraba State</p>
                <p className="text-xs text-slate-400">Tel: 0802900231, 07068855750, 08068862666</p>
                <p className="text-xs text-slate-400">Laboratory Report</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-medium">{viewModal.patient_name || '—'}</span>
                  {viewModal.result_number && <span className="text-slate-400 font-mono text-xs">#{viewModal.result_number}</span>}
                </div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{viewModal.test_name}</span></div>
                <div><span className="text-slate-500">Approved by:</span> <span className="font-medium">{viewModal.approved_by || '—'}</span></div>
                <div><span className="text-slate-500">Approved at:</span> <span className="font-medium">{viewModal.approved_at ? new Date(viewModal.approved_at).toLocaleString() : '—'}</span></div>
              </div>

              {loadingDetails ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-primary" /></div>
              ) : viewDetails.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">All Analytes</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {viewDetails.map((d: any) => (
                      <div key={d.id} className={`px-4 py-3 flex items-center justify-between text-sm ${d.is_abnormal ? 'bg-rose-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-medium text-slate-700">{d.analyte_name}</span>
                          <span className={`font-bold ${d.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{d.value}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-slate-400">
                            Ref: {d.reference_range_low || '?'}–{d.reference_range_high || '?'}
                          </span>
                          {d.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                  {viewDetails.some((d: any) => d.approved_by) && (
                    <p className="text-xs text-slate-400 mt-2">
                      Approved by: {viewDetails.find((d: any) => d.approved_by)?.approved_by || viewModal.approved_by}
                      {viewDetails.some((d: any) => d.approved_at) && (
                        <> &middot; {new Date(viewDetails.find((d: any) => d.approved_at)?.approved_at || viewModal.approved_at).toLocaleString()}</>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
              )}

              <p className="text-xs text-slate-400 text-center pt-3 border-t border-slate-100">This is a computer-generated report.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  const txt = viewDetails.map((d: any) => `${d.analyte_name}: ${d.value} (Ref: ${d.reference_range_low || '?'}–${d.reference_range_high || '?'})`).join('\n')
                  navigator.clipboard?.writeText(
                    `MACHOKO MEMORIAL HOSPITAL - Laboratory Report\nPatient: ${viewModal.patient_name}\nTest: ${viewModal.test_name}\nApproved by: ${viewModal.approved_by || '—'}\nDate: ${viewModal.approved_at ? new Date(viewModal.approved_at).toLocaleString() : '—'}\n\nResults:\n${txt}`
                  )
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Copy
              </button>
              <button onClick={() => setViewModal(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
