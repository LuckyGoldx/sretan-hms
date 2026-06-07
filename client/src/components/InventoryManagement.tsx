import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import type { InventoryItem } from '../types'
import {
  Package, PlusCircle, Loader2, AlertTriangle, X, ChevronUp, ChevronDown, ArrowLeft
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type SortKey = 'drug_name' | 'batch_number' | 'stock_count' | 'reorder_level' | 'expiry_date'

interface InvModal {
  open: boolean
  drug_name: string
  batch_number: string
  stock_count: string
  reorder_level: string
  expiry_date: string
  supplier: string
}

export default function InventoryManagement() {
  const navigate = useNavigate()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('drug_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [modal, setModal] = useState<InvModal>({ open: false, drug_name: '', batch_number: '', stock_count: '', reorder_level: '', expiry_date: '', supplier: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get<InventoryItem[]>('/inventory'); setInventory(data || []) }
    catch { setInventory([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  const sorted = [...inventory].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'stock_count' || sortKey === 'reorder_level') return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
    if (sortKey === 'expiry_date') return (new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()) * dir
    return (a[sortKey] as string).localeCompare(b[sortKey] as string) * dir
  })

  function rowClass(item: InventoryItem) {
    if (item.stock_count < item.reorder_level) return 'bg-red-50'
    if (item.stock_count > item.reorder_level * 2) return 'bg-emerald-50'
    return ''
  }

  async function handleAdd() {
    if (!modal.drug_name.trim() || !modal.stock_count) { setError('Drug name and stock count are required'); return }
    setAdding(true); setError(null)
    try {
      await api.post('/inventory', {
        drug_name: modal.drug_name.trim(), batch_number: modal.batch_number.trim() || undefined,
        stock_count: parseInt(modal.stock_count, 10), reorder_level: modal.reorder_level ? parseInt(modal.reorder_level, 10) : undefined,
        expiry_date: modal.expiry_date || undefined, supplier: modal.supplier.trim() || undefined,
      })
      setModal({ open: false, drug_name: '', batch_number: '', stock_count: '', reorder_level: '', expiry_date: '', supplier: '' })
      fetch()
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to add item') } finally { setAdding(false) }
  }

  const lowStockCount = inventory.filter((i) => i.stock_count <= i.reorder_level).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Package size={22} className="text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Inventory</h1>
            <p className="text-sm text-slate-500">Manage stock and supplies</p>
          </div>
        </div>
        <button onClick={() => setModal({ open: true, drug_name: '', batch_number: '', stock_count: '', reorder_level: '', expiry_date: '', supplier: '' })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <PlusCircle size={16} /> Add Item
        </button>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={18} className="text-amber-600" />
          <p className="text-sm text-amber-700 font-medium">{lowStockCount} item{lowStockCount !== 1 ? 's' : ''} below reorder level</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No inventory items</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {(['drug_name', 'batch_number', 'stock_count', 'reorder_level', 'expiry_date', 'supplier'] as SortKey[]).map((key) => (
                    <th key={key} onClick={() => toggleSort(key)}
                      className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">
                      {key === 'drug_name' ? 'Drug Name' : key === 'batch_number' ? 'Batch #' : key === 'stock_count' ? 'Stock' : key === 'reorder_level' ? 'Reorder Level' : key === 'expiry_date' ? 'Expires' : 'Supplier'} {sortIcon(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((item) => (
                  <tr key={item.id} className={`${rowClass(item)} transition-colors`}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{item.drug_name}</td>
                    <td className="px-5 py-3.5 text-slate-600">{item.batch_number || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                        item.stock_count < item.reorder_level ? 'bg-red-100 text-red-700' : item.stock_count > item.reorder_level * 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>{item.stock_count}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{item.reorder_level}</td>
                    <td className="px-5 py-3.5 text-slate-600">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { if (!adding) setModal((p) => ({ ...p, open: false })) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><PlusCircle size={18} /> Add Inventory Item</h3>
              <button onClick={() => setModal((p) => ({ ...p, open: false }))} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {([
                { label: 'Drug Name', key: 'drug_name', placeholder: 'e.g. Amoxicillin' },
                { label: 'Batch Number', key: 'batch_number', placeholder: 'e.g. BATCH-001' },
                { label: 'Stock Count', key: 'stock_count', placeholder: 'e.g. 500', type: 'number' },
                { label: 'Reorder Level', key: 'reorder_level', placeholder: 'e.g. 50', type: 'number' },
                { label: 'Expiry Date', key: 'expiry_date', type: 'date' },
                { label: 'Supplier', key: 'supplier', placeholder: 'e.g. PharmaCorp' },
              ] as const).map((f: any) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={(modal as any)[f.key]}
                    onChange={(e) => setModal((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setModal((p) => ({ ...p, open: false }))}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdd} disabled={adding}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
