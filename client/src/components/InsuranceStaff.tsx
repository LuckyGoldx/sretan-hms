import { useState, useEffect } from 'react'
import { Loader2, Plus, X, Edit3, Shield, Trash2, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'

export default function InsuranceStaff() {
  const [staff, setStaff] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'viewer', access_scope: 'own', provider_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadData()
  }, [])

  const isSuperAdmin = currentUser && currentUser.user_type !== 'insurance_staff'
  const canAccess = !currentUser || isSuperAdmin || currentUser.role === 'admin'

  async function loadData() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [provRes, staffRes] = await Promise.all([
        api.get('/insurance/providers'),
        api.get('/insurance/staff'),
      ])
      setProviders(Array.isArray(provRes.data) ? provRes.data : [])
      setStaff(Array.isArray(staffRes.data) ? staffRes.data : [])
    } catch {} finally { setLoading(false) }
  }

  function openNew() {
    setEditing(null)
    setForm({ full_name: '', email: '', phone: '', password: '', role: 'viewer', access_scope: 'own', provider_id: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(s: any) {
    setEditing(s)
    setForm({ full_name: s.full_name, email: s.email, phone: s.phone || '', password: '', role: s.role, access_scope: s.access_scope, provider_id: s.provider_id || '' })
    setError('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.email) { setError('Name and email are required'); return }
    if (!editing && !form.password) { setError('Password is required for new staff'); return }
    setSaving(true); setError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      const payload = { ...form, provider_id: form.provider_id || null, access_scope: form.access_scope }
      if (editing) {
        const updatePayload: any = { full_name: form.full_name, phone: form.phone, role: form.role, access_scope: form.access_scope, provider_id: form.provider_id || null }
        if (form.password) updatePayload.password = form.password
        await api.put(`/insurance/staff/${editing.id}`, updatePayload)
      } else {
        await api.post('/insurance/staff', payload)
      }
      setShowModal(false)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function toggleActive(s: any) {
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.patch(`/insurance/staff/${s.id}/status`, { is_active: !s.is_active })
      await loadData()
    } catch {}
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.delete(`/insurance/staff/${confirmDelete.id}`)
      setConfirmDelete(null)
      await loadData()
    } catch { alert('Failed to delete staff') }
    finally { setDeleting(false) }
  }

  const filteredStaff = (filterProvider
    ? staff.filter((s: any) => s.provider_id === filterProvider)
    : staff
  ).filter((s: any) => s.id !== currentUser?.id)

  if (!canAccess) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Shield className="w-12 h-12 text-slate-200 mb-3" />
      <h2 className="text-lg font-semibold text-slate-700">Access Denied</h2>
      <p className="text-sm text-slate-500 mt-1">Only insurance administrators can manage staff accounts.</p>
    </div>
  )
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Insurance Staff</h1>
          <p className="text-sm text-slate-500 mt-1">{filteredStaff.length} staff account{filteredStaff.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Providers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Name</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Email</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Role</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Scope</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((s: any) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium">{s.full_name}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{s.email}</td>
                  <td className="py-3 px-4 text-xs">{s.provider_name || <span className="text-amber-600">All Providers</span>}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.role === 'admin' ? 'bg-purple-100 text-purple-700' : s.role === 'editor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs font-medium ${s.access_scope === 'all' ? 'text-amber-600' : 'text-slate-500'}`}>
                      {s.access_scope === 'all' ? 'All HMOs' : 'Own HMO'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all" title="Edit">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {/* Deactivate/Activate — insurance admin and clinical admin see this */}
                      <button onClick={() => setConfirmToggle(s)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-all text-slate-500 hover:bg-amber-50 hover:text-amber-700" title={s.is_active ? 'Deactivate' : 'Activate'}>
                        {s.is_active ? <><ToggleRight className="w-3.5 h-3.5" /> Active</> : <><ToggleLeft className="w-3.5 h-3.5" /> Inactive</>}
                      </button>
                      {/* Delete — only clinical admin / super admin sees this */}
                      {isSuperAdmin && (
                        <button onClick={() => setConfirmDelete(s)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all" title="Delete permanently">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStaff.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-slate-400">No staff found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input type="email" value={form.email} disabled={!!editing} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{editing ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                <select value={form.provider_id} onChange={e => setForm(p => ({ ...p, provider_id: e.target.value, access_scope: e.target.value ? 'own' : 'all' }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500">
                  <option value="">All Providers (access_scope = all)</option>
                  {providers.filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">
                  {form.provider_id ? 'Access scope: Own HMO (can only see this provider\'s data)' : 'Access scope: All HMOs (can see all providers\' data)'}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-all">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Save Changes' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate/Deactivate Confirmation Modal */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmToggle(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-full ${confirmToggle.is_active ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                {confirmToggle.is_active
                  ? <ToggleRight className="w-6 h-6 text-rose-500" />
                  : <ToggleLeft className="w-6 h-6 text-emerald-500" />
                }
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{confirmToggle.is_active ? 'Deactivate Staff' : 'Activate Staff'}</h2>
                <p className="text-sm text-slate-500">{confirmToggle.is_active ? 'Temporarily disable access' : 'Restore access'}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-700">
                {confirmToggle.is_active
                  ? <>Are you sure you want to deactivate <span className="font-semibold">{confirmToggle.full_name}</span>? They will be unable to log in until reactivated.</>
                  : <>Are you sure you want to activate <span className="font-semibold">{confirmToggle.full_name}</span>? They will regain access to their account.</>
                }
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmToggle(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={async () => {
                await toggleActive(confirmToggle)
                setConfirmToggle(null)
              }} className={`flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl transition-all ${confirmToggle.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {confirmToggle.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {confirmToggle.is_active ? 'Yes, Deactivate' : 'Yes, Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Super Admin only) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-full bg-rose-50">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Delete Staff</h2>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-700">
                You are about to permanently delete <span className="font-semibold">{confirmDelete.full_name}</span>
                {confirmDelete.email && <span> ({confirmDelete.email})</span>}.
              </p>
              <p className="text-xs text-rose-600 mt-2">All access for this staff member will be immediately revoked.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 disabled:opacity-60 transition-all">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
