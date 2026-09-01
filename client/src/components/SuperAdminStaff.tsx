import { useState, useEffect } from 'react'
import {
  Users, Plus, X, Loader2, Trash2, Pencil, CheckCircle, Search, Eye, EyeOff
} from 'lucide-react'
import api from '../hooks/superadminApi'

interface Tenant {
  id: string
  hospital_name: string
}

interface Staff {
  id: string
  email: string
  username: string
  name: string
  role: string
  phone: string | null
  status: string
  department_id: string | null
  department_name: string | null
  tenant_id: string
  hospital_name: string | null
}

interface Department {
  id: string
  name: string
  code: string | null
}

const ROLES = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin', 'Finance', 'Radiology', 'Consultant']

export default function SuperAdminStaff() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantFilter, setTenantFilter] = useState('')
  const [staff, setStaff] = useState<Staff[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [form, setForm] = useState({
    tenant_id: '', name: '', username: '', email: '', role: 'Nurse', phone: '', password: '', department_id: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  async function fetchTenants() {
    try {
      const res = await api.get('/superadmin/tenants')
      setTenants(res.data)
    } catch {}
  }

  async function fetchStaff(tenantId: string) {
    setLoading(true)
    try {
      const params = tenantId ? { tenant_id: tenantId } : {}
      const res = await api.get('/superadmin/staff', { params })
      setStaff(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  async function fetchDepartments(tenantId: string) {
    if (!tenantId) { setDepartments([]); return }
    try {
      const res = await api.get('/superadmin/departments', { params: { tenant_id: tenantId } })
      setDepartments(res.data)
    } catch { setDepartments([]) }
  }

  useEffect(() => { fetchTenants() }, [])

  useEffect(() => {
    fetchStaff(tenantFilter)
  }, [tenantFilter])

  function openCreate() {
    setEditing(null)
    setForm({ tenant_id: tenantFilter || '', name: '', username: '', email: '', role: 'Nurse', phone: '', password: '', department_id: '' })
    setFormError('')
    setShowModal(true)
    if (tenantFilter) fetchDepartments(tenantFilter)
  }

  function openEdit(s: Staff) {
    setEditing(s)
    setForm({
      tenant_id: s.tenant_id, name: s.name, username: s.username || '', email: s.email,
      role: s.role, phone: s.phone || '', password: '', department_id: s.department_id || '',
    })
    setFormError('')
    setShowModal(true)
    fetchDepartments(s.tenant_id)
  }

  async function handleSave() {
    if (!form.tenant_id) { setFormError('Select a hospital (tenant)'); return }
    if (!form.name.trim() || !form.email.trim() || !form.role) { setFormError('Name, email and role are required'); return }
    if (!editing && !form.password) { setFormError('Password is required for new staff'); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        tenant_id: form.tenant_id,
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
        phone: form.phone.trim() || null,
        department_id: form.department_id || null,
      }
      if (editing) {
        if (form.password) (payload as any).password = form.password
        await api.put(`/superadmin/staff/${editing.id}`, payload)
      } else {
        (payload as any).password = form.password
        await api.post('/superadmin/staff', payload)
      }
      setShowModal(false)
      await fetchStaff(tenantFilter)
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to save staff')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Staff) {
    if (!window.confirm(`Delete ${s.name} (${s.role}) from ${s.hospital_name || 'hospital'}?`)) return
    try {
      await api.delete(`/superadmin/staff/${s.id}`, { params: { tenant_id: s.tenant_id } })
      await fetchStaff(tenantFilter)
    } catch {}
  }

  const filtered = staff.filter((s) => {
    const q = search.toLowerCase()
    if (!q) return true
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q) || s.role.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage staff across all hospitals, including Admin accounts</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username or role..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 md:w-72"
        >
          <option value="">All hospitals</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.hospital_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No staff found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Hospital</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-5 py-3 text-slate-500">{s.username || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{s.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      s.role === 'Admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.department_name || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{s.hospital_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) setShowModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital</label>
                <select
                  value={form.tenant_id}
                  onChange={(e) => { setForm((f) => ({ ...f, tenant_id: e.target.value, department_id: '' })); fetchDepartments(e.target.value) }}
                  disabled={!!editing}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                >
                  <option value="">Select hospital...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.hospital_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                  <input type="text" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="auto from email if blank"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Department</label>
                  <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— None —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password {editing && <span className="text-xs text-slate-400 font-normal">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--primary-color)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
