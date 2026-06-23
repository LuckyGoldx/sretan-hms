import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import type { InventoryItem } from '../types'
import {
  Clock, AlertTriangle, Loader2, CheckCircle, ArrowLeft, Package
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function ExpiryMonitor() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<InventoryItem[]>('/inventory?category=pharmacy')
      const expiring = (data || []).filter((i) => {
        if (!i.expiry_date) return false
        const days = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
        return days >= 0 && days <= 30
      }).sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())
      setItems(expiring)
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function formatDate(d: string) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Clock size={22} className="text-rose-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Expiry Monitor</h1>
          <p className="text-sm text-slate-500">Items expiring within 30 days</p>
        </div>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle size={48} className="text-emerald-300 mb-3" />
          <p className="text-sm font-medium">No items expiring within 30 days</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-50 border border-rose-200">
            <AlertTriangle size={18} className="text-rose-500" />
            <p className="text-sm text-rose-700 font-medium">{items.length} item{items.length !== 1 ? 's' : ''} nearing expiry — review and plan restock.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Drug Name</th>
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
                    return (
                      <tr key={item.id} className={days <= 7 ? 'bg-rose-50' : 'bg-amber-50'}>
                        <td className="px-5 py-3.5 font-medium text-slate-800">{item.drug_name}</td>
                        <td className="px-5 py-3.5 text-slate-600">{item.batch_number || '—'}</td>
                        <td className="px-5 py-3.5">{item.stock_count}</td>
                        <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-700 font-medium">{formatDate(item.expiry_date)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                            days <= 7 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            <AlertTriangle size={10} />
                            {days <= 7 ? `${days}d — Critical` : `${days}d — Soon`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400 bg-white rounded-2xl border border-slate-100 p-4">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-50 border border-rose-200" /> Critical (&le;7 days)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> Warning (8&ndash;30 days)</span>
          </div>
        </>
      )}

      <button onClick={() => navigate('/pharmacy-inventory')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
        <Package size={16} /> Go to Pharmacy Inventory
      </button>
    </div>
  )
}
