import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Building2, Search, Loader2, Plus, X, ArrowLeft, Edit2, Trash2, Save, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, Bed, Power
} from 'lucide-react'

type SortKey = 'drug_name' | 'price' | 'supplier' | 'amount_type'

const SERVICE_TYPES = ['consultation', 'procedure', 'maternity', 'admission', 'miscellaneous', 'units']

function readStoredUser(): any {
  try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch { return null }
}

// Services are flat charges with no stock and no cost price (services are set
// to cost 0). `department` is an encoded select value: '' = none,
// '__general__' = General, 'legacy:<text>' = old free text, otherwise a
// department id (rename-following).
const emptyForm = { drug_name: '', department: '', amount_type: 'miscellaneous', unit_price: '' }

export default function ServiceInventory() {
  const navigate = useNavigate()
  // Read the role on every render so a Super Admin login always sees the
  // super-admin-only controls without a stale module-level cache.
  const storedUser = readStoredUser()
  const currentRole: string | null = storedUser?.role || null
  const currentUserId: string | null = storedUser?.id || null
  const isSuperAdminUser = storedUser?.role === 'SuperAdmin' || storedUser?.user_type === 'superadmin'
  const canManageWards = ['Admin', 'SuperAdmin'].includes(currentRole || '')

  const [tab, setTab] = useState<'services' | 'wards'>('services')

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
  const [deleteItem, setDeleteItem] = useState<any | null>(null)
  const [itemDeleting, setItemDeleting] = useState(false)
  const [deleteItemError, setDeleteItemError] = useState('')
  const [departments, setDepartments] = useState<any[]>([])

  // Ward tab (same /api/wards endpoints as /admin/wards, so they stay in sync)
  const [wards, setWards] = useState<any[]>([])
  const [wardsLoading, setWardsLoading] = useState(true)
  const [newWard, setNewWard] = useState({ name: '', code: '', price: '' })
  const [addingWard, setAddingWard] = useState(false)
  const [wardError, setWardError] = useState('')
  const [editWard, setEditWard] = useState<any | null>(null)
  const [editWardPrice, setEditWardPrice] = useState('')
  const [wardSaving, setWardSaving] = useState(false)
  const [deleteWard, setDeleteWard] = useState<any | null>(null)
  const [wardDeleting, setWardDeleting] = useState(false)
  const [toggleWard, setToggleWard] = useState<any | null>(null)

  useEffect(() => {
    const url = canManageWards ? '/inventory?category=general&show_inactive=true' : '/inventory?category=general'
    api.get(url).then((r) => { setItems(r.data || []); setLoading(false) }).catch(() => setLoading(false))
    // Department choices come from the system's Departments; "General" is always
    // offered for services that are not tied to a specific department.
    api.get('/departments')
      .then((r) => setDepartments((r.data || []).filter((d: any) => d.status !== 'inactive')))
      .catch(() => {})
    loadWards()
  }, [])

  async function loadWards() {
    setWardsLoading(true)
    try {
      const r = await api.get('/wards?include_inactive=true')
      setWards(Array.isArray(r.data) ? r.data : [])
    } catch { setWards([]) } finally { setWardsLoading(false) }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  // Ward nightly items are managed on the Wards tab, not listed as services.
  const serviceItems = items.filter((i) => i.service_key !== 'BED_DAY')

  const filtered = serviceItems.filter((i) =>
    i.drug_name?.toLowerCase().includes(search.toLowerCase()) ||
    (i.department_name || i.supplier || '').toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const d = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'price') return (Number(a[sortKey]) - Number(b[sortKey])) * d
    return ((a[sortKey] || '').localeCompare(b[sortKey] || '')) * d
  })

  function resetForm() { setForm(emptyForm) }

  async function reload() {
    const url = canManageWards ? '/inventory?category=general&show_inactive=true' : '/inventory?category=general'
    const r = await api.get(url)
    setItems(r.data || [])
  }

  async function handleSave() {
    if (!form.drug_name) { setError('Service name is required'); return }
    setSaving(true); setError('')
    try {
      // Encode the department selection into department_id (real department,
      // follows renames) or supplier (General / legacy free text).
      let department_id: string | null = null
      let supplier: string | null = null
      if (form.department === '__general__') supplier = 'General'
      else if (form.department.startsWith('legacy:')) supplier = form.department.slice(7)
      else if (form.department) department_id = form.department

      const payload: any = {
        drug_name: form.drug_name.trim(),
        category: 'general',
        amount_type: form.amount_type,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : undefined,
        department_id,
        supplier,
      }
      if (editItem) {
        await api.put(`/inventory/${editItem.id}`, payload)
      } else {
        await api.post('/inventory', payload)
      }
      setShowAdd(false); setEditItem(null); resetForm()
      await reload()
    } catch (err: any) { setError(err.response?.data?.message || 'Failed') } finally { setSaving(false) }
  }

  function openDeleteItem(item: any) { setDeleteItem(item); setDeleteItemError('') }

  async function confirmDeleteItem() {
    if (!deleteItem) return
    setItemDeleting(true); setDeleteItemError('')
    try {
      await api.delete(`/inventory/${deleteItem.id}`)
      setItems((prev) => prev.filter((i) => i.id !== deleteItem.id))
      setDeleteItem(null)
    } catch (err: any) { setDeleteItemError(err?.response?.data?.message || 'Delete failed.') } finally { setItemDeleting(false) }
  }

  async function handleToggleActive(item: any) {
    try {
      const res = await api.put(`/inventory/${item.id}`, { is_active: !item.is_active })
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_active: res.data.is_active } : i))
    } catch {}
  }

  function openEdit(item: any) {
    setEditItem(item)
    let department = item.department_id || ''
    if (!department) {
      const legacy = item.supplier || ''
      if (legacy) department = legacy === 'General' ? '__general__' : `legacy:${legacy}`
    }
    setForm({
      drug_name: item.drug_name,
      department,
      amount_type: item.amount_type || 'miscellaneous',
      unit_price: String(item.price ?? ''),
    })
    setShowAdd(true)
  }

  function openEditWard(w: any) {
    setEditWard(w); setEditWardPrice(String(Number(w.bed_rate) || 0)); setWardError('')
  }

  async function saveWardEdit() {
    if (!editWard) return
    const val = parseFloat(editWardPrice)
    if (isNaN(val) || val < 0) { setWardError('Enter a valid non-negative nightly rate.'); return }
    setWardSaving(true); setWardError('')
    try {
      const r = await api.put(`/wards/${editWard.id}`, { price: val, performed_by: currentUserId })
      setWards((prev) => prev.map((x) => x.id === editWard.id ? { ...x, bed_rate: r.data.bed_rate } : x))
      setEditWard(null)
    } catch (e: any) { setWardError(e?.response?.data?.message || 'Failed to save ward rate.') } finally { setWardSaving(false) }
  }

  async function confirmToggleWard() {
    if (!toggleWard) return
    setWardSaving(true); setWardError('')
    try {
      const r = await api.put(`/wards/${toggleWard.id}`, { is_active: !toggleWard.is_active, performed_by: currentUserId })
      setWards((prev) => prev.map((x) => x.id === toggleWard.id ? { ...x, is_active: r.data.is_active } : x))
      setToggleWard(null)
    } catch (e: any) { setWardError(e?.response?.data?.message || 'Failed to update ward.'); setToggleWard(null) } finally { setWardSaving(false) }
  }

  async function confirmDeleteWard() {
    if (!deleteWard) return
    setWardDeleting(true); setWardError('')
    try {
      await api.delete(`/wards/${deleteWard.id}`, { data: { performed_by: currentUserId } })
      setWards((prev) => prev.filter((x) => x.id !== deleteWard.id))
      setDeleteWard(null)
    } catch (e: any) { setWardError(e?.response?.data?.message || 'Failed to delete ward.'); setDeleteWard(null) } finally { setWardDeleting(false) }
  }

  async function addWard() {
    if (!newWard.name.trim()) { setWardError('Ward name is required.'); return }
    const price = parseFloat(newWard.price)
    if (isNaN(price) || price < 0) { setWardError('Enter a valid non-negative nightly rate.'); return }
    setAddingWard(true); setWardError('')
    try {
      await api.post('/wards', { name: newWard.name.trim(), code: newWard.code.trim() || null, price, performed_by: currentUserId })
      setNewWard({ name: '', code: '', price: '' })
      await loadWards()
    } catch (e: any) { setWardError(e?.response?.data?.message || 'Failed to create ward.') } finally { setAddingWard(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  // Always include "General"; real departments are id-linked so renames follow.
  const departmentChoices = (() => {
    const choices: { value: string; label: string }[] = [{ value: '__general__', label: 'General' }]
    for (const d of departments) choices.push({ value: d.id, label: d.name })
    if (form.department.startsWith('legacy:')) {
      choices.unshift({ value: form.department, label: `${form.department.slice(7)} (legacy)` })
    }
    return choices
  })()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><Building2 size={22} className="text-teal-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Services Inventory</h1>
            <p className="text-sm text-slate-500">{tab === 'services' ? `${serviceItems.length} services` : `${wards.length} wards`}</p>
          </div>
        </div>
        {canManageWards && tab === 'services' && (
          <button onClick={() => { setEditItem(null); resetForm(); setShowAdd(true) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
            <Plus size={16} /> Add Service
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([['services', 'Services'], ['wards', 'Wards']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'services' && (
        <>
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search services or department..." value={search} onChange={(e) => setSearch(e.target.value)}
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
                      <th onClick={() => toggleSort('price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Sell Price {sortIcon('price')}</th>
                      <th onClick={() => toggleSort('amount_type')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Type {sortIcon('amount_type')}</th>
                      <th onClick={() => toggleSort('supplier')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Department {sortIcon('supplier')}</th>
                      {canManageWards && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sorted.map((item) => {
                      const isInactive = item.is_active === false
                      return (
                        <tr key={item.id} className={`${isInactive ? 'opacity-50 bg-slate-50' : ''} hover:bg-slate-50`}>
                          <td className="px-5 py-3.5 font-medium text-slate-800">
                            {item.drug_name}
                            {item.code && <span className="ml-2 font-mono text-[10px] text-slate-400">{item.code}</span>}
                            {isInactive && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">INACTIVE</span>}
                          </td>
                          <td className="px-5 py-3.5">{item.price > 0 ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">₦{Number(item.price).toLocaleString()}</span> : '—'}</td>
                          <td className="px-5 py-3.5 text-slate-400">{item.amount_type || 'miscellaneous'}</td>
                          <td className="px-5 py-3.5 text-slate-500">{item.department_name || item.supplier || '—'}</td>
                          {canManageWards && (
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Edit"><Edit2 size={13} /></button>
                                <button onClick={() => handleToggleActive(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600" title={isInactive ? 'Activate' : 'Inactivate'}>
                                  {isInactive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                </button>
                                <button onClick={() => openDeleteItem(item)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500" title="Delete"><Trash2 size={13} /></button>
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
        </>
      )}

      {tab === 'wards' && (
        <>
          {wardError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {wardError}
            </div>
          )}

          {canManageWards && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><Plus size={15} className="text-teal-600" /> New Ward</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input value={newWard.name} onChange={(e) => setNewWard({ ...newWard, name: e.target.value })}
                  placeholder="Ward name (e.g. Renal Ward)"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none sm:col-span-2" />
                <input value={newWard.code} onChange={(e) => setNewWard({ ...newWard, code: e.target.value })}
                  placeholder="Code (auto if blank)"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                <input type="number" min="0" step="0.01" value={newWard.price} onChange={(e) => setNewWard({ ...newWard, price: e.target.value })}
                  placeholder="Price / night (₦)"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={addWard} disabled={addingWard}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {addingWard ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Ward
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Wards are shared with Ward Management — beds can be added or removed there.</p>
            </div>
          )}

          {wardsLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-primary" /></div>
          ) : wards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 text-sm">No wards yet.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Ward</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Code</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Nightly Rate</th>
                      {canManageWards && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {wards.map((w) => {
                      const rate = Number(w.bed_rate) || 0
                      const occupiedCount = Number(w.occupied_count ?? 0)
                      const admissionCount = Number(w.admission_count ?? 0)
                      const isDisabled = w.is_active === false
                      const locked = occupiedCount > 0
                      return (
                        <tr key={w.id} className={`hover:bg-slate-50 ${isDisabled ? 'opacity-60' : ''}`}>
                          <td className="px-5 py-3.5 font-medium text-slate-800">
                            <span className="flex items-center gap-2">
                              <Bed size={14} className="text-teal-500" />{w.name}
                              {isDisabled && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">DISABLED</span>}
                              {locked && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">OCCUPIED</span>}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{w.code || '—'}</td>
                          <td className="px-5 py-3.5 text-slate-600">₦{rate.toLocaleString()} <span className="text-[11px] text-slate-400">/ night</span></td>
                          {canManageWards && (
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditWard(w)} disabled={locked} title={locked ? 'Ward has admitted patients' : 'Edit rate'}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"><Edit2 size={13} /></button>
                                <button onClick={() => { setToggleWard(w); setWardError('') }} disabled={locked} title={locked ? 'Ward has admitted patients' : (isDisabled ? 'Enable ward' : 'Disable ward')}
                                  className={`p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${isDisabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100 hover:text-amber-600'}`}><Power size={13} /></button>
                                {isSuperAdminUser && (
                                  <button onClick={() => { setDeleteWard(w); setWardError('') }} disabled={admissionCount > 0} title={admissionCount > 0 ? 'Ward has admission history' : 'Delete ward'}
                                    className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={13} /></button>
                                )}
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
        </>
      )}

      {showAdd && canManageWards && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving) { setShowAdd(false); setEditItem(null) } }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><Building2 size={18} className="inline text-teal-500 mr-2" />{editItem ? 'Edit' : 'Add'} Service</h2>
              <button onClick={() => { setShowAdd(false); setEditItem(null); resetForm() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Service Name *', key: 'drug_name', placeholder: 'e.g. General Consultation' },
                { label: 'Sell Price (₦)', key: 'unit_price', type: 'number', placeholder: 'e.g. 5000' },
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
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Services are flat charges and are not stock tracked.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Department (optional)</label>
                <select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">— None —</option>
                  {departmentChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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

      {/* Edit ward rate */}
      {editWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardSaving) setEditWard(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Bed size={18} className="text-teal-500" /> Edit Ward</h2>
              <button onClick={() => setEditWard(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Ward</label>
                <p className="text-sm font-medium text-slate-800">{editWard.name}{editWard.code ? ` (${editWard.code})` : ''}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nightly Rate (₦)</label>
                <input type="number" min="0" step="0.01" value={editWardPrice} onChange={(e) => setEditWardPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              {wardError && <p className="text-xs text-rose-600">{wardError}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={saveWardEdit} disabled={wardSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {wardSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete service confirmation */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!itemDeleting) setDeleteItem(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1.5 bg-gradient-to-r from-rose-500 via-rose-400 to-amber-400" />
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-rose-50 ring-8 ring-rose-50/60 flex items-center justify-center mb-4">
                <Trash2 size={24} className="text-rose-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">Delete this service?</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                <strong className="text-slate-700">{deleteItem.drug_name}</strong> will be removed from the services inventory. This cannot be undone.
              </p>
              {deleteItemError && (
                <p className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{deleteItemError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setDeleteItem(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDeleteItem} disabled={itemDeleting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 active:scale-[0.98] transition-all disabled:opacity-50">
                {itemDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enable / disable ward confirmation */}
      {toggleWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardSaving) setToggleWard(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${toggleWard.is_active ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                <Power size={22} className={toggleWard.is_active ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
              <h2 className="text-base font-semibold text-slate-800">{toggleWard.is_active ? 'Disable ward?' : 'Enable ward?'}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {toggleWard.is_active
                  ? <><strong>{toggleWard.name}</strong> will be hidden and cannot be used for new admissions.</>
                  : <><strong>{toggleWard.name}</strong> will become available again for admissions.</>}
              </p>
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setToggleWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmToggleWard} disabled={wardSaving}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${toggleWard.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {wardSaving ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} {toggleWard.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ward confirmation */}
      {deleteWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardDeleting) setDeleteWard(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-3"><Trash2 size={22} className="text-rose-600" /></div>
              <h2 className="text-base font-semibold text-slate-800">Delete ward?</h2>
              <p className="text-sm text-slate-500 mt-1"><strong>{deleteWard.name}</strong> and its beds will be removed. This cannot be undone.</p>
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setDeleteWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDeleteWard} disabled={wardDeleting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
                {wardDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
