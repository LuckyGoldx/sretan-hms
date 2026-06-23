import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { Scan, Loader2, Clock, AlertTriangle, ArrowLeft, Package } from 'lucide-react'

export default function RadiologyExpiry() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/inventory?category=radiology')
        if (cancelled) return
        const now = Date.now()
        const filtered = (data || []).filter((i: any) => {
          if (!i.expiry_date) return false
          const days = Math.ceil((new Date(i.expiry_date).getTime() - now) / 86400000)
          return days >= 0 && days <= 30
        })
        filtered.sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())
        setItems(filtered)
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const critical = items.filter((i) => {
    const days = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
    return days <= 7
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center">
          <Clock size={28} className="text-rose-500" />
        </div>
        <p className="text-sm text-rose-600 font-medium">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Retry</button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Clock size={22} className="text-rose-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Radiology Expiry Monitor</h1>
          <p className="text-sm text-slate-500">{items.length} items expiring within 30 days &middot; {critical.length} critical</p>
        </div>
      </div>

      {critical.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-50 border border-rose-200">
          <AlertTriangle size={18} className="text-rose-600" />
          <p className="text-sm text-rose-700 font-medium">{critical.length} item(s) expiring within 7 days — take action!</p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Clock size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No radiology supplies expiring soon</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Item</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Batch #</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Stock</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Supplier</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Expiry Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => {
                  const days = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / 86400000)
                  const isCritical = days <= 7
                  return (
                    <tr key={item.id} className={`${isCritical ? 'bg-rose-50' : 'bg-amber-50'} hover:bg-opacity-80`}>
                      <td className="px-5 py-3.5 font-medium text-slate-800">{item.drug_name}</td>
                      <td className="px-5 py-3.5 text-slate-600">{item.batch_number || '—'}</td>
                      <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${item.stock_count <= item.reorder_level ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.stock_count}</span></td>
                      <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">{new Date(item.expiry_date).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${isCritical ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {days}d — {isCritical ? 'Critical' : 'Soon'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button onClick={() => navigate('/radiology-inventory')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
        <Package size={16} /> Manage Radiology Inventory
      </button>
    </div>
  )
}
