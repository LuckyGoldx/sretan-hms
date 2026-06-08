import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  AlertTriangle, Package, Loader2, Clock, ArrowLeft, CheckCircle
} from 'lucide-react'

export default function LabLowStock() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/inventory?category=lab&below_reorder=true').then((r) => { setItems(r.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/lab')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle size={22} className="text-amber-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Low Stock Monitor — Lab</h1>
          <p className="text-sm text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''} below reorder level</p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-50 border border-rose-200">
          <AlertTriangle size={20} className="text-rose-500" />
          <p className="text-sm text-rose-700 font-medium">These lab supplies need to be restocked soon.</p>
          <button onClick={() => navigate('/lab-inventory')} className="ml-auto text-sm text-rose-600 underline font-medium">Manage Inventory</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <CheckCircle size={48} className="text-emerald-300 mb-3" />
          <p className="text-sm font-medium">All lab supplies are well-stocked</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Item</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Batch</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Stock</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Reorder Level</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <tr key={item.id} className="bg-rose-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{item.drug_name}</td>
                    <td className="px-5 py-3.5 text-slate-500">{item.batch_number || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 text-xs font-semibold">{item.stock_count}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{item.reorder_level}</td>
                    <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
