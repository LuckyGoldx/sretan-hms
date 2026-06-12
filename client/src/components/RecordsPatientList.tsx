import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { validatePhone } from '../utils/validatePhone'
import {
  Search, X, Loader2, Users, UserPlus, ArrowLeft, FileText, Edit2, Save, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react'
import { COUNTRIES, NIGERIA_STATES, NIGERIA_LGAS, OCCUPATIONS, RELATIONSHIPS } from '../data/formData'
import SearchableSelect from './SearchableSelect'

export default function RecordsPatientList() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editPatient, setEditPatient] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [customTypes, setCustomTypes] = useState<any[]>([])
  const perPage = 20
  const editBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadPatients(); api.get('/insurance-types').then((r) => setCustomTypes(r.data || [])).catch(() => {}) }, [])

  async function loadPatients() {
    setLoading(true)
    try { const res = await api.get('/patients'); setPatients(res.data || []); setFiltered(res.data || []) } catch {} finally { setLoading(false) }
  }

  useEffect(() => {
    const q = search.toLowerCase()
    const f = patients.filter((p) => p.full_name?.toLowerCase().includes(q) || p.hospital_number?.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
    setFiltered(f); setPage(1)
  }, [search, patients])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = filtered.slice((page - 1) * perPage, page * perPage)

  function fmtDate(v: any): string {
    if (!v) return ''
    try { var d = new Date(v); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') } catch(e) { return '' }
  }

  function validateEdit() {
    var e: Record<string, string> = {}
    if (!editForm.full_name?.trim()) e.full_name = 'Full name is required'
    if (!editForm.dob) e.dob = 'Date of birth is required'
    if (!editForm.sex) e.sex = 'Sex is required'
    if (!editForm.nationality) e.nationality = 'Nationality is required'
    if (editForm.nationality === 'Nigeria' && !editForm.state_of_origin) e.state_of_origin = 'State of origin is required'
    if (!editForm.phone?.trim()) { e.phone = 'Phone is required' } else { var v = validatePhone(editForm.phone); if (!v.valid) e.phone = v.error || 'Invalid phone' }
    if (!editForm.blood_type) e.blood_type = 'Blood type is required'
    if (!editForm.emergency_contact_name?.trim()) e.emergency_contact_name = 'Emergency contact is required'
    if (!editForm.emergency_contact_phone?.trim()) { e.emergency_contact_phone = 'Emergency phone is required' } else { var v = validatePhone(editForm.emergency_contact_phone); if (!v.valid) e.emergency_contact_phone = v.error || 'Invalid phone' }
    setEditErrors(e)
    if (Object.keys(e).length > 0 && editBodyRef.current) {
      var scrollEl = editBodyRef.current.parentElement || editBodyRef.current
      setTimeout(function() { if (scrollEl) { scrollEl.scrollTo({ top: 0 }); scrollEl.scrollTop = 0 } }, 50)
    }
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!editPatient || !validateEdit()) return
    setSaving(true)
    try {
      await api.put(`/patients/${editPatient.id}`, { ...editForm, edited_by: (JSON.parse(localStorage.getItem('sretan_user') || '{}')).id })
      setPatients((prev) => prev.map((p) => p.id === editPatient.id ? { ...p, ...editForm } : p))
      setEditPatient(null); setEditErrors({}); setPhoneErrors({})
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const esStates = editForm.nationality === 'Nigeria' ? NIGERIA_STATES : []
  const esLgas = editForm.state_of_origin && NIGERIA_LGAS[editForm.state_of_origin] ? NIGERIA_LGAS[editForm.state_of_origin] : []

  useEffect(() => {
    if (Object.keys(editErrors).length > 0 && editBodyRef.current) {
      var parent = editBodyRef.current.parentElement || editBodyRef.current
      if (parent) { parent.scrollTo({ top: 0 }); parent.scrollTop = 0 }
    }
  }, [editErrors])

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
        <div className="flex flex-col items-center py-16 text-slate-400"><Users size={48} className="text-slate-300 mb-3" /><p className="text-sm font-medium">No patients found</p></div>
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
                  <p className="text-xs text-slate-400 mb-2">{p.hospital_number} &middot; {p.sex} &middot; DOB: {fmtDate(p.dob)} &middot; {p.blood_type || 'N/A'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Phone: {p.phone || '—'}</span>
                    {p.email && <span>Email: {p.email}</span>}
                    {p.address && <span className="truncate max-w-[200px]">Address: {p.address}</span>}
                    {p.nationality && <span>Nationality: {p.nationality}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditPatient(p); setEditErrors({}); setPhoneErrors({}); setEditForm({ full_name: p.full_name, dob: fmtDate(p.dob), sex: p.sex, phone: p.phone, email: p.email || '', address: p.address || '', nationality: p.nationality || '', state_of_origin: p.state_of_origin || '', lga: p.lga || '', occupation: p.occupation || '', marital_status: p.marital_status || '', next_of_kin: p.next_of_kin || '', next_of_kin_phone: p.next_of_kin_phone || '', relationship: p.relationship || '', next_of_kin_address: p.next_of_kin_address || '', emergency_contact_name: p.emergency_contact_name || '', emergency_contact_phone: p.emergency_contact_phone || '', insurance: p.insurance || '', insurance_type: p.insurance_type || '', insurance_sub_type: p.insurance_sub_type || '', blood_type: p.blood_type || '' }) }}
                    className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors"><Edit2 size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/records/patients/${p.id}`) }}
                    className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><FileText size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4 pb-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* Edit Modal */}
      {editPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving) setEditPatient(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><Edit2 size={18} className="inline text-primary mr-2" />Edit Patient</h2>
              <button onClick={() => setEditPatient(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5" ref={editBodyRef as any}>
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><p className="text-sm font-semibold text-slate-800">{editPatient.full_name}</p><p className="text-xs text-slate-400">{editPatient.hospital_number}</p></div>
              </div>

              {Object.keys(editErrors).length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                  <p className="font-medium mb-1">Please fix the following errors:</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">{Object.entries(editErrors).map(function(e) { return <li key={e[0]}>{e[1]}</li> })}</ul>
                </div>
              )}

              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
                  <input type="text" value={editForm.full_name || ''} onChange={(e) => { setEditForm((p: any) => ({ ...p, full_name: e.target.value })); setEditErrors((prev) => { var n = { ...prev }; delete n.full_name; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                  {editErrors.full_name && <p className="text-xs text-rose-500 mt-1">{editErrors.full_name}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth *</label>
                  <input type="date" value={editForm.dob || ''} onChange={(e) => { setEditForm((p: any) => ({ ...p, dob: e.target.value })); setEditErrors((prev) => { var n = { ...prev }; delete n.dob; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                  {editErrors.dob && <p className="text-xs text-rose-500 mt-1">{editErrors.dob}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Sex *</label>
                  <select value={editForm.sex || ''} onChange={(e) => { setEditForm((p: any) => ({ ...p, sex: e.target.value })); setEditErrors((prev) => { var n = { ...prev }; delete n.sex; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200')}>
                    <option value="">Select...</option><option>Male</option><option>Female</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                  <select value={editForm.marital_status || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, marital_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                  <SearchableSelect value={editForm.occupation || ''} onChange={(v) => setEditForm((p: any) => ({ ...p, occupation: v }))} options={OCCUPATIONS} placeholder="Search occupation..." /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nationality *</label>
                  <SearchableSelect value={editForm.nationality || ''} onChange={(v) => { setEditForm((p: any) => ({ ...p, nationality: v, state_of_origin: '', lga: '' })); setEditErrors((prev) => { var n = { ...prev }; delete n.nationality; return n }) }} options={COUNTRIES} placeholder="Search country..." />
                  {editErrors.nationality && <p className="text-xs text-rose-500 mt-1">{editErrors.nationality}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">State of Origin{editForm.nationality === 'Nigeria' ? ' *' : ''}</label>
                  {editForm.nationality === 'Nigeria' ? (
                    <SearchableSelect value={editForm.state_of_origin || ''} onChange={(v) => { setEditForm((p: any) => ({ ...p, state_of_origin: v, lga: '' })); setEditErrors((prev) => { var n = { ...prev }; delete n.state_of_origin; return n }) }} options={esStates} placeholder="Search state..." />
                  ) : (
                    <input type="text" placeholder="Enter state/province" value={editForm.state_of_origin || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, state_of_origin: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
                  {editErrors.state_of_origin && <p className="text-xs text-rose-500 mt-1">{editErrors.state_of_origin}</p>}
                </div>
              </div>
              {editForm.state_of_origin && editForm.nationality === 'Nigeria' && (
                <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA</label>
                  <SearchableSelect value={editForm.lga || ''} onChange={(v) => setEditForm((p: any) => ({ ...p, lga: v }))} options={esLgas} placeholder="Search LGA..." /></div>
              )}
              {editForm.state_of_origin && editForm.nationality !== 'Nigeria' && (
                <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA / District</label>
                  <input type="text" placeholder="Enter LGA" value={editForm.lga || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, lga: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
              )}

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
                    <input type="text" value={editForm.phone || ''} onChange={(e) => { var v = e.target.value.replace(/[^0-9+]/g, ''); setEditForm((p: any) => ({ ...p, phone: v })); if (v && !validatePhone(v).valid) setPhoneErrors((prev: any) => ({ ...prev, phone: validatePhone(v).error })); else setPhoneErrors((prev: any) => { var n = { ...prev }; delete n.phone; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.phone || phoneErrors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                    {(editErrors.phone || phoneErrors.phone) && <p className="text-xs text-rose-500 mt-1">{phoneErrors.phone || editErrors.phone}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                    <textarea rows={2} value={editForm.address || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                    <input type="text" value={editForm.next_of_kin || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, next_of_kin: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Relationship</label>
                    <SearchableSelect value={editForm.relationship || ''} onChange={(v) => setEditForm((p: any) => ({ ...p, relationship: v }))} options={RELATIONSHIPS} placeholder="Select relationship..." /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Phone</label>
                    <input type="text" value={editForm.next_of_kin_phone || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, next_of_kin_phone: e.target.value.replace(/[^0-9+]/g, '') }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Address</label>
                    <textarea rows={2} value={editForm.next_of_kin_address || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, next_of_kin_address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact *</label>
                    <input type="text" value={editForm.emergency_contact_name || ''} onChange={(e) => { setEditForm((p: any) => ({ ...p, emergency_contact_name: e.target.value })); setEditErrors((prev: any) => { var n = { ...prev }; delete n.emergency_contact_name; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.emergency_contact_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                    {editErrors.emergency_contact_name && <p className="text-xs text-rose-500 mt-1">{editErrors.emergency_contact_name}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone *</label>
                    <input type="text" value={editForm.emergency_contact_phone || ''} onChange={(e) => { var v = e.target.value.replace(/[^0-9+]/g, ''); setEditForm((p: any) => ({ ...p, emergency_contact_phone: v })); if (v && !validatePhone(v).valid) setPhoneErrors((prev: any) => ({ ...prev, emergency_contact_phone: validatePhone(v).error })); else setPhoneErrors((prev: any) => { var n = { ...prev }; delete n.emergency_contact_phone; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.emergency_contact_phone || phoneErrors.emergency_contact_phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                    {(editErrors.emergency_contact_phone || phoneErrors.emergency_contact_phone) && <p className="text-xs text-rose-500 mt-1">{phoneErrors.emergency_contact_phone || editErrors.emergency_contact_phone}</p>}</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Medical</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Blood Type *</label>
                    <select value={editForm.blood_type || ''} onChange={(e) => { setEditForm((p: any) => ({ ...p, blood_type: e.target.value })); setEditErrors((prev: any) => { var n = { ...prev }; delete n.blood_type; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.blood_type ? 'border-rose-300 bg-rose-50' : 'border-slate-200')}>
                      <option value="">Select...</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select>
                    {editErrors.blood_type && <p className="text-xs text-rose-500 mt-1">{editErrors.blood_type}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Insurance</label>
                    <select value={editForm.insurance || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, insurance: e.target.value, insurance_type: '', insurance_sub_type: '' }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option>Private</option><option>HMO</option><option>NHIA</option><option>Retainership</option><option value="__other__">Other</option></select></div>
                </div>
                {['HMO', 'Retainership'].includes(editForm.insurance) && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                    <select value={editForm.insurance_type || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, insurance_type: e.target.value }))}
                      className="flex-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white">
                      <option value="">Select...</option>
                      {editForm.insurance === 'Retainership' && <><option value="CBN">Central Bank of Nigeria (CBN)</option><option value="Zenith Bank">Zenith Bank</option></>}
                      {customTypes.filter(function(c) { return c.provider === editForm.insurance }).map(function(c) { return <option key={c.id} value={c.type_name}>{c.type_name}</option> })}
                      <option value="Other">Other</option>
                    </select>
                    {editForm.insurance_type === 'Other' && (
                      <input type="text" placeholder="Enter type..." value={editForm.insurance_sub_type || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, insurance_sub_type: e.target.value }))}
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    )}
                  </div>
                )}
                {editForm.insurance === '__other__' && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Provider Name</label>
                    <input type="text" placeholder="e.g. AXA Mansard, Leadway" value={editForm.insurance_sub_type || ''} onChange={(e) => setEditForm((p: any) => ({ ...p, insurance_sub_type: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditPatient(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
