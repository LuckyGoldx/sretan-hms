import { useState, useEffect } from 'react'
import { Loader2, Plus, Edit3, X, Building2, Shield, Trash2, AlertTriangle, ToggleLeft, ToggleRight, Power, Percent } from 'lucide-react'

export default function InsuranceProviders() {
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', code: '', category: 'HMO', contact_person: '', contact_phone: '', contact_email: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)

  // Deactivate/Activate confirmation (2 steps) — insurance staff + admin
  const [confirmToggle, setConfirmToggle] = useState<any | null>(null)
  const [toggleStep, setToggleStep] = useState(1)

  // Delete confirmation (3 steps) — Super Admin only
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [deleteStep, setDeleteStep] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<any | null>(null)

  // Coverage Rules modal
  const [showCoverageModal, setShowCoverageModal] = useState(false)
  const [coverageData, setCoverageData] = useState<any>(null)
  const [coverageProvider, setCoverageProvider] = useState<any>(null)
  const [coverageTab, setCoverageTab] = useState('lab')
  const [coverageRules, setCoverageRules] = useState<any[]>([])
  const [coverageSaving, setCoverageSaving] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadProviders()
  }, [])

  const isSuperAdmin = currentUser && currentUser.user_type !== 'insurance_staff'

  async function loadProviders() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get('/insurance/providers')
      setProviders(Array.isArray(res.data) ? res.data : [])
    } catch { setProviders([]) } finally { setLoading(false) }
  }

  function openNew() {
    setEditing(null)
    setForm({ name: '', code: '', category: 'HMO', contact_person: '', contact_phone: '', contact_email: '', address: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(p: any) {
    setEditing(p)
    setForm({ name: p.name, code: p.code, category: p.category || 'Other', contact_person: p.contact_person || '', contact_phone: p.contact_phone || '', contact_email: p.contact_email || '', address: p.address || '' })
    setError('')
    setShowModal(true)
  }

  async function openCoverage(p: any) {
    setCoverageProvider(p)
    setCoverageTab('lab')
    setShowCoverageModal(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/providers/${p.id}/coverage`)
      setCoverageData(res.data)
      setCoverageRules(res.data.rules || [])
    } catch { setCoverageData(null) }
  }

  async function saveCoverage() {
    if (!coverageProvider) return
    setCoverageSaving(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.put(`/insurance/providers/${coverageProvider.id}/coverage`, {
        default_coverage_pct: coverageData?.provider?.default_coverage_pct,
        rules: coverageRules,
      })
      setShowCoverageModal(false)
    } catch (err: any) { alert(err.response?.data?.message || 'Save failed') }
    finally { setCoverageSaving(false) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.code) { setError('Name and code are required'); return }
    setSaving(true); setError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      if (editing) {
        await api.put(`/insurance/providers/${editing.id}`, form)
      } else {
        await api.post('/insurance/providers', form)
      }
      setShowModal(false)
      await loadProviders()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function executeToggle() {
    if (!confirmToggle) return
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.put(`/insurance/providers/${confirmToggle.id}`, { is_active: !confirmToggle.is_active })
      setConfirmToggle(null); setToggleStep(1)
      await loadProviders()
    } catch {}
  }

  async function executeDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.delete(`/insurance/providers/${confirmDelete.id}`)
      setDeleteResult(res.data)
      setConfirmDelete(null); setDeleteStep(1)
      await loadProviders()
    } catch (err: any) { alert(err.response?.data?.message || 'Delete failed') }
    finally { setDeleting(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Insurance Providers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage HMOs and insurance companies</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Code</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Name</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Category</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Contact</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Email</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">{p.code}</td>
                  <td className="py-3 px-4 font-medium">{p.name}</td>
                  <td className="py-3 px-4 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.category === 'HMO' ? 'bg-blue-100 text-blue-700' : p.category === 'NHIA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{p.category || 'Other'}</span></td>
                  <td className="py-3 px-4 text-slate-500">{p.contact_person || p.contact_phone || '—'}</td>
                  <td className="py-3 px-4 text-slate-500">{p.contact_email || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openCoverage(p)} className="p-1.5 rounded-lg hover:bg-purple-50 text-slate-400 hover:text-purple-600 transition-all" title="Coverage Rules">
                        <Percent className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all" title="Edit">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {/* Deactivate/Activate — insurance staff + admin */}
                      <button onClick={() => { setConfirmToggle(p); setToggleStep(1) }}
                        className={`p-1.5 rounded-lg transition-all ${p.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                        title={p.is_active ? 'Deactivate' : 'Activate'}>
                        <Power className="w-4 h-4" />
                      </button>
                      {/* Delete — Super Admin only */}
                      {isSuperAdmin && (
                        <button onClick={() => { setConfirmDelete(p); setDeleteStep(1) }}
                          className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all" title="Delete permanently">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">No providers yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Provider' : 'Add Provider'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Provider Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                  <input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="e.g. GPHMO" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500">
                  <option value="HMO">HMO</option>
                  <option value="NHIA">NHIA</option>
                  <option value="Retainership">Retainership</option>
                  <option value="Private">Private</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                <input type="text" value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="text" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-all flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate/Activate Confirmation Modal (2 steps) */}
      {confirmToggle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmToggle(null); setToggleStep(1) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${toggleStep === 2 ? (confirmToggle.is_active ? 'bg-red-50' : 'bg-emerald-50') : (confirmToggle.is_active ? 'bg-amber-50' : 'bg-emerald-50')}`}>
                {confirmToggle.is_active ? (
                  <ToggleRight className={`w-7 h-7 ${toggleStep === 2 ? 'text-red-500' : 'text-amber-500'}`} />
                ) : (
                  <ToggleLeft className={`w-7 h-7 ${toggleStep === 2 ? 'text-emerald-600' : 'text-emerald-500'}`} />
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {toggleStep === 2 ? 'Are you sure?' : confirmToggle.is_active ? 'Deactivate Provider' : 'Activate Provider'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmToggle.name} ({confirmToggle.code})</p>
            </div>
            <div className="px-6 pb-4">
              <div className={`rounded-xl p-4 text-sm ${toggleStep === 2 ? (confirmToggle.is_active ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700') : 'bg-slate-50 text-slate-600'}`}>
                {toggleStep === 2 ? (
                  confirmToggle.is_active
                    ? <p>This will <strong>deactivate {confirmToggle.name}</strong>. Staff under it will be locked out and no new cases can be created, but existing claims remain valid.</p>
                    : <p>This will <strong>reactivate {confirmToggle.name}</strong>. Staff can log in again and new cases can be created.</p>
                ) : (
                  confirmToggle.is_active
                    ? <p>Deactivating means staff under this HMO cannot log in and no new cases can be opened. Existing claims/invoices remain valid.</p>
                    : <p>Reactivating restores access for this provider's staff and allows new cases to be created again.</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setConfirmToggle(null); setToggleStep(1) }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              {toggleStep === 1 ? (
                <button onClick={() => setToggleStep(2)}
                  className={`flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl transition-all ${confirmToggle.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  <Power className="w-4 h-4" /> {confirmToggle.is_active ? 'Yes, Deactivate' : 'Yes, Activate'}
                </button>
              ) : (
                <button onClick={executeToggle}
                  className={`flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl transition-all ${confirmToggle.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {confirmToggle.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {confirmToggle.is_active ? 'Confirm Deactivate' : 'Confirm Activate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Provider Confirmation Modal (3 steps) — Super Admin only */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmDelete(null); setDeleteStep(1) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${deleteStep === 3 ? 'bg-red-50' : deleteStep === 2 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                <AlertTriangle className={`w-7 h-7 ${deleteStep === 3 ? 'text-red-500' : deleteStep === 2 ? 'text-rose-500' : 'text-slate-400'}`} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {deleteStep === 3 ? 'Final Confirmation' : deleteStep === 2 ? 'Are you absolutely sure?' : 'Delete Provider'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmDelete.name} ({confirmDelete.code})</p>
            </div>
            <div className="px-6 pb-4">
              <div className={`rounded-xl p-4 text-sm ${deleteStep === 3 ? 'bg-red-50 text-red-700' : deleteStep === 2 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
                {deleteStep === 1 && (
                  <>
                    <p>You are about to <strong>permanently delete {confirmDelete.name}</strong>.</p>
                    <p className="text-xs mt-2">This will remove the provider and ALL related insurance data from the system.</p>
                  </>
                )}
                {deleteStep === 2 && (
                  <>
                    <p>This will permanently remove:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1 text-xs">
                      <li>All insurance cases and services for this provider</li>
                      <li>All invoices, auth requests and staff accounts</li>
                      <li>All patient insurance policies linked to this HMO</li>
                      <li>Provider's co-pay config and excluded services</li>
                    </ul>
                  </>
                )}
                {deleteStep === 3 && (
                  <>
                    <p className="font-semibold">This is irreversible and cannot be undone.</p>
                    <p className="text-xs mt-2">Once deleted, all historical claims, invoices and billing records for <strong>{confirmDelete.name}</strong> will be lost permanently.</p>
                    <p className="text-xs font-bold mt-3">Are you 100% sure you want to proceed?</p>
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setConfirmDelete(null); setDeleteStep(1) }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              {deleteStep === 1 && (
                <button onClick={() => setDeleteStep(2)} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <Trash2 className="w-4 h-4" /> Continue
                </button>
              )}
              {deleteStep === 2 && (
                <button onClick={() => setDeleteStep(3)} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <AlertTriangle className="w-4 h-4" /> Yes, Continue
                </button>
              )}
              {deleteStep === 3 && (
                <button onClick={executeDelete} disabled={deleting}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Result Modal */}
      {deleteResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Provider Deleted</h2>
              <p className="text-xs text-slate-400 mt-0.5">{deleteResult.message}</p>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
                <p>{deleteResult.detail}</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setDeleteResult(null)} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-all">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Coverage Rules Modal */}
      {showCoverageModal && coverageData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCoverageModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Coverage Rules — {coverageProvider?.name}</h2>
                <p className="text-xs text-slate-400">Set coverage percentages for services under this provider</p>
              </div>
              <button onClick={() => setShowCoverageModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0 flex items-center gap-4">
              <label className="text-sm font-medium text-slate-600">Default Coverage %</label>
              <input type="number" min="0" max="100" value={coverageData.provider?.default_coverage_pct ?? 100}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v >= 0 && v <= 100) setCoverageData((d:any) => ({ ...d, provider: { ...d.provider, default_coverage_pct: v } }))
                  else if (e.target.value === '') setCoverageData((d:any) => ({ ...d, provider: { ...d.provider, default_coverage_pct: 100 } }))
                }}
                className="w-20 px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-center font-medium" />
              <span className="text-xs text-slate-400">Applies when no category rule is set</span>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1 px-6 py-2 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
              {coverageData.categories?.map((cat: string) => (
                <button key={cat} onClick={() => setCoverageTab(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all capitalize ${coverageTab === cat ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Inventory categories (lab, pharmacy, radiology, general) */}
              {['lab', 'pharmacy', 'radiology', 'general'].includes(coverageTab) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-slate-600">All {coverageTab.replace('_', ' ')} </label>
                    <input type="number" min="0" max="100"
                      value={(() => {
                        const catRule = coverageRules.find((r: any) => r.service_type === coverageTab && !r.inventory_item_id)
                        return catRule?.coverage_percentage ?? ''
                      })()}
                      placeholder="Default"
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value)
                        setCoverageRules((prev: any) => {
                          const rest = prev.filter((r: any) => !(r.service_type === coverageTab && !r.inventory_item_id))
                          if (v !== null && !isNaN(v) && v >= 0 && v <= 100) return [...rest, { service_type: coverageTab, coverage_percentage: v }]
                          return rest
                        })
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center" />
                    <span className="text-xs text-slate-400">%</span>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Individual Overrides</h4>
                    <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 sticky top-0">
                          <th className="text-left py-2 px-3 font-medium text-slate-600 text-xs">Item</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600 text-xs">Stock</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600 text-xs">Coverage %</th>
                        </tr></thead>
                        <tbody>
                          {coverageData.inventoryItems
                            ?.filter((i: any) => i.category === coverageTab)
                            .map((item: any) => {
                              const override = coverageRules.find((r: any) => r.inventory_item_id === item.id)
                              return (
                                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-2 px-3 text-xs font-medium">{item.drug_name}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${item.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                      {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <input type="number" min="0" max="100"
                                        value={override?.coverage_percentage ?? ''}
                                        placeholder="—"
                                        onChange={e => {
                                          const v = e.target.value === '' ? null : parseInt(e.target.value)
                                          setCoverageRules((prev: any) => {
                                            const rest = prev.filter((r: any) => !(r.inventory_item_id === item.id))
                                            if (v !== null && !isNaN(v) && v >= 0 && v <= 100) return [...rest, { service_type: coverageTab, inventory_item_id: item.id, coverage_percentage: v }]
                                            return rest
                                          })
                                        }}
                                        className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-xs text-center" />
                                      {override && (
                                        <button onClick={() => setCoverageRules((prev: any) => prev.filter((r: any) => r.inventory_item_id !== item.id))}
                                          className="p-0.5 text-slate-300 hover:text-rose-500"><X size={12} /></button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Non-inventory categories (consultation, admission, maternity, procedure, fluid, folder_activation) */}
              {!['lab', 'pharmacy', 'radiology', 'general'].includes(coverageTab) && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">{coverageTab.replace('_', ' ')} services are set at the category level only.</p>
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-slate-600">Coverage %</label>
                    <input type="number" min="0" max="100"
                      value={(() => {
                        const catRule = coverageRules.find((r: any) => r.service_type === coverageTab && !r.inventory_item_id)
                        return catRule?.coverage_percentage ?? ''
                      })()}
                      placeholder="Default"
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value)
                        setCoverageRules((prev: any) => {
                          const rest = prev.filter((r: any) => !(r.service_type === coverageTab && !r.inventory_item_id))
                          if (v !== null && !isNaN(v) && v >= 0 && v <= 100) return [...rest, { service_type: coverageTab, coverage_percentage: v }]
                          return rest
                        })
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center" />
                    <span className="text-xs text-slate-400">% (blank = uses provider default: {coverageData.provider?.default_coverage_pct}%)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowCoverageModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
              <button onClick={saveCoverage} disabled={coverageSaving}
                className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all">
                {coverageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Percent className="w-4 h-4" />}
                Save Coverage Rules
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
