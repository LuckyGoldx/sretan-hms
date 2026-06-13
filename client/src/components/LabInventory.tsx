import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Package, Search, Loader2, Plus, X, AlertTriangle, ArrowLeft, DollarSign, ChevronUp, ChevronDown
} from 'lucide-react'

type SortKey = 'drug_name' | 'stock_count' | 'reorder_level' | 'supplier'

const currentRole: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()

export default function LabInventory() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('drug_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ drug_name: '', batch_number: '', stock_count: '', reorder_level: '10', supplier: '', amount_type: 'units', unit_price: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/inventory?category=lab').then((r) => { setItems(r.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  const filtered = items.filter((i) =>
    i.drug_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.supplier || '').toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const d = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'stock_count' || sortKey === 'reorder_level') return (Number(a[sortKey]) - Number(b[sortKey])) * d
    return ((a[sortKey] || '').localeCompare(b[sortKey] || '')) * d
  })

  const lowStock = items.filter((i) => i.stock_count <= i.reorder_level)

  async function handleAdd() {
    if (!form.drug_name) { setError('Item name is required'); return }
    setAdding(true); setError('')
    try {
      await api.post('/inventory', {
        drug_name: form.drug_name.trim(),
        batch_number: form.batch_number.trim() || undefined,
        stock_count: parseInt(form.stock_count) || 0,
        reorder_level: parseInt(form.reorder_level) || 10,
        supplier: form.supplier.trim() || undefined,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : undefined,
        category: 'lab',
      })
      setShowAdd(false)
      setForm({ drug_name: '', batch_number: '', stock_count: '', reorder_level: '10', supplier: '', amount_type: 'units', unit_price: '' })
      const r = await api.get('/inventory?category=lab')
      setItems(r.data || [])
    } catch (err: any) { setError(err.response?.data?.message || 'Failed') } finally { setAdding(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/lab')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Package size={22} className="text-purple-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lab Inventory</h1>
            <p className="text-sm text-slate-500">{items.length} items &middot; {lowStock.length} low stock</p>
          </div>
        </div>
        {currentRole === 'Admin' && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
            <Plus size={16} /> Add Item
          </button>
        )}
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={18} className="text-amber-600" />
          <p className="text-sm text-amber-700 font-medium">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} below reorder level</p>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <Package size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No lab inventory items</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {[
                    { key: 'drug_name', label: 'Item' },
                    { key: 'stock_count', label: 'Stock' },
                    { key: 'reorder_level', label: 'Reorder' },
                    { key: 'supplier', label: 'Supplier' },
                  ].map((h) => (
                    <th key={h.key} onClick={() => toggleSort(h.key as SortKey)}
                      className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                      {h.label} {sortIcon(h.key as SortKey)}
                    </th>
                  ))}
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Batch</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Amount Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((item) => (
                  <tr key={item.id} className={`${item.stock_count <= item.reorder_level ? 'bg-rose-50' : ''} hover:bg-slate-50`}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{item.drug_name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        item.stock_count <= item.reorder_level ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>{item.stock_count}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{item.reorder_level}</td>
                    <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{item.batch_number || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-400">{item.amount_type || 'units'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!adding) setShowAdd(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Plus size={18} /> Add Lab Inventory Item</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Item Name *', key: 'drug_name', placeholder: 'e.g. CBC Reagent Kit' },
                { label: 'Batch Number', key: 'batch_number', placeholder: 'e.g. LOT-2026-001' },
                { label: 'Stock Count', key: 'stock_count', type: 'number', placeholder: 'e.g. 50' },
                { label: 'Reorder Level', key: 'reorder_level', type: 'number', placeholder: 'e.g. 10' },
                { label: 'Supplier', key: 'supplier', placeholder: 'e.g. MedSupply Ltd' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={(form as any)[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              ))}
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdd} disabled={adding}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
