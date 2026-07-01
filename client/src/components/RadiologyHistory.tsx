import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import {
  Scan, Loader2, FileText, X, Search, Clock, ArrowLeft, User, Calendar
} from 'lucide-react'

export default function RadiologyHistory() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/radiology-orders').catch(() => ({ data: [] }))
      setOrders(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  const filtered = orders.filter((o: any) => {
    if (search) {
      var q = search.toLowerCase()
      if (!(o.patient_name || '').toLowerCase().includes(q) && !(o.imaging_type || '').toLowerCase().includes(q) && !(o.doctor_name || '').toLowerCase().includes(q) && !(o.imaging_number || '').toLowerCase().includes(q)) return false
    }
    if (fromDate && new Date(o.created_at) < new Date(fromDate)) return false
    if (toDate && new Date(o.created_at) > new Date(toDate + 'T23:59:59')) return false
    return true
  })

  const totalCount = filtered.length
  const completedCount = filtered.filter((o) => o.status === 'completed').length
  const uniquePatients = new Set(filtered.map((o: any) => o.patient_name).filter(Boolean)).size

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Clock size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Radiology History</h1>
          <p className="text-sm text-slate-500">{orders.length} total orders</p>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-slate-800">{totalCount}</p>
            <p className="text-xs text-slate-500">Filtered Orders</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-indigo-600">{uniquePatients}</p>
            <p className="text-xs text-slate-500">Unique Patients</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient, imaging type, or doctor..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-slate-400" />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FileText size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o: any) => (
            <div key={o.id} onClick={() => setDetail(o)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Scan size={15} className="text-indigo-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{o.imaging_type}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex-shrink-0 ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : o.status === 'processing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {o.status?.charAt(0).toUpperCase() + o.status?.slice(1)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                  <p className="text-xs text-slate-400">{o.doctor_name ? `Ordered by: ${o.doctor_name}` : ''} {o.imaging_number ? `· ${o.imaging_number}` : ''}</p>
                  {o.doctor_comment && <DoctorComment comment={o.doctor_comment} />}
                </div>
                <span className="text-xs text-primary font-medium">&rarr;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Scan size={20} className="text-indigo-500" />
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{detail.imaging_type}</h2>
                  {detail.imaging_number && <p className="text-xs text-slate-400 font-mono">{detail.imaging_number}</p>}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold">{detail.patient_name || 'Walk-in Patient'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Ordered By</p>
                  <p className="text-sm font-semibold">{detail.doctor_name || '—'}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium capitalize">{detail.status}</span>
              </div>
              {detail.doctor_comment && <DoctorComment comment={detail.doctor_comment} />}
              {detail.reported_by_name && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Reported By</p>
                  <p className="text-sm font-semibold">{detail.reported_by_name}</p>
                  {detail.reported_at && <p className="text-xs text-slate-400 mt-1">{new Date(detail.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              )}
              {detail.report_text && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Report</h4>
                  <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detail.report_text}</div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setDetail(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
