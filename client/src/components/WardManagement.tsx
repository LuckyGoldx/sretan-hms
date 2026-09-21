import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Bed, Building2, Loader2, Plus, Trash2, CheckCircle, AlertTriangle, Edit2, X, Power,
} from 'lucide-react'

function readStoredUser(): any {
  try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch { return null }
}

export default function WardManagement({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  // Read per render so a Super Admin login always sees the delete control.
  const storedUser = readStoredUser()
  const currentUserId: string | null = storedUser?.id || null
  const isSuperAdminUser = storedUser?.role === 'SuperAdmin' || storedUser?.user_type === 'superadmin'
  const [wards, setWards] = useState<any[]>([])
  const [beds, setBeds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [newWard, setNewWard] = useState({ name: '', code: '', description: '', price: '' })
  const [adding, setAdding] = useState(false)
  const [editWard, setEditWard] = useState<any | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [deleteWard, setDeleteWard] = useState<any | null>(null)
  const [toggleWard, setToggleWard] = useState<any | null>(null)
  const [wardBusy, setWardBusy] = useState(false)
  const [bedDrafts, setBedDrafts] = useState<Record<string, string>>({})
  const [newBedNumbers, setNewBedNumbers] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [w, b] = await Promise.all([
        api.get('/wards?include_inactive=true').catch(() => ({ data: [] })),
        api.get('/beds').catch(() => ({ data: [] })),
      ])
      setWards(Array.isArray(w.data) ? w.data : [])
      setBeds(Array.isArray(b.data) ? b.data : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const bedsByWard = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const b of beds) {
      if (!m.has(b.ward_id)) m.set(b.ward_id, [])
      m.get(b.ward_id)!.push(b)
    }
    for (const list of m.values()) {
      list.sort((x, y) => (parseInt(String(x.bed_number).replace(/\D/g, '')) || 0) - (parseInt(String(y.bed_number).replace(/\D/g, '')) || 0))
    }
    return m
  }, [beds])

  function openEditWard(w: any) {
    setEditWard(w); setEditPrice(String(Number(w.bed_rate) || 0)); setError('')
  }

  async function saveEditWard() {
    if (!editWard) return
    const val = parseFloat(editPrice)
    if (isNaN(val) || val < 0) { setError('Enter a valid non-negative ward price.'); return }
    setWardBusy(true); setError('')
    try {
      const r = await api.put(`/wards/${editWard.id}`, { price: val, performed_by: currentUserId })
      setWards((prev) => prev.map((x) => x.id === editWard.id ? { ...x, bed_rate: r.data.bed_rate } : x))
      setEditWard(null)
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save ward price.') } finally { setWardBusy(false) }
  }

  async function confirmDeleteWard() {
    if (!deleteWard) return
    setWardBusy(true); setError('')
    try {
      await api.delete(`/wards/${deleteWard.id}`, { data: { performed_by: currentUserId } })
      setWards((prev) => prev.filter((x) => x.id !== deleteWard.id))
      setDeleteWard(null)
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete ward.'); setDeleteWard(null) } finally { setWardBusy(false) }
  }

  async function confirmToggleWard() {
    if (!toggleWard) return
    setWardBusy(true); setError('')
    try {
      const r = await api.put(`/wards/${toggleWard.id}`, { is_active: !toggleWard.is_active, performed_by: currentUserId })
      setWards((prev) => prev.map((x) => x.id === toggleWard.id ? { ...x, is_active: r.data.is_active } : x))
      setToggleWard(null)
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to update ward.'); setToggleWard(null) } finally { setWardBusy(false) }
  }

  async function addWard() {
    if (!newWard.name.trim()) { setError('Ward name is required.'); return }
    const price = parseFloat(newWard.price)
    if (isNaN(price) || price < 0) { setError('Enter a valid non-negative ward price.'); return }
    setAdding(true); setError('')
    try {
      await api.post('/wards', { name: newWard.name.trim(), code: newWard.code.trim() || null, description: newWard.description.trim() || null, price, performed_by: currentUserId })
      setNewWard({ name: '', code: '', description: '', price: '' })
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to create ward.') } finally { setAdding(false) }
  }

  async function addBed(wardId: string) {
    const existing = bedsByWard.get(wardId) || []
    const nextNumber = String(newBedNumbers[wardId] || '').trim() || `Bed ${existing.length + 1}`
    setBusyId(`ward:${wardId}`); setError('')
    try {
      await api.post('/beds', { ward_id: wardId, bed_number: nextNumber })
      setNewBedNumbers((p) => { const n = { ...p }; delete n[wardId]; return n })
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to add bed.') } finally { setBusyId(null) }
  }

  async function saveBedPrice(bed: any) {
    const raw = bedDrafts[bed.id]
    const val = raw === undefined || raw === '' ? null : parseFloat(raw)
    if (val !== null && (isNaN(val) || val < 0)) { setError('Enter a valid non-negative bed price.'); return }
    setBusyId(bed.id); setError('')
    try {
      const r = await api.put(`/beds/${bed.id}`, { daily_rate: val })
      setBeds((prev) => prev.map((x) => x.id === bed.id ? { ...x, daily_rate: r.data.daily_rate } : x))
      setBedDrafts((d) => { const n = { ...d }; delete n[bed.id]; return n })
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save bed price.') } finally { setBusyId(null) }
  }

  async function removeBed(bed: any) {
    if (!confirm(`Remove ${bed.bed_number}${bed.ward_name ? ` from ${bed.ward_name}` : ''}?`)) return
    setBusyId(bed.id); setError('')
    try {
      await api.delete(`/beds/${bed.id}`)
      setBeds((prev) => prev.filter((x) => x.id !== bed.id))
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to remove bed.') } finally { setBusyId(null) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className={`space-y-6 ${embedded ? '' : 'max-w-6xl mx-auto'}`}>
      {!embedded && <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>}

      <div className={`items-center gap-3 ${embedded ? 'hidden' : 'flex'}`}>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Bed size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Ward &amp; Bed Management</h1>
          <p className="text-sm text-slate-500">Create wards, manage beds and set nightly prices. Nurses use these beds when assigning admissions.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Create ward */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><Plus size={15} className="text-emerald-600" /> New Ward</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input value={newWard.name} onChange={(e) => setNewWard({ ...newWard, name: e.target.value })}
            placeholder="Ward name (e.g. Renal Ward)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none sm:col-span-2" />
          <input value={newWard.code} onChange={(e) => setNewWard({ ...newWard, code: e.target.value })}
            placeholder="Code (auto if blank)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          <input type="number" min="0" step="0.01" value={newWard.price} onChange={(e) => setNewWard({ ...newWard, price: e.target.value })}
            placeholder="Price / night (₦)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-right focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={addWard} disabled={adding}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Ward
          </button>
        </div>
      </div>

      {/* Existing wards */}
      {wards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
          No wards yet. Create one above.
        </div>
      ) : wards.map((w) => {
        const wardBeds = bedsByWard.get(w.id) || []
        const bedOccupied = wardBeds.filter((b) => b.occupied).length
        const occupiedCount = Number(w.occupied_count ?? bedOccupied)
        const admissionCount = Number(w.admission_count ?? 0)
        const isDisabled = w.is_active === false
        const locked = occupiedCount > 0
        return (
          <div key={w.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDisabled ? 'border-slate-300 opacity-70' : 'border-slate-200'}`}>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 size={15} className="text-indigo-500" /> {w.name}
                  {isDisabled && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">DISABLED</span>}
                  {locked && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">OCCUPIED</span>}
                </p>
                <p className="text-[11px] text-slate-400">{wardBeds.length} bed(s) · {occupiedCount} occupied · code {w.code || '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">₦{Number(w.bed_rate || 0).toLocaleString()}</span>
                <span className="text-[11px] text-slate-400">/ night</span>
                <button onClick={() => openEditWard(w)} disabled={locked}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed" title={locked ? 'Ward has admitted patients' : 'Edit ward rate'}><Edit2 size={14} /></button>
                <button onClick={() => { setToggleWard(w); setError('') }} disabled={locked}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${isDisabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  title={locked ? 'Ward has admitted patients' : (isDisabled ? 'Enable ward' : 'Disable ward')}>
                  <Power size={12} /> {isDisabled ? 'Enable' : 'Disable'}
                </button>
                {isSuperAdminUser && (
                  <button onClick={() => { setDeleteWard(w); setError('') }} disabled={admissionCount > 0}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed" title={admissionCount > 0 ? 'Ward has admission history and cannot be deleted' : 'Delete ward'}><Trash2 size={14} /></button>
                )}
              </div>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                {wardBeds.length === 0 && <p className="text-xs text-slate-400 italic">No beds yet.</p>}
                {wardBeds.map((b) => (
                  <div key={b.id} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${b.occupied ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <span className={`text-xs font-medium ${b.occupied ? 'text-amber-700' : 'text-slate-700'}`}>{b.bed_number}</span>
                    {b.occupied && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">OCCUPIED</span>}
                    <input type="number" min="0" step="0.01"
                      placeholder="price"
                      value={bedDrafts[b.id] !== undefined ? bedDrafts[b.id] : (b.daily_rate != null ? String(Number(b.daily_rate)) : '')}
                      onChange={(e) => setBedDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                      title="Optional per-bed price override"
                      className="w-16 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[11px] text-right focus:ring-1 focus:ring-emerald-400 outline-none" />
                    <button onClick={() => saveBedPrice(b)} disabled={busyId === b.id}
                      className="p-1 rounded-md hover:bg-emerald-100 text-emerald-600 disabled:opacity-50" title="Save bed price">
                      {busyId === b.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    </button>
                    <button onClick={() => removeBed(b)} disabled={busyId === b.id || b.occupied}
                      className="p-1 rounded-md hover:bg-rose-100 text-rose-500 disabled:opacity-40" title={b.occupied ? 'Occupied bed cannot be removed' : 'Remove bed'}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input value={newBedNumbers[w.id] || ''} onChange={(e) => setNewBedNumbers((p) => ({ ...p, [w.id]: e.target.value }))}
                  placeholder={`Bed ${wardBeds.length + 1}`}
                  className="w-32 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                <button onClick={() => addBed(w.id)} disabled={busyId === `ward:${w.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {busyId === `ward:${w.id}` ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Bed
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">A blank bed price uses the ward's nightly rate. A bed price overrides it for that bed only.</p>
            </div>
          </div>
        )
      })}

      {/* Edit ward rate */}
      {editWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardBusy) setEditWard(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Bed size={18} className="text-emerald-500" /> Edit Ward</h2>
              <button onClick={() => setEditWard(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Ward</label>
                <p className="text-sm font-medium text-slate-800">{editWard.name}{editWard.code ? ` (${editWard.code})` : ''}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Price / night (₦)</label>
                <input type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={saveEditWard} disabled={wardBusy}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {wardBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enable / disable ward confirmation */}
      {toggleWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardBusy) setToggleWard(null) }}>
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
              {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setToggleWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmToggleWard} disabled={wardBusy}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${toggleWard.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {wardBusy ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} {toggleWard.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ward confirmation */}
      {deleteWard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!wardBusy) setDeleteWard(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-3"><Trash2 size={22} className="text-rose-600" /></div>
              <h2 className="text-base font-semibold text-slate-800">Delete ward?</h2>
              <p className="text-sm text-slate-500 mt-1"><strong>{deleteWard.name}</strong> and its beds will be removed. This cannot be undone.</p>
              {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setDeleteWard(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDeleteWard} disabled={wardBusy}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
                {wardBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
