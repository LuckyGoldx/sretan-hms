import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, X, Loader2, Users, UserPlus, ArrowLeft, FileText, Edit2, Save, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react'

export default function RecordsPatientList() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editPatient, setEditPatient] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const perPage = 20

  useEffect(() => { loadPatients() }, [])

  async function loadPatients() {
    setLoading(true)
    try {
      const res = await api.get('/patients')
      setPatients(res.data || [])
      setFiltered(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => {
    const q = search.toLowerCase()
    const f = patients.filter((p) =>
      p.full_name?.toLowerCase().includes(q) ||
      p.hospital_number?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
    setFiltered(f)
    setPage(1)
  }, [search, patients])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = filtered.slice((page - 1) * perPage, page * perPage)

  async function handleSave() {
    if (!editPatient) return
    setSaving(true)
    try {
      await api.put(`/patients/${editPatient.id}`, editForm)
      setPatients((prev) => prev.map((p) => p.id === editPatient.id ? { ...p, ...editForm } : p))
      setEditPatient(null)
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div><h1 className="text-xl font-semibold text-slate-800">Patient Records</h1><p className="text-sm text-slate-400">View and update patient demographic information</p></div>
        </div>
        <button onClick={() => navigate('/patients/register')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><UserPlus size={15} /> Register New</button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search by name, hospital number, phone, or email..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-11 pr-10 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2"><X size={16} className="text-slate-400" /></button>}
      </div>

      <p className="text-xs text-slate-400">{filtered.length} patients found</p>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
      ) : paged.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <Users size={48} className="text-slate-300 mb-3" /><p className="text-sm font-medium">No patients found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paged.map((p) => (
            <div key={p.id} onClick={() => navigate(`/records/patients/${p.id}`)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-semibold text-slate-800">{p.full_name}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${p.status === 'checked_in' ? 'bg-blue-100 text-blue-700' : p.status === 'in_triage' ? 'bg-amber-100 text-amber-700' : p.status === 'with_doctor' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{p.status?.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{p.hospital_number} &middot; {p.sex} &middot; DOB: {p.dob?.slice(0, 10)} &middot; {p.blood_type || 'N/A'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Phone: {p.phone || '—'}</span>
                    {p.email && <span>Email: {p.email}</span>}
                    {p.address && <span className="truncate max-w-[200px]">Address: {p.address}</span>}
                    {p.nationality && <span>Nationality: {p.nationality}</span>}
                    {p.occupation && <span>Occupation: {p.occupation}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditPatient(p); setEditForm({ full_name: p.full_name, dob: p.dob?.slice(0, 10), sex: p.sex, phone: p.phone, email: p.email || '', address: p.address || '', next_of_kin: p.next_of_kin || '', emergency_contact_name: p.emergency_contact_name || '', emergency_contact_phone: p.emergency_contact_phone || '', insurance: p.insurance || '', blood_type: p.blood_type || '', occupation: p.occupation || '', marital_status: p.marital_status || '', nationality: p.nationality || '' }) }}
                    className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => navigate(`/records/patients/${p.id}`)}
                    className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><FileText size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4 pb-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* Edit Patient Modal */}
      {editPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving) setEditPatient(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Edit2 size={18} className="text-primary" /> Edit Patient</h2>
              <button onClick={() => setEditPatient(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{editPatient.full_name}</p>
                  <p className="text-xs text-slate-400">{editPatient.hospital_number}</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Demographics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
                    <input type="text" value={editForm.full_name}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, full_name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth</label>
                    <input type="date" value={editForm.dob}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, dob: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Sex</label>
                    <select value={editForm.sex} onChange={(e) => setEditForm((p: any) => ({ ...p, sex: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                    <select value={editForm.marital_status} onChange={(e) => setEditForm((p: any) => ({ ...p, marital_status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option value="Single">Single</option><option value="Married">Married</option>
                      <option value="Divorced">Divorced</option><option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Nationality</label>
                    <input type="text" value={editForm.nationality}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, nationality: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                    <input type="text" value={editForm.occupation}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, occupation: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                    <input type="text" value={editForm.phone}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" value={editForm.email}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                    <textarea rows={2} value={editForm.address}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin</label>
                    <input type="text" value={editForm.next_of_kin}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, next_of_kin: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact</label>
                    <input type="text" value={editForm.emergency_contact_name}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, emergency_contact_name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone</label>
                    <input type="text" value={editForm.emergency_contact_phone}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, emergency_contact_phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Medical</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
                    <select value={editForm.blood_type} onChange={(e) => setEditForm((p: any) => ({ ...p, blood_type: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option>
                      <option value="A+">A+</option><option value="A-">A-</option>
                      <option value="B+">B+</option><option value="B-">B-</option>
                      <option value="AB+">AB+</option><option value="AB-">AB-</option>
                      <option value="O+">O+</option><option value="O-">O-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Insurance</label>
                    <input type="text" value={editForm.insurance}
                      onChange={(e) => setEditForm((p: any) => ({ ...p, insurance: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditPatient(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !editForm.full_name.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
