import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, Search, Loader2, ArrowLeft, Baby, Calendar, Filter, X } from 'lucide-react'

export default function MaternityLabourSummary() {
  const navigate = useNavigate()
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null)
  const totalPages = Math.ceil(total / limit)

  async function loadDeliveries() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)
      if (statusFilter) params.append('status', statusFilter)
      params.append('page', String(page))
      params.append('limit', String(limit))
      const res = await fetch(`/api/maternity-deliveries?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setDeliveries(Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadDeliveries() }, [dateFrom, dateTo, statusFilter, page])

  const filtered = deliveries.filter((d) =>
    !search || d.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.hospital_number?.toLowerCase().includes(search.toLowerCase())
  )

  async function viewDetail(delivery: any) {
    try {
      const res = await fetch(`/api/maternity-deliveries/${delivery.id}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setSelectedDelivery(data)
    } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity/labour')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><List size={22} className="text-indigo-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Labour Summary</h1>
          <p className="text-sm text-slate-500">All delivery records</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patients..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none">
          <option value="">All Status</option>
          <option value="active">In Labour</option>
          <option value="completed">Delivered</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <List size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No delivery records found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => viewDetail(d)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Baby size={18} className="text-indigo-600" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{d.patient_name}</p>
                    <p className="text-xs text-slate-400">{d.hospital_number}</p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                    d.status === 'active' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  }`}>{d.status === 'active' ? 'In Labour' : 'Delivered'}</span>
                  {d.delivery_date && <p className="text-slate-400 mt-1">{d.delivery_date?.slice(0, 10)}</p>}
                  {d.delivery_type && <p className="text-slate-500 mt-0.5">{d.delivery_type} · {d.newborn_count || 0} newborn{(d.newborn_count || 0) !== 1 ? 's' : ''}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {selectedDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDelivery(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Delivery Details — {selectedDelivery.patient_name}</h2>
              <button onClick={() => setSelectedDelivery(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Delivery Date</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.delivery_date?.slice(0, 10) || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Delivery Time</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.delivery_time || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Type</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.delivery_type || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Place</p>
                  <p className="font-semibold mt-0.5 capitalize">{selectedDelivery.delivery_place?.replace('_', ' ') || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Perineum</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.perineum_status?.replace(/_/g, ' ') || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Placenta</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.placenta_delivery?.replace(/_/g, ' ') || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Blood Loss</p>
                  <p className="font-semibold mt-0.5">{selectedDelivery.blood_loss_ml ? `${selectedDelivery.blood_loss_ml} mL` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Outcome</p>
                  <p className="font-semibold mt-0.5 capitalize">{selectedDelivery.outcome?.replace(/_/g, ' ') || '—'}</p>
                </div>
              </div>
              {selectedDelivery.complication && selectedDelivery.complication !== 'none' && (
                <div className="bg-rose-50 rounded-xl p-3">
                  <p className="text-[10px] text-rose-500 font-medium uppercase mb-1">Complication</p>
                  <p className="text-sm text-rose-700">{selectedDelivery.complication?.replace(/_/g, ' ')}{selectedDelivery.complication_notes ? ` — ${selectedDelivery.complication_notes}` : ''}</p>
                </div>
              )}
              {selectedDelivery.delivered_by_name && (
                <p className="text-xs text-slate-400">Delivered by: <span className="font-medium text-slate-600">{selectedDelivery.delivered_by_name}</span></p>
              )}
              {selectedDelivery.newborns && selectedDelivery.newborns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Newborn{selectedDelivery.newborns.length > 1 ? 's' : ''}</p>
                  {selectedDelivery.newborns.map((nb: any) => (
                    <div key={nb.id} className="bg-pink-50 rounded-xl p-3 mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Baby size={14} className="text-pink-500" />
                        <span className="text-sm font-semibold text-slate-800">{nb.baby_name || `Baby #${nb.baby_number}`}</span>
                        <span className="text-xs text-slate-400">{nb.baby_sex || ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="text-slate-500">Weight: <strong>{nb.birth_weight} kg</strong></span>
                        <span className="text-slate-500">Length: <strong>{nb.birth_length || '—'} cm</strong></span>
                        <span className="text-slate-500">APGAR: <strong>{nb.apgar_1min != null ? `${nb.apgar_1min}/${nb.apgar_5min || '?'}/${nb.apgar_10min || '?'}` : '—'}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedDelivery.partograph && selectedDelivery.partograph.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Partograph ({selectedDelivery.partograph.length} entries)</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedDelivery.partograph.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
                        <span className="font-medium">{new Date(p.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>Cx: {p.cervical_dilation}cm</span>
                        <span>Desc: {p.descent}</span>
                        <span>FHR: {p.fetal_heart_rate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setSelectedDelivery(null)} className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
