import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Scan, Loader2, FileText, X, Search, Clock, ArrowLeft, CheckCircle, FileImage, Printer,
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

const staffId = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

export default function RadiologyResults() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'completed' | 'not-collected' | 'collected'>('completed')
  const [loading, setLoading] = useState(true)
  const [allCompleted, setAllCompleted] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<any>(null)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [imageZoom, setImageZoom] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/radiology-orders?status=completed')
      setAllCompleted(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function handleMarkCollected(order: any) {
    setProcessingId(order.id)
    try {
      await api.put(`/radiology-orders/${order.id}`, { results_collected_at: new Date().toISOString(), results_collected_by: staffId })
      await load()
    } catch (err: any) { console.error('Mark collected failed:', err) } finally { setProcessingId(null) }
  }

  const filterBySearch = (items: any[]) => items.filter((o: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (o.patient_name || '').toLowerCase().includes(q) || (o.imaging_type || '').toLowerCase().includes(q) || (o.doctor_name || '').toLowerCase().includes(q) || (o.imaging_number || '').toLowerCase().includes(q)
  })

  const notCollected = allCompleted.filter((o: any) => !o.results_collected_at && !o.encounter_id)
  const collected = allCompleted.filter((o: any) => o.results_collected_at)

  var currentList = activeTab === 'completed' ? allCompleted : activeTab === 'not-collected' ? notCollected : collected

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><FileText size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Radiology Results</h1>
          <p className="text-sm text-slate-500">{allCompleted.length} completed reports</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{allCompleted.length}</p>
          <p className="text-xs text-slate-500">Total Completed</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{notCollected.length}</p>
          <p className="text-xs text-slate-500">Not Collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-indigo-600">{collected.length}</p>
          <p className="text-xs text-slate-500">Collected</p>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => { setActiveTab('completed'); setPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'completed' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Completed ({allCompleted.length})
        </button>
        <button onClick={() => { setActiveTab('not-collected'); setPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'not-collected' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Not Collected ({notCollected.length})
        </button>
        <button onClick={() => { setActiveTab('collected'); setPage(1) }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'collected' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Collected ({collected.length})
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search by patient, imaging type, or doctor..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {filterBySearch(currentList).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FileText size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No results found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usePagination(filterBySearch(currentList), page).items.map((o: any) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Scan size={15} className="text-indigo-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{o.imaging_type}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex-shrink-0 bg-emerald-100 text-emerald-700`}>Completed</span>
                  {o.imaging_number && <span className="text-xs text-slate-400 font-mono flex-shrink-0">{o.imaging_number}</span>}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                  <p className="text-xs text-slate-400">Ordered by: {o.doctor_name || '—'}</p>
                  {o.reported_by_name && <p className="text-[10px] text-sky-600">Reported by: {o.reported_by_name} &middot; {new Date(o.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button onClick={() => setDetail(o)}
                    className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"><FileText size={12} className="inline mr-1" />View</button>
                  {activeTab === 'not-collected' && !o.encounter_id && (
                    <button onClick={() => handleMarkCollected(o)} disabled={processingId === o.id}
                      className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-xs font-medium hover:bg-sky-100 transition-colors disabled:opacity-50">
                      {processingId === o.id ? <Loader2 size={12} className="animate-spin" /> : null} Mark as Collected
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <Pagination page={page} totalPages={usePagination(filterBySearch(currentList), page).totalPages} onChange={setPage} />
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Scan size={22} className="text-indigo-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{detail.imaging_type}</h2>
                  {detail.imaging_number && <p className="text-xs text-slate-400 font-mono">#{detail.imaging_number}</p>}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold">{detail.patient_name || 'Walk-in Patient'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Ordered By</p>
                  <p className="text-sm font-semibold">{detail.doctor_name || '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(detail.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
              {detail.reported_by_name && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Scan size={14} className="text-indigo-600" />
                    <p className="text-xs text-slate-500">Radiologist / Reported By</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{detail.reported_by_name}</p>
                  {detail.reported_at && <p className="text-xs text-slate-500 mt-0.5">Reported on: {new Date(detail.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium capitalize text-emerald-700 flex items-center gap-1"><CheckCircle size={14} /> Completed</span>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText size={12} /> Radiology Report</h4>
                <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[80px]">{detail.report_text || 'No report available'}</div>
              </div>
              {detail.image_path && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileImage size={12} /> Attached Image</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setViewImage(detail.image_path)}>
                    <img src={detail.image_path} alt="Radiology image"
                      className="max-w-full max-h-80 rounded-lg object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm text-slate-400 py-4">Image not available</p>' }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">Click image to view full screen</p>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                  <Printer size={14} /> Print Report
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setDetail(null)} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Image Viewer */}
      {viewImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={() => { setViewImage(null); setImageZoom(false) }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-black/60 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-white">
              <Scan size={20} className="text-indigo-400" />
              <div>
                <p className="text-sm font-semibold">{detail?.patient_name || 'Patient'}</p>
                <p className="text-xs text-slate-400">{detail?.imaging_type} {detail?.imaging_number ? `· ${detail.imaging_number}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setImageZoom(!imageZoom)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${imageZoom ? 'bg-white text-slate-800' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                {imageZoom ? 'Fit to Screen' : 'Zoom In'}
              </button>
              <button onClick={() => { setViewImage(null); setImageZoom(false) }}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X size={22} className="text-white" />
              </button>
            </div>
          </div>
          {/* Image area */}
          <div className={`flex-1 p-6 overflow-auto ${imageZoom ? 'block' : 'flex items-center justify-center'}`} onClick={(e) => e.stopPropagation()}>
            <img src={viewImage} alt="Radiology image"
              className={`transition-all duration-300 ${imageZoom ? 'w-auto h-auto max-w-none max-h-none cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in'}`}
              onClick={() => setImageZoom(!imageZoom)}
              style={imageZoom ? { maxWidth: 'none', maxHeight: 'none', width: 'auto', height: 'auto', minWidth: '80vw', minHeight: '80vh' } : {}} />
          </div>
        </div>
      )}
    </div>
  )
}
