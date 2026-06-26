import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { Scan, Loader2, ArrowLeft, Clock } from 'lucide-react'

export default function RadiologyOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/radiology-orders?is_paid=false')
      setOrders(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Clock size={22} className="text-rose-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Unpaid Radiology Orders</h1>
          <p className="text-sm text-slate-500">{orders.length} pending payment</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
          <Scan size={40} className="mx-auto mb-3 text-emerald-300" />
          <p className="text-sm font-medium">All radiology orders are paid for.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((o: any) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{o.imaging_type}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{o.patient_name || 'Walk-in Patient'}</p>
                  {o.imaging_number && <p className="text-xs text-slate-400 font-mono mt-0.5">#{o.imaging_number}</p>}
                </div>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">Awaiting Payment</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
