import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import { Package, PlusCircle, Loader2, AlertTriangle, X, Search, Edit2, Trash2, Save, ToggleLeft, ToggleRight, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type SortKey = 'drug_name' | 'batch_number' | 'stock_count' | 'reorder_level' | 'expiry_date' | 'supplier' | 'price' | 'cost_price' | 'amount_type'

const currentRole: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()

const emptyForm = { drug_name: '', batch_number: '', stock_count: '', reorder_level: '10', supplier: '', unit_price: '', cost_price: '', amount_type: 'units', expiry_date: '' }

export default function InventoryManagement() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('drug_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const url = currentRole === 'Admin' ? '/inventory?category=pharmacy&show_inactive=true' : '/inventory?category=pharmacy'
      const { data } = await api.get<any[]>(url); setItems(data || [])
    } catch { setItems([]) } finally { setLoading(false) }
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

  let filtered = items.filter((i) =>
    i.drug_name?.toLowerCase().includes(search.toLowerCase()) || i.supplier?.toLowerCase().includes(search.toLowerCase())
  )

  if (lowStockOnly) {
    filtered = filtered.filter((i) => i.is_active !== false && i.stock_count <= i.reorder_level)
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'stock_count' || sortKey === 'reorder_level') return (Number(a[sortKey]) - Number(b[sortKey])) * dir
    if (sortKey === 'expiry_date') return (new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()) * dir
    if (sortKey === 'price' || sortKey === 'cost_price') return (Number(a[sortKey]) - Number(b[sortKey])) * dir
    return (a[sortKey] || '').localeCompare(b[sortKey] || '') * dir
  })

  const lowStockCount = items.filter((i) => i.is_active !== false && i.stock_count <= i.reorder_level).length

  function resetForm() { setForm(emptyForm) }

  async function handleSave() {
    if (!form.drug_name.trim()) { setError('Item name is required'); return }
    setSaving(true); setError('')
    try {
      const payload: any = {
        drug_name: form.drug_name.trim(), batch_number: form.batch_number.trim() || undefined,
        stock_count: parseInt(form.stock_count) || 0, reorder_level: parseInt(form.reorder_level) || 10,
        supplier: form.supplier.trim() || undefined, category: 'pharmacy', amount_type: form.amount_type,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : undefined,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
        expiry_date: form.expiry_date || undefined,
      }
      if (editItem) {
        await api.put(`/inventory/${editItem.id}`, payload)
      } else {
        await api.post('/inventory', payload)
      }
      setShowAdd(false); setEditItem(null); resetForm(); fetch()
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this item?')) return
    try { await api.delete(`/inventory/${id}`); setItems((prev) => prev.filter((i) => i.id !== id)) } catch {}
  }

  async function handleToggleActive(item: any) {
    try {
      const res = await api.put(`/inventory/${item.id}`, { is_active: !item.is_active })
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_active: res.data.is_active } : i))
    } catch {}
  }

  async function handleAdjustStock(id: string, delta: number) {
    try {
      await api.put(`/inventory/${id}`, { stock_count_delta: delta })
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, stock_count: Math.max(0, i.stock_count + delta) } : i))
    } catch {}
  }

  function openEdit(item: any) {
    setEditItem(item)
    setForm({
      drug_name: item.drug_name, batch_number: item.batch_number || '',
      stock_count: String(item.stock_count ?? 0), reorder_level: String(item.reorder_level ?? 10),
      supplier: item.supplier || '', unit_price: String(item.price ?? ''),
      cost_price: String(item.cost_price ?? ''), amount_type: item.amount_type || 'units',
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
    })
    setShowAdd(true)
  }

  const activeItems = sorted.filter((i) => i.is_active !== false)
  const inactiveItems = sorted.filter((i) => i.is_active === false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Package size={22} className="text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Pharmacy Inventory</h1>
            <p className="text-sm text-slate-500">{activeItems.length} active items{inactiveItems.length > 0 ? ` · ${inactiveItems.length} inactive` : ''} · {lowStockCount} low stock</p>
          </div>
        </div>
        {currentRole === 'Admin' && (
          <button onClick={() => { setEditItem(null); resetForm(); setShowAdd(true) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
            <PlusCircle size={16} /> Add Item
          </button>
        )}
      </div>

      {lowStockCount > 0 && (
        <button onClick={() => { setLowStockOnly((p) => !p); if (!lowStockOnly) setSearch('') }} className={`flex items-center gap-3 w-full px-5 py-3 rounded-2xl border transition-all text-left ${lowStockOnly ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
          <AlertTriangle size={18} className={`${lowStockOnly ? 'text-amber-700' : 'text-amber-600'}`} />
          <p className={`text-sm font-medium flex-1 ${lowStockOnly ? 'text-amber-800' : 'text-amber-700'}`}>
            {lowStockOnly ? `Showing ${lowStockCount} low stock item${lowStockCount !== 1 ? 's' : ''} — click to clear filter` : `${lowStockCount} item${lowStockCount !== 1 ? 's' : ''} below reorder level — click to view`}
          </p>
        </button>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

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
                  <th onClick={() => toggleSort('drug_name')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Drug Name {sortIcon('drug_name')}</th>
                  <th onClick={() => toggleSort('batch_number')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Batch # {sortIcon('batch_number')}</th>
                  <th onClick={() => toggleSort('stock_count')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Stock {sortIcon('stock_count')}</th>
                  <th onClick={() => toggleSort('reorder_level')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Reorder {sortIcon('reorder_level')}</th>
                  <th onClick={() => toggleSort('price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Sell Price {sortIcon('price')}</th>
                  <th onClick={() => toggleSort('cost_price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Cost Price {sortIcon('cost_price')}</th>
                  <th onClick={() => toggleSort('expiry_date')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Expires {sortIcon('expiry_date')}</th>
                  <th onClick={() => toggleSort('supplier')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Supplier {sortIcon('supplier')}</th>
                  {currentRole === 'Admin' && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((item) => {
                  const isInactive = item.is_active === false
                  const lowStock = item.stock_count <= item.reorder_level
                  return (
                    <tr key={item.id} className={`${isInactive ? 'opacity-50 bg-slate-50' : lowStock ? 'bg-red-50' : item.stock_count > item.reorder_level * 2 ? 'bg-emerald-50' : ''} transition-colors hover:bg-slate-50`}>
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {item.drug_name}
                        {isInactive && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">INACTIVE</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{item.batch_number || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${lowStock ? 'bg-red-100 text-red-700' : item.stock_count > item.reorder_level * 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.stock_count}</span>
                          {currentRole === 'Admin' && !isInactive && (
                            <div className="flex gap-0.5 ml-1">
                              <button onClick={() => handleAdjustStock(item.id, 1)} className="p-0.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600"><span className="text-xs font-bold">+</span></button>
                              <button onClick={() => handleAdjustStock(item.id, -1)} className="p-0.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"><span className="text-xs font-bold">−</span></button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{item.reorder_level}</td>
                      <td className="px-5 py-3.5">{item.price > 0 ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">₦{Number(item.price).toLocaleString()}</span> : '—'}</td>
                      <td className="px-5 py-3.5">{item.cost_price > 0 ? <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">₦{Number(item.cost_price).toLocaleString()}</span> : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                      {currentRole === 'Admin' && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Edit"><Edit2 size={13} /></button>
                            <button onClick={() => handleToggleActive(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600" title={isInactive ? 'Activate' : 'Inactivate'}>
                              {isInactive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && currentRole === 'Admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving) { setShowAdd(false); setEditItem(null) } }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><Package size={18} className="inline text-primary mr-2" />{editItem ? 'Edit' : 'Add'} Inventory Item</h2>
              <button onClick={() => { setShowAdd(false); setEditItem(null); resetForm() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Drug Name *', key: 'drug_name', placeholder: 'e.g. Amoxicillin' },
                { label: 'Batch Number', key: 'batch_number', placeholder: 'e.g. BATCH-001' },
                { label: 'Stock Count', key: 'stock_count', type: 'number', placeholder: 'e.g. 500' },
                { label: 'Reorder Level', key: 'reorder_level', type: 'number', placeholder: 'e.g. 50' },
                { label: 'Sell Price (₦)', key: 'unit_price', type: 'number', placeholder: 'e.g. 5000' },
                { label: 'Cost Price (₦)', key: 'cost_price', type: 'number', placeholder: 'e.g. 3000' },
                { label: 'Expiry Date', key: 'expiry_date', type: 'date' },
                { label: 'Supplier', key: 'supplier', placeholder: 'e.g. PharmaCorp' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={(form as any)[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Unit Type</label>
                <select value={form.amount_type} onChange={(e) => setForm((p) => ({ ...p, amount_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="units">Units</option><option value="mL">mL</option><option value="L">L</option><option value="mg">mg</option><option value="g">g</option><option value="tests">Tests</option><option value="packs">Packs</option>
                </select>
              </div>
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowAdd(false); setEditItem(null); resetForm() }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : editItem ? <Save size={14} /> : <PlusCircle size={14} />}
                {editItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
