import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Scan, Loader2, FileText, X, CheckCircle, XCircle, ArrowLeft, Search, Clock,
} from 'lucide-react'

const staffId = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

export default function RadiologyReview() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/radiology-orders?status=review')
      setItems(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function handleApprove(item: any) {
    setProcessing(item.id)
    try {
      await api.put(`/radiology-orders/${item.id}`, { status: 'completed', approved_by: staffId })
      setItems((prev) => prev.filter((i: any) => i.id !== item.id))
    } catch (err: any) { console.error('Approve failed:', err) } finally { setProcessing(null) }
  }

  async function handleReject(item: any) {
    setProcessing(item.id)
    try {
      await api.put(`/radiology-orders/${item.id}`, { status: 'rejected' })
      setItems((prev) => prev.filter((i: any) => i.id !== item.id))
    } catch (err: any) { console.error('Reject failed:', err) } finally { setProcessing(null) }
  }

  const filtered = items.filter((i: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (i.patient_name || '').toLowerCase().includes(q) || (i.imaging_type || '').toLowerCase().includes(q) || (i.doctor_name || '').toLowerCase().includes(q) || (i.imaging_number || '').toLowerCase().includes(q)
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Scan size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Radiology Review</h1>
          <p className="text-sm text-slate-500">{items.length} pending review</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search patient or imaging type..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <CheckCircle size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No reports pending review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item: any) => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Scan size={15} className="text-purple-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{item.imaging_type}</span>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-purple-100 text-purple-700 flex-shrink-0">In Review</span>
                  {item.imaging_number && <span className="text-xs text-slate-400 font-mono flex-shrink-0">{item.imaging_number}</span>}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{item.patient_name || '—'}</p>
                  <p className="text-xs text-slate-400">Ordered by: {item.doctor_name || '—'}</p>
                  {item.reported_by_name && <p className="text-[10px] text-slate-400">Reported by: {item.reported_by_name} · {new Date(item.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button onClick={() => setDetail(item)}
                    className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"><FileText size={12} className="inline mr-1" />View</button>
                  <button onClick={() => handleReject(item)} disabled={processing === item.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50">
                    {processing === item.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Reject
                  </button>
                  <button onClick={() => handleApprove(item)} disabled={processing === item.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
                    {processing === item.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3"><Scan size={20} className="text-purple-500" /><div><h2 className="text-base font-semibold">{detail.imaging_type}</h2>{detail.imaging_number && <p className="text-xs text-slate-400 font-mono">{detail.imaging_number}</p>}</div></div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">Patient</p><p className="text-sm font-semibold">{detail.patient_name || '—'}</p></div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">Ordered By</p><p className="text-sm font-semibold">{detail.doctor_name || '—'}</p></div>
              </div>
              {detail.reported_by_name && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Reported By</p>
                  <p className="text-sm font-semibold">{detail.reported_by_name}</p>
                  <p className="text-xs text-slate-400 mt-1">{new Date(detail.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Report</h4>
                <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detail.report_text || 'No report'}</div>
              </div>
              {detail.image_path && (
                <div><h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attached Image</h4>
                  <img src={detail.image_path} alt="Radiology" className="max-w-full max-h-60 rounded-xl object-contain cursor-pointer"
                    onClick={() => window.open(detail.image_path, '_blank')}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => handleReject(detail)} disabled={processing === detail.id}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50 transition-colors">
                {processing === detail.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
              </button>
              <button onClick={() => handleApprove(detail)} disabled={processing === detail.id}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {processing === detail.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
