import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import {
  Building2, Loader2, Plus, X, Search, CheckCircle, XCircle, Users,
  Power, Pencil, Stethoscope,
} from 'lucide-react'

interface Department {
  id: string
  name: string
  code?: string
  description?: string
  modules?: string[]
  status: string
  consultant_count?: number
}

interface ToastState { show: boolean; message: string; type: 'success' | 'error' }

const MODULE_OPTIONS = [
  { value: 'maternity', label: 'Maternity' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'finance', label: 'Finance' },
]

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => { if (toast.show) { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) } }, [toast.show, onClose])
  if (!toast.show) return null
  return (
    <div className={`fixed top-6 right-6 z-[70] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm ${
      toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="ml-2 p-0.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" /></button>
    </div>
  )
}

export default function DepartmentsAdmin() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '', modules: [] as string[] })
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  const showToast = useCallback((message: string, type: 'success' | 'error') => setToast({ show: true, message, type }), [])
  const dismissToast = useCallback(() => setToast((p) => ({ ...p, show: false })), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/departments').catch(() => ({ data: [] }))
      setDepartments(res.data || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = departments.filter((d) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return d.name.toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q)
  })

  function openAdd() {
    setEditing(null)
    setForm({ name: '', code: '', description: '', modules: [] })
    setShowModal(true)
  }

  function openEdit(d: Department) {
    setEditing(d)
    setForm({ name: d.name, code: d.code || '', description: d.description || '', modules: d.modules || [] })
    setShowModal(true)
  }

  function toggleModule(m: string) {
    setForm((p) => ({
      ...p,
      modules: p.modules.includes(m) ? p.modules.filter((x) => x !== m) : [...p.modules, m],
    }))
  }

  async function submit() {
    if (!form.name.trim()) { showToast('Department name is required', 'error'); return }
    setSubmitting(true)
    try {
      if (editing) {
        await api.put(`/departments/${editing.id}`, { ...form, name: form.name.trim(), code: form.code.trim() || null, description: form.description.trim() || null, performed_by: currentStaffId })
        showToast('Department updated', 'success')
      } else {
        await api.post('/departments', { ...form, name: form.name.trim(), code: form.code.trim() || null, description: form.description.trim() || null, performed_by: currentStaffId })
        showToast('Department created', 'success')
      }
      setShowModal(false)
      load()
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to save department', 'error')
    } finally { setSubmitting(false) }
  }

  async function toggleStatus(d: Department) {
    try {
      if (d.status === 'active') {
        await api.delete(`/departments/${d.id}`)
        showToast('Department deactivated', 'success')
      } else {
        await api.put(`/departments/${d.id}`, { status: 'active', performed_by: currentStaffId })
        showToast('Department activated', 'success')
      }
      load()
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to update department', 'error')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={dismissToast} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Building2 size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Departments</h1>
            <p className="text-sm text-slate-500">Manage departments and consultant rosters</p>
          </div>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors">
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search departments..."
          className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full sm:w-72"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No departments found</p>
          </div>
        )}
        {filtered.map((d) => (
          <div key={d.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${d.status === 'active' ? 'border-slate-100' : 'border-slate-200 opacity-70'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800 truncate">{d.name}</h3>
                {d.code && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{d.code}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleStatus(d)}
                  className={`p-1.5 rounded-lg hover:bg-slate-100 ${d.status === 'active' ? 'text-emerald-500' : 'text-slate-400'}`}
                  title={d.status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>
            </div>

            {d.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{d.description}</p>}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium">
                <Stethoscope className="w-3 h-3" /> {d.consultant_count || 0} consultant{(d.consultant_count || 0) !== 1 ? 's' : ''}
              </span>
              {d.modules && d.modules.length > 0 && d.modules.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-semibold uppercase">{m}</span>
              ))}
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                d.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
              }`}>{d.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { if (!submitting) setShowModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Building2 size={18} className="text-indigo-500" /> {editing ? 'Edit Department' : 'Add Department'}
              </h2>
              <button onClick={() => { if (!submitting) setShowModal(false) }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name <span className="text-rose-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Cardiology"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="e.g. CAR"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Department purpose..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Module Access</label>
                <div className="flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleModule(m.value)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                        form.modules.includes(m.value)
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowModal(false)} disabled={submitting} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors disabled:opacity-60">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
