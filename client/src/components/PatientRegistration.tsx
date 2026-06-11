import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { User, Phone, Shield, Check, ChevronRight, ChevronLeft, Loader2, ArrowLeft, Mail, MapPin, Heart, Briefcase, Globe, Upload, X, FileText, Maximize2 } from 'lucide-react'
import api from '../hooks/useAxios'
import { compressImage } from '../utils/compressImage'
import { countries, countryStates, stateLGAs, insuranceProviders, retainershipTypes, relationships } from '../data/lookups'
import { occupations as occupationsList } from '../data/occupations'

interface FormData {
  full_name: string; dob: string; sex: string; phone: string; email: string; address: string
  nationality: string; state_of_origin: string; lga: string
  next_of_kin: string; next_of_kin_address: string; relationship: string
  emergency_contact_name: string; emergency_contact_phone: string
  insurance: string; blood_type: string; occupation: string; marital_status: string
  insurance_type: string; insurance_sub_type: string
}

const initialForm: FormData = {
  full_name: '', dob: '', sex: '', phone: '', email: '', address: '',
  nationality: 'Nigeria', state_of_origin: '', lga: '',
  next_of_kin: '', next_of_kin_address: '', relationship: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  insurance: '', blood_type: '', occupation: '', marital_status: '',
  insurance_type: '', insurance_sub_type: '',
}

const tabs = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'contact', label: 'Contact', icon: Phone },
  { id: 'medical', label: 'Medical', icon: Shield },
  { id: 'documents', label: 'Documents', icon: Upload },
]

export default function PatientRegistration() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [occupSearch, setOccupSearch] = useState('')
  const [nationalitySearch, setNationalitySearch] = useState('')
  const [stateSearch, setStateSearch] = useState('')
  const [lgaSearch, setLgaSearch] = useState('')
  const [relSearch, setRelSearch] = useState('')
  const [insTypeSearch, setInsTypeSearch] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [documents, setDocuments] = useState<{ file: File; preview: string; type: string; notes: string }[]>([])
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null)
  const [customOccupations, setCustomOccupations] = useState<string[]>([])
  const [customInsType, setCustomInsType] = useState('')
  const [showCustomInsInput, setShowCustomInsInput] = useState(false)

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    if (field === 'nationality') { setForm((prev) => ({ ...prev, state_of_origin: '', lga: '' })); setStateSearch(''); setLgaSearch('') }
    if (field === 'state_of_origin') { setForm((prev) => ({ ...prev, lga: '' })); setLgaSearch('') }
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    if (!form.full_name.trim()) newErrors.full_name = 'Full name is required'
    if (!form.dob) newErrors.dob = 'Date of birth is required'
    if (!form.sex) newErrors.sex = 'Sex is required'
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required'
    if (!form.nationality) newErrors.nationality = 'Nationality is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const filterList = (list: string[], search: string) =>
    list.filter((i) => i.toLowerCase().includes(search.toLowerCase())).slice(0, 10)

  const allOccupations = [...occupationsList, ...customOccupations]
  const filteredOccupations = filterList(allOccupations, occupSearch)
  const filteredNationalities = filterList(countries, nationalitySearch || form.nationality)
  const filteredStates = filterList(countryStates[form.nationality] || [], stateSearch)
  const filteredLGAs = filterList(stateLGAs[form.state_of_origin] || [], lgaSearch)
  const filteredRelationships = filterList(relationships, relSearch)

  async function handleAddDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setDocuments((prev) => [...prev, { file: compressed, preview: ev.target?.result as string, type: '', notes: '' }])
    }
    reader.readAsDataURL(compressed)
  }

  function removeDoc(idx: number) { setDocuments((prev) => prev.filter((_, i) => i !== idx)) }

  function updateDoc(idx: number, field: string, value: string) {
    setDocuments((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = {
        id: uuidv4(), status: 'checked_in',
        full_name: form.full_name.trim(), dob: form.dob, sex: form.sex,
        phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(),
        nationality: form.nationality,
        state_of_origin: form.state_of_origin, lga: form.lga,
        next_of_kin: form.next_of_kin.trim(),
        next_of_kin_address: form.next_of_kin_address.trim(),
        relationship: form.relationship,
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        insurance: form.insurance.trim(), blood_type: form.blood_type,
        occupation: form.occupation || form.occupation, marital_status: form.marital_status,
        insurance_type: form.insurance_type, insurance_sub_type: form.insurance_sub_type,
      }
      const res = await api.post('/patients', payload)
      const patientId = res.data.id
      for (const doc of documents) {
        const fd = new FormData()
        fd.append('file', doc.file)
        fd.append('document_type', doc.type || 'other')
        fd.append('notes', doc.notes || '')
        fd.append('uploaded_by', currentUser?.id || '')
        await api.post(`/patients/${patientId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {})
      }
      setSuccess(true)
      setTimeout(() => navigate(`/records/patients/${patientId}`), 1500)
    } catch (err: any) {
      setErrors({ full_name: err.response?.data?.message || 'Registration failed' })
    } finally { setSubmitting(false) }
  }

  const dropdown = (label: string, items: string[], value: string, onSelect: (v: string) => void, search: string, setSearch: (s: string) => void, required?: boolean) => (
    <div className="relative">
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}{required && ' *'}</label>
      <input type="text" value={search || value} placeholder={`Search ${label.toLowerCase()}...`}
        onChange={(e) => setSearch(e.target.value)} onFocus={() => setSearch('')}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
      {(search || search === '') && items.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <button key={item} type="button" onClick={() => { onSelect(item); setSearch('') }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors border-b border-slate-50 last:border-0 ${value === item ? 'bg-primary/10 font-medium text-primary' : 'text-slate-700'}`}>{item}</button>
          ))}
        </div>
      )}
    </div>
  )

  const TabIcon = tabs[tab].icon
  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="mb-6">
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
            {tabs.map((t, i) => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(i)} type="button"
                  className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-medium whitespace-nowrap transition-colors ${i === tab ? 'bg-primary/5 text-primary border-b-2 border-primary' : i < tab ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <Icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>

          <div className="p-6 sm:p-8">
            {/* Personal Info */}
            {tab === 0 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Personal Information</h2>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
                  <input type="text" placeholder="Enter patient's full name" value={form.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                  {errors.full_name && <p className="text-xs text-rose-500 mt-1">{errors.full_name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth *</label>
                    <input type="date" value={form.dob} onChange={(e) => updateField('dob', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.dob && <p className="text-xs text-rose-500 mt-1">{errors.dob}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Sex *</label>
                    <select value={form.sex} onChange={(e) => updateField('sex', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                      <option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option>
                    </select>
                    {errors.sex && <p className="text-xs text-rose-500 mt-1">{errors.sex}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                    <select value={form.marital_status} onChange={(e) => updateField('marital_status', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option value="Single">Single</option><option value="Married">Married</option>
                      <option value="Divorced">Divorced</option><option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  {dropdown('Nationality', filteredNationalities, form.nationality, (v) => updateField('nationality', v), nationalitySearch, setNationalitySearch, true)}
                </div>
                {errors.nationality && <p className="text-xs text-rose-500 -mt-3">{errors.nationality}</p>}
                <div className="grid grid-cols-2 gap-4">
                  {dropdown('State of Origin', filteredStates, form.state_of_origin, (v) => updateField('state_of_origin', v), stateSearch, setStateSearch)}
                  {dropdown('LGA', filteredLGAs, form.lga, (v) => updateField('lga', v), lgaSearch, setLgaSearch)}
                </div>
                <div>
                  {dropdown('Occupation', filteredOccupations, form.occupation, (v) => { updateField('occupation', v); setOccupSearch('') }, occupSearch, setOccupSearch)}
                  {occupSearch && !allOccupations.some((o) => o.toLowerCase() === occupSearch.toLowerCase()) && occupSearch.length > 1 && (
                    <button type="button" onClick={() => { setCustomOccupations((prev) => [...prev, occupSearch]); updateField('occupation', occupSearch); setOccupSearch('') }}
                      className="mt-1 text-xs text-primary font-medium hover:underline">+ Add "{occupSearch}" as custom occupation</button>
                  )}
                </div>
              </div>
            )}

            {/* Contact */}
            {tab === 1 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Contact Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
                    <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
                  <textarea rows={2} value={form.address} onChange={(e) => updateField('address', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
                </div>
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency Contact</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin</label>
                        <input type="text" placeholder="Full name" value={form.next_of_kin}
                          onChange={(e) => updateField('next_of_kin', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                      {dropdown('Relationship', filteredRelationships, form.relationship, (v) => { updateField('relationship', v); setRelSearch('') }, relSearch, setRelSearch)}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Address</label>
                      <textarea rows={2} value={form.next_of_kin_address}
                        onChange={(e) => updateField('next_of_kin_address', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact Name</label>
                        <input type="text" placeholder="Full name" value={form.emergency_contact_name}
                          onChange={(e) => updateField('emergency_contact_name', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone</label>
                        <input type="tel" value={form.emergency_contact_phone}
                          onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Medical */}
            {tab === 2 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Medical Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
                    <select value={form.blood_type} onChange={(e) => updateField('blood_type', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option><option value="A+">A+</option><option value="A-">A-</option>
                      <option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option>
                      <option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Insurance</label>
                    <input type="text" placeholder="e.g. NHIS, Private" value={form.insurance}
                      onChange={(e) => updateField('insurance', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Insurance Provider</label>
                    <select value={form.insurance_type} onChange={(e) => { updateField('insurance_type', e.target.value); updateField('insurance_sub_type', ''); setShowCustomInsInput(false) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option>
                      {insuranceProviders.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  {form.insurance_type === 'Retainership' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Retainership Type</label>
                      {!showCustomInsInput ? (
                        <div className="space-y-1">
                          {retainershipTypes.map((t) => (
                            <button key={t} type="button" onClick={() => updateField('insurance_sub_type', t)}
                              className={`block w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${form.insurance_sub_type === t ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-slate-200 text-slate-700 hover:border-primary'}`}>{t}</button>
                          ))}
                          <button type="button" onClick={() => setShowCustomInsInput(true)}
                            className="w-full text-left px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-primary hover:text-primary">+ Other</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input type="text" placeholder="Type name..." value={customInsType}
                            onChange={(e) => setCustomInsType(e.target.value)}
                            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                          <button type="button" onClick={() => { if (customInsType.trim()) { updateField('insurance_sub_type', customInsType.trim()); setShowCustomInsInput(false) }}}
                            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium">Set</button>
                          <button type="button" onClick={() => { setShowCustomInsInput(false); setCustomInsType('') }} className="px-4 py-2 rounded-xl border text-xs">Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                  {form.insurance_type === 'HMO' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">HMO Type</label>
                      {!showCustomInsInput ? (
                        <div>
                          <button type="button" onClick={() => setShowCustomInsInput(true)}
                            className="w-full text-left px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-primary hover:text-primary">+ Add HMO Provider</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input type="text" placeholder="HMO name..." value={customInsType}
                            onChange={(e) => setCustomInsType(e.target.value)}
                            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                          <button type="button" onClick={() => { if (customInsType.trim()) { updateField('insurance_sub_type', customInsType.trim()); setShowCustomInsInput(false) }}}
                            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium">Set</button>
                          <button type="button" onClick={() => { setShowCustomInsInput(false); setCustomInsType('') }} className="px-4 py-2 rounded-xl border text-xs">Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Documents */}
            {tab === 3 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Upload Documents</h2>
                <label className="flex items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                  <Upload size={24} className="text-slate-400" />
                  <div><p className="text-sm font-medium text-slate-600">Click to browse files</p><p className="text-xs text-slate-400 mt-0.5">ID cards, insurance forms, referrals, etc.</p></div>
                  <input type="file" className="hidden" onChange={handleAddDocument} accept="image/*,.pdf,.doc,.docx" multiple />
                </label>
                {documents.length > 0 && (
                  <div className="space-y-3 mt-4">
                    {documents.map((doc, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {doc.preview ? (
                              <img src={doc.preview} alt="Preview" className="w-16 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setFullscreenImg(doc.preview)} />
                            ) : <FileText size={28} className="text-slate-400" />}
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{doc.file.name}</span>
                          </div>
                          <button type="button" onClick={() => removeDoc(idx)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <select value={doc.type} onChange={(e) => updateDoc(idx, 'type', e.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-primary outline-none">
                            <option value="">Document type...</option><option value="id_card">ID Card</option><option value="insurance">Insurance</option>
                            <option value="referral">Referral</option><option value="consent">Consent Form</option><option value="other">Other</option>
                          </select>
                          <input type="text" placeholder="Notes..." value={doc.notes} onChange={(e) => updateDoc(idx, 'notes', e.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <button type="button" onClick={() => setTab((p) => Math.max(0, p - 1))} disabled={tab === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-30">
                <ChevronLeft size={16} /> Back
              </button>
              {tab < tabs.length - 1 ? (
                <button type="button" onClick={() => setTab((p) => Math.min(p + 1, tabs.length - 1))}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm">
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm disabled:opacity-50">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {submitting ? 'Registering...' : 'Confirm & Register'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview */}
      {fullscreenImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="Preview" className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" />
          <button onClick={() => setFullscreenImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
