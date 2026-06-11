import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { User, Phone, Shield, Check, ChevronRight, ChevronLeft, Loader2, ArrowLeft, Mail, MapPin, Heart, Briefcase, Globe, Upload, X, Trash2, Maximize2 } from 'lucide-react'
import api from '../hooks/useAxios'
import { compressImage } from '../utils/compressImage'
import { COUNTRIES, NIGERIA_STATES, NIGERIA_LGAS, OCCUPATIONS, RELATIONSHIPS } from '../data/formData'
import SearchableSelect from './SearchableSelect'

interface FormData {
  full_name: string; dob: string; sex: string
  phone: string; email: string; address: string
  nationality: string; state_of_origin: string; lga: string
  occupation: string; marital_status: string
  next_of_kin: string; relationship: string; next_of_kin_address: string
  emergency_contact_name: string; emergency_contact_phone: string
  insurance: string; insurance_type: string; insurance_sub_type: string
  blood_type: string
}

const initialForm: FormData = {
  full_name: '', dob: '', sex: '', phone: '', email: '', address: '',
  nationality: 'Nigeria', state_of_origin: '', lga: '',
  occupation: '', marital_status: '',
  next_of_kin: '', relationship: '', next_of_kin_address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  insurance: '', insurance_type: '', insurance_sub_type: '', blood_type: '',
}

const steps = [
  { title: 'Personal Info', icon: User },
  { title: 'Contact', icon: Phone },
  { title: 'Medical', icon: Shield },
  { title: 'Documents', icon: Upload },
  { title: 'Register', icon: Check },
]

interface DocItem { type: string; file: File; preview: string }

export default function PatientRegistration() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [customTypes, setCustomTypes] = useState<any[]>([])
  const [fullscreenPreview, setFullscreenPreview] = useState<string | null>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) { const parsed = JSON.parse(u); setCurrentUser(parsed); if (parsed.id) api.get('/insurance-types').then((r) => setCustomTypes(r.data || [])).catch(() => {}) } } catch {}
  }, [])

  const isAdmin = currentUser?.role === 'Admin'

  const update = (field: keyof FormData, value: string) => { setForm((p) => ({ ...p, [field]: value })); setErrors((p) => ({ ...p, [field]: undefined })) }

  const states = form.nationality === 'Nigeria' ? NIGERIA_STATES : []
  const lgas = form.state_of_origin && NIGERIA_LGAS[form.state_of_origin] ? NIGERIA_LGAS[form.state_of_origin] : []

  async function addDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    const reader = new FileReader()
    reader.onload = (ev) => { setDocuments((prev) => [...prev, { type: '', file: compressed, preview: ev.target?.result as string }]) }
    reader.readAsDataURL(compressed)
    e.target.value = ''
  }

  function removeDoc(i: number) { setDocuments((prev) => prev.filter((_, idx) => idx !== i)) }
  function updateDocType(i: number, type: string) { setDocuments((prev) => prev.map((d, idx) => idx === i ? { ...d, type } : d)) }

  const getTypeOptions = () => {
    const base = form.insurance === 'Retainership' ? ['CBN', 'Zenith Bank'] : []
    const custom = customTypes.filter((c) => c.provider === form.insurance).map((c) => c.type_name)
    return [...base, ...custom, 'Other']
  }

  async function saveCustomType(name: string) {
    if (!name || name === 'Other') return
    try {
      const res = await api.post('/insurance-types', { provider: form.insurance, type_name: name, created_by: currentUser?.id })
      setCustomTypes((prev) => [...prev, res.data])
    } catch {}
  }

  async function deleteCustomType(id: string) {
    if (!confirm('Delete this custom type?')) return
    try { await api.delete(`/insurance-types/${id}`); setCustomTypes((prev) => prev.filter((c) => c.id !== id)); if (form.insurance_type === customTypes.find((c) => c.id === id)?.type_name) update('insurance_type', '') } catch {}
  }

  const validateStep = (s: number) => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (s === 0) { if (!form.full_name.trim()) e.full_name = 'Required'; if (!form.dob) e.dob = 'Required'; if (!form.sex) e.sex = 'Required'; if (!form.nationality) e.nationality = 'Required'; if (form.nationality === 'Nigeria' && !form.state_of_origin) e.state_of_origin = 'Required' }
    else if (s === 1) { if (!form.phone.trim()) e.phone = 'Required' }
    setErrors(e); return Object.keys(e).length === 0
  }

  const handleNext = () => { if (validateStep(step)) setStep((p) => Math.min(p + 1, 4)) }
  const handleBack = () => setStep((p) => Math.max(p - 1, 0))

  const handleSubmit = async () => {
    if (!validateStep(step)) return
    setSubmitting(true)
    try {
      const payload = {
        id: uuidv4(), status: 'checked_in',
        full_name: form.full_name.trim(), dob: form.dob, sex: form.sex,
        phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(),
        nationality: form.nationality, state_of_origin: form.state_of_origin, lga: form.lga,
        occupation: form.occupation, marital_status: form.marital_status,
        next_of_kin: form.next_of_kin.trim(), relationship: form.relationship, next_of_kin_address: form.next_of_kin_address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(), emergency_contact_phone: form.emergency_contact_phone.trim(),
        insurance: form.insurance, insurance_type: form.insurance_type, insurance_sub_type: form.insurance_sub_type,
        blood_type: form.blood_type,
      }
      // Save custom type if user typed Other (before patient creation)
      if (form.insurance_type === 'Other' && form.insurance_sub_type) {
        await saveCustomType(form.insurance_sub_type)
      }

      const patient = await api.post('/patients', payload)

      // Upload documents
      for (const doc of documents) {
        const fd = new FormData()
        fd.append('file', doc.file)
        fd.append('document_type', doc.type || 'id_card')
        fd.append('notes', 'Uploaded during registration')
        fd.append('uploaded_by', currentUser?.id || '')
        await api.post(`/patients/${patient.data.id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {})
      }

      setSuccess(true)
      setTimeout(() => navigate('/records/patients'), 1500)
    } catch (err: any) {
      setErrors({ full_name: err.response?.data?.message || 'Registration failed' })
    } finally { setSubmitting(false) }
  }

  const { showType } = { showType: ['HMO', 'Retainership'].includes(form.insurance) }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Patient Registration</h1>
        <p className="text-sm text-slate-500 mt-1">Register a new patient in the system</p>
      </div>

      {success ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"><Check className="w-7 h-7 text-emerald-600" /></div>
          <h2 className="text-lg font-semibold text-slate-800">Patient Registered Successfully</h2>
          <p className="text-sm text-slate-500 mt-1">Redirecting to patient records...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {steps.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.title} className={`flex-1 text-center py-4 text-xs font-medium whitespace-nowrap px-2 ${i === step ? 'bg-primary/5 text-primary border-b-2 border-primary' : i < step ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <Icon size={14} className="inline mr-1" />{s.title}
                </div>
              )
            })}
          </div>

          <div className="p-6 sm:p-8">
            {/* Step 0: Personal Info */}
            {step === 0 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Personal Information</h2>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
                  <input type="text" placeholder="Enter patient's full name" value={form.full_name}
                    onChange={(e) => update('full_name', e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                  {errors.full_name && <p className="text-xs text-rose-500 mt-1">{errors.full_name}</p>}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth *</label>
                    <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.dob && <p className="text-xs text-rose-500 mt-1">{errors.dob}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Sex *</label>
                    <select value={form.sex} onChange={(e) => update('sex', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                      <option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option></select>
                    {errors.sex && <p className="text-xs text-rose-500 mt-1">{errors.sex}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                    <select value={form.marital_status} onChange={(e) => update('marital_status', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option value="Single">Single</option><option value="Married">Married</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option></select></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                    <SearchableSelect value={form.occupation} onChange={(v) => update('occupation', v)} options={OCCUPATIONS} placeholder="Search occupation..." /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Nationality *</label>
                    <SearchableSelect value={form.nationality} onChange={(v) => { update('nationality', v); update('state_of_origin', ''); update('lga', '') }} options={COUNTRIES} placeholder="Search country..." defaultOpen /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">State of Origin {form.nationality === 'Nigeria' ? '*' : ''}</label>
                    {form.nationality === 'Nigeria' ? (
                      <SearchableSelect value={form.state_of_origin} onChange={(v) => { update('state_of_origin', v); update('lga', '') }} options={states} placeholder="Search state..." />
                    ) : (
                      <input type="text" placeholder="Enter state/province" value={form.state_of_origin}
                        onChange={(e) => update('state_of_origin', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
                    {errors.state_of_origin && <p className="text-xs text-rose-500 mt-1">{errors.state_of_origin}</p>}</div>
                </div>
                {form.state_of_origin && form.nationality === 'Nigeria' && (
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA</label>
                    <SearchableSelect value={form.lga} onChange={(v) => update('lga', v)} options={lgas} placeholder="Search LGA..." /></div>
                )}
                {form.state_of_origin && form.nationality !== 'Nigeria' && (
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA / District</label>
                    <input type="text" placeholder="Enter LGA or district" value={form.lga}
                      onChange={(e) => update('lga', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                )}
              </div>
            )}

            {/* Step 1: Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Contact Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
                    <input type="tel" placeholder="e.g. +234 801 234 5678" value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" placeholder="patient@example.com" value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                </div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
                  <textarea rows={2} placeholder="Street, city, state..." value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                      <input type="text" placeholder="Full name" value={form.next_of_kin}
                        onChange={(e) => update('next_of_kin', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Relationship</label>
                      <SearchableSelect value={form.relationship} onChange={(v) => update('relationship', v)} options={RELATIONSHIPS} placeholder="Select relationship..." /></div>
                  </div>
                  <div className="mt-4"><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Address</label>
                    <textarea rows={2} placeholder="Address..." value={form.next_of_kin_address}
                      onChange={(e) => update('next_of_kin_address', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact Name</label>
                      <input type="text" placeholder="Full name" value={form.emergency_contact_name}
                        onChange={(e) => update('emergency_contact_name', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone</label>
                      <input type="tel" placeholder="Phone number" value={form.emergency_contact_phone}
                        onChange={(e) => update('emergency_contact_phone', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Medical */}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Medical Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
                    <select value={form.blood_type} onChange={(e) => update('blood_type', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option>
                      <option value="A+">A+</option><option value="A-">A-</option>
                      <option value="B+">B+</option><option value="B-">B-</option>
                      <option value="AB+">AB+</option><option value="AB-">AB-</option>
                      <option value="O+">O+</option><option value="O-">O-</option>
                    </select></div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Insurance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Provider</label>
                      <select value={form.insurance} onChange={(e) => { update('insurance', e.target.value); update('insurance_type', ''); update('insurance_sub_type', '') }}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                        <option value="">Select...</option>
                        <option value="Private">Private</option>
                        <option value="HMO">HMO</option>
                        <option value="NHIA">NHIA</option>
                        <option value="Retainership">Retainership</option>
                      </select></div>
                    {showType && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                        <div className="flex items-center gap-1 flex-wrap">
                          <select value={form.insurance_type} onChange={(e) => update('insurance_type', e.target.value)}
                            className={`flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white ${errors.insurance_type ? 'border-rose-300' : 'border-slate-200'}`}>
                            <option value="">Select...</option>
                            {getTypeOptions().filter((o) => o !== 'Other').map((o) => <option key={o} value={o}>{o}</option>)}
                            <option value="Other">Other</option>
                          </select>
                          {isAdmin && form.insurance_type && form.insurance_type !== 'CBN' && form.insurance_type !== 'Zenith Bank' && (
                            <button onClick={() => {
                              const ct = customTypes.find((c) => c.type_name === form.insurance_type && c.provider === form.insurance)
                              if (ct) deleteCustomType(ct.id)
                            }} className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
                          )}
                        </div>
                        {form.insurance_type === 'Other' && (
                          <input type="text" placeholder="Enter custom type..." value={form.insurance_sub_type}
                            onChange={(e) => update('insurance_sub_type', e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Upload Documents</h2>
                <p className="text-xs text-slate-400">Upload patient documents such as ID card, insurance, referrals (optional)</p>
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500">
                  <Upload size={16} /> Add Document
                  <input type="file" className="hidden" onChange={addDoc} accept="image/*,.pdf,.doc,.docx" />
                </label>
                {documents.map((doc, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-slate-700 truncate">{doc.file.name}</span>
                          <span className="text-xs text-slate-400">({(doc.file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <select value={doc.type} onChange={(e) => updateDocType(i, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none">
                          <option value="">Select type...</option>
                          <option value="id_card">ID Card / Passport</option>
                          <option value="insurance">Insurance Card</option>
                          <option value="referral">Referral</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <button onClick={() => removeDoc(i)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><X size={14} /></button>
                    </div>
                    {doc.preview.startsWith('data:image') && (
                      <img src={doc.preview} alt="Preview" className="mt-2 h-24 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer" onClick={() => setFullscreenPreview(doc.preview)} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 4: Summary */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Registration Summary</h2>
                <div className="bg-slate-50 rounded-xl p-5 space-y-3 text-sm max-h-96 overflow-y-auto">
                  {[
                    { label: 'Full Name', value: form.full_name },
                    { label: 'Date of Birth', value: form.dob },
                    { label: 'Sex', value: form.sex },
                    { label: 'Marital Status', value: form.marital_status || '—' },
                    { label: 'Nationality', value: form.nationality },
                    { label: 'State of Origin', value: form.state_of_origin || '—' },
                    { label: 'LGA', value: form.lga || '—' },
                    { label: 'Occupation', value: form.occupation || '—' },
                    { label: 'Phone', value: form.phone },
                    { label: 'Email', value: form.email || '—' },
                    { label: 'Address', value: form.address || '—' },
                    { label: 'Next of Kin', value: form.next_of_kin || '—' },
                    { label: 'Relationship', value: form.relationship || '—' },
                    { label: 'Next of Kin Address', value: form.next_of_kin_address || '—' },
                    { label: 'Emergency Contact', value: form.emergency_contact_name ? `${form.emergency_contact_name} (${form.emergency_contact_phone})` : '—' },
                    { label: 'Blood Type', value: form.blood_type || '—' },
                    { label: 'Insurance', value: form.insurance || '—' },
                    { label: 'Insurance Type', value: form.insurance_type || '—' },
                  ].map((f) => (
                    <div key={f.label} className="flex justify-between">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{f.value}</span>
                    </div>
                  ))}
                  {documents.length > 0 && (
                    <div className="border-t border-slate-200 pt-3">
                      <span className="text-xs text-slate-500 mb-2 block">Documents ({documents.length})</span>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {documents.map((doc, i) => (
                          <div key={i} className="relative group cursor-pointer" onClick={() => { if (doc.preview.startsWith('data:image')) setFullscreenPreview(doc.preview) }}>
                            {doc.preview.startsWith('data:image') ? (
                              <>
                                <img src={doc.preview} alt={doc.file.name} className="w-full h-16 object-cover rounded-lg border border-slate-200" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                                  <Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100" />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-16 flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 text-[10px] text-slate-400 truncate px-1">{doc.file.name}</div>
                            )}
                            <span className="text-[9px] text-slate-400 block text-center truncate mt-0.5">{doc.type || 'doc'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <button onClick={handleBack} disabled={step === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-30">
                <ChevronLeft size={16} /> Back</button>
              {step < 4 ? (
                <button onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm">
                  Next <ChevronRight size={16} /></button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm disabled:opacity-50">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {submitting ? 'Registering...' : 'Confirm & Register'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview */}
      {fullscreenPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setFullscreenPreview(null)}>
          <img src={fullscreenPreview} alt="Preview" className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" />
          <button onClick={() => setFullscreenPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
