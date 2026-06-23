import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Building2, Search, Loader2, Plus, X, AlertTriangle, ArrowLeft, Edit2, Trash2, Save, ToggleLeft, ToggleRight, ChevronUp, ChevronDown
} from 'lucide-react'

type SortKey = 'drug_name' | 'stock_count' | 'reorder_level' | 'price' | 'cost_price' | 'supplier' | 'amount_type'

const currentRole: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()

const emptyForm = { drug_name: '', batch_number: '', stock_count: '0', reorder_level: '1', supplier: '', amount_type: 'units', unit_price: '', cost_price: '', expiry_date: '' }

export default function ServiceInventory() {
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

  useEffect(() => {
    const url = currentRole === 'Admin' ? '/inventory?category=general&show_inactive=true' : '/inventory?category=general'
    api.get(url).then((r) => { setItems(r.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  let filtered = items.filter((i) =>
    i.drug_name?.toLowerCase().includes(search.toLowerCase()) ||
    (i.supplier || '').toLowerCase().includes(search.toLowerCase())
  )

  if (lowStockOnly) {
    filtered = filtered.filter((i) => i.is_active !== false && i.stock_count <= i.reorder_level)
  }

  const sorted = [...filtered].sort((a, b) => {
    const d = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'stock_count' || sortKey === 'reorder_level') return (Number(a[sortKey]) - Number(b[sortKey])) * d
    if (sortKey === 'price' || sortKey === 'cost_price') return (Number(a[sortKey]) - Number(b[sortKey])) * d
    return ((a[sortKey] || '').localeCompare(b[sortKey] || '')) * d
  })

  const lowStock = items.filter((i) => i.is_active !== false && i.stock_count <= i.reorder_level)

  function resetForm() { setForm(emptyForm) }

  async function handleSave() {
    if (!form.drug_name) { setError('Service name is required'); return }
    setSaving(true); setError('')
    try {
      const payload: any = {
        drug_name: form.drug_name.trim(),
        stock_count: parseInt(form.stock_count) || 0, reorder_level: parseInt(form.reorder_level) || 1,
        supplier: form.supplier.trim() || undefined, category: 'general', amount_type: form.amount_type,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : undefined,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
      }
      if (editItem) {
        await api.put(`/inventory/${editItem.id}`, payload)
      } else {
        await api.post('/inventory', payload)
      }
      setShowAdd(false); setEditItem(null); resetForm()
      const url = currentRole === 'Admin' ? '/inventory?category=general&show_inactive=true' : '/inventory?category=general'
      const r = await api.get(url)
      setItems(r.data || [])
    } catch (err: any) { setError(err.response?.data?.message || 'Failed') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service?')) return
    try { await api.delete(`/inventory/${id}`); setItems((prev) => prev.filter((i) => i.id !== id)) } catch {}
  }

  async function handleToggleActive(item: any) {
    try {
      const res = await api.put(`/inventory/${item.id}`, { is_active: !item.is_active })
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_active: res.data.is_active } : i))
    } catch {}
  }

  function openEdit(item: any) {
    setEditItem(item)
    setForm({
      drug_name: item.drug_name, batch_number: '',
      stock_count: String(item.stock_count ?? 0), reorder_level: String(item.reorder_level ?? 1),
      supplier: item.supplier || '', amount_type: item.amount_type || 'units',
      unit_price: String(item.price ?? ''), cost_price: String(item.cost_price ?? ''),
      expiry_date: '',
    })
    setShowAdd(true)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><Building2 size={22} className="text-teal-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Services Inventory</h1>
            <p className="text-sm text-slate-500">{items.length} services &middot; {lowStock.length} low stock</p>
          </div>
        </div>
        {currentRole === 'Admin' && (
          <button onClick={() => { setEditItem(null); resetForm(); setShowAdd(true) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
            <Plus size={16} /> Add Service
          </button>
        )}
      </div>

      {lowStock.length > 0 && (
        <button onClick={() => { setLowStockOnly((p) => !p); if (!lowStockOnly) setSearch('') }} className={`flex items-center gap-3 w-full px-5 py-3 rounded-2xl border transition-all text-left ${lowStockOnly ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
          <AlertTriangle size={18} className={`${lowStockOnly ? 'text-amber-700' : 'text-amber-600'}`} />
          <p className={`text-sm font-medium flex-1 ${lowStockOnly ? 'text-amber-800' : 'text-amber-700'}`}>
            {lowStockOnly ? `Showing ${lowStock.length} low stock service${lowStock.length !== 1 ? 's' : ''} — click to clear filter` : `${lowStock.length} service${lowStock.length !== 1 ? 's' : ''} below reorder level — click to view`}
          </p>
        </button>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search services..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <Building2 size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No services found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th onClick={() => toggleSort('drug_name')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Service {sortIcon('drug_name')}</th>
                  <th onClick={() => toggleSort('stock_count')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Qty {sortIcon('stock_count')}</th>
                  <th onClick={() => toggleSort('reorder_level')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Min {sortIcon('reorder_level')}</th>
                  <th onClick={() => toggleSort('price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Sell Price {sortIcon('price')}</th>
                  <th onClick={() => toggleSort('cost_price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Cost Price {sortIcon('cost_price')}</th>
                  <th onClick={() => toggleSort('supplier')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Department {sortIcon('supplier')}</th>
                  <th onClick={() => toggleSort('amount_type')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Type {sortIcon('amount_type')}</th>
                  {currentRole === 'Admin' && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((item) => {
                  const isInactive = item.is_active === false
                  return (
                    <tr key={item.id} className={`${isInactive ? 'opacity-50 bg-slate-50' : ''} hover:bg-slate-50`}>
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {item.drug_name}
                        {isInactive && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">INACTIVE</span>}
                      </td>
                      <td className="px-5 py-3.5"><span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">{item.stock_count}</span></td>
                      <td className="px-5 py-3.5 text-slate-600">{item.reorder_level}</td>
                      <td className="px-5 py-3.5">{item.price > 0 ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">₦{Number(item.price).toLocaleString()}</span> : '—'}</td>
                      <td className="px-5 py-3.5">{item.cost_price > 0 ? <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">₦{Number(item.cost_price).toLocaleString()}</span> : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-500">{item.supplier || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-400">{item.amount_type || 'units'}</td>
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
              <h2 className="text-base font-semibold text-slate-800"><Building2 size={18} className="inline text-teal-500 mr-2" />{editItem ? 'Edit' : 'Add'} Service</h2>
              <button onClick={() => { setShowAdd(false); setEditItem(null); resetForm() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Service Name *', key: 'drug_name', placeholder: 'e.g. General Consultation' },
                { label: 'Quantity Available', key: 'stock_count', type: 'number', placeholder: 'e.g. 999' },
                { label: 'Min Quantity Alert', key: 'reorder_level', type: 'number', placeholder: 'e.g. 10' },
                { label: 'Sell Price (₦)', key: 'unit_price', type: 'number', placeholder: 'e.g. 5000' },
                { label: 'Cost Price (₦)', key: 'cost_price', type: 'number', placeholder: 'e.g. 3000' },
                { label: 'Department', key: 'supplier', placeholder: 'e.g. Consultation / Procedures / Maternity' },
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Service Type</label>
                <select value={form.amount_type} onChange={(e) => setForm((p) => ({ ...p, amount_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="consultation">Consultation</option>
                  <option value="procedure">Procedure</option>
                  <option value="maternity">Maternity</option>
                  <option value="admission">Admission</option>
                  <option value="miscellaneous">Miscellaneous</option>
                  <option value="units">Units</option>
                </select>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowAdd(false); setEditItem(null); resetForm() }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : editItem ? <Save size={14} /> : <Plus size={14} />}
                {editItem ? 'Save Changes' : 'Add Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
