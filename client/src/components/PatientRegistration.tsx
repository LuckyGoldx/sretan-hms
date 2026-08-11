import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { User, Phone, Shield, Check, ChevronRight, ChevronLeft, Loader2, ArrowLeft, Mail, MapPin, Heart, Briefcase, Globe, Upload, X, Trash2, Maximize2 } from 'lucide-react'
import api from '../hooks/useAxios'
import { compressImage } from '../utils/compressImage'
import { validatePhone } from '../utils/validatePhone'
import { COUNTRIES, NIGERIA_STATES, NIGERIA_LGAS, OCCUPATIONS, RELIGIONS, NIGERIA_TRIBES, RELATIONSHIPS } from '../data/formData'
import SearchableSelect from './SearchableSelect'

interface FormData {
  full_name: string; dob: string; sex: string
  phone: string; email: string; address: string
  nationality: string; state_of_origin: string; lga: string
  occupation: string; marital_status: string
  next_of_kin: string; next_of_kin_phone: string; relationship: string; next_of_kin_address: string
  emergency_contact_name: string; emergency_contact_phone: string
  insurance: string; insurance_type: string; insurance_sub_type: string
  policy_provider_id?: string; policy_number?: string; coverage_type?: string; co_pay_percentage?: string
  blood_type: string
  tribe: string
  religion: string
}

const initialForm: FormData = {
  full_name: '', dob: '', sex: '', phone: '', email: '', address: '',
  nationality: 'Nigeria', state_of_origin: '', lga: '',
  occupation: '', marital_status: '',
  next_of_kin: '', next_of_kin_phone: '', relationship: '', next_of_kin_address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  insurance: '', insurance_type: '', insurance_sub_type: '', blood_type: '',
  policy_provider_id: '', policy_number: '', coverage_type: 'primary', co_pay_percentage: '',
  tribe: '', religion: '',
}

const steps = [
  { title: 'Personal Info', icon: User },
  { title: 'Contact', icon: Phone },
  { title: 'Medical', icon: Shield },
  { title: 'Documents', icon: Upload },
  { title: 'Register', icon: Check },
]

interface DocItem { type: string; file: File; preview: string }

const today = new Date().toISOString().split('T')[0]
const stdDocTypes = ['ID Card / Passport', 'Insurance Card', 'Lab Report', 'Referral Letter', 'Consent Form', 'Prescription', 'Birth Certificate', 'Marriage Certificate', 'School Records', 'Driver License', 'Vaccination Card']

export default function PatientRegistration() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>> & { submit?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [newPatientId, setNewPatientId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [fullscreenPreview, setFullscreenPreview] = useState<string | null>(null)
  const [showDocPopup, setShowDocPopup] = useState(false)
  const [popupDocType, setPopupDocType] = useState('')
  const [popupCustomType, setPopupCustomType] = useState('')
  const [popupDocFile, setPopupDocFile] = useState<File | null>(null)
  const [popupDocPreview, setPopupDocPreview] = useState<string | null>(null)
  const [customDocTypes, setCustomDocTypes] = useState<string[]>([])

  const [insuranceProviders, setInsuranceProviders] = useState<any[]>([])

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    api.get('/document-types').then((r) => setCustomDocTypes(r.data?.map((d: any) => d.type_name) || [])).catch(() => {})
    api.get('/insurance/providers').then((r) => setInsuranceProviders(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const isAdmin = currentUser?.role === 'Admin'
  const update = (field: keyof FormData, value: string) => { setForm((p) => ({ ...p, [field]: value })); setErrors((p) => ({ ...p, [field]: undefined })) }
  const states = form.nationality === 'Nigeria' ? NIGERIA_STATES : []
  const lgas = form.state_of_origin && NIGERIA_LGAS[form.state_of_origin] ? NIGERIA_LGAS[form.state_of_origin] : []
  const allDocTypes = [...stdDocTypes, ...customDocTypes, 'Other']

  const Req = () => <span className="text-rose-500 ml-0.5">*</span>

  function openDocPopup() {
    setPopupDocType('')
    setPopupCustomType('')
    setPopupDocFile(null)
    setPopupDocPreview(null)
    setShowDocPopup(true)
  }

  async function handleDocFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setPopupDocFile(compressed)
    if (compressed.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPopupDocPreview(ev.target?.result as string)
      reader.readAsDataURL(compressed)
    } else { setPopupDocPreview(null) }
    e.target.value = ''
  }

  async function confirmDocAdd() {
    const type = popupDocType === 'Other' ? (popupCustomType.trim() || 'Other') : popupDocType
    if (!type || !popupDocFile) return
    if (!stdDocTypes.includes(type) && !customDocTypes.includes(type)) {
      try { await api.post('/document-types', { type_name: type, created_by: currentUser?.id }); setCustomDocTypes((prev) => [...prev, type]) } catch {}
    }
    const reader = new FileReader()
    reader.onload = (ev) => { setDocuments((prev) => [...prev, { type, file: popupDocFile!, preview: ev.target?.result as string }]) }
    reader.readAsDataURL(popupDocFile)
    setShowDocPopup(false)
  }

  async function deleteCustomDocType(name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    try { const all = await api.get('/document-types'); const found = all.data?.find((d: any) => d.type_name === name); if (found) await api.delete(`/document-types/${found.id}`); setCustomDocTypes((prev) => prev.filter((t) => t !== name)) } catch {}
  }

  function removeDoc(i: number) { setDocuments((prev) => prev.filter((_, idx) => idx !== i)) }

  const validateStep = (s: number) => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (s === 0) { if (!form.full_name.trim()) e.full_name = 'Required'; if (!form.dob) e.dob = 'Required'; if (!form.sex) e.sex = 'Required'; if (!form.nationality) e.nationality = 'Required'; if (form.nationality === 'Nigeria' && !form.state_of_origin) e.state_of_origin = 'Required' }
    else if (s === 1) { if (!form.phone.trim()) e.phone = 'Required'; else { var pv = validatePhone(form.phone); if (!pv.valid) e.phone = pv.error || 'Invalid' }; if (!form.emergency_contact_name.trim()) e.emergency_contact_name = 'Required'; if (!form.emergency_contact_phone.trim()) e.emergency_contact_phone = 'Required'; else { var epv = validatePhone(form.emergency_contact_phone); if (!epv.valid) e.emergency_contact_phone = epv.error || 'Invalid' } }
    else if (s === 2) { if (!form.blood_type) e.blood_type = 'Required' }
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
        next_of_kin: form.next_of_kin.trim(), next_of_kin_phone: form.next_of_kin_phone.trim(),
        relationship: form.relationship, next_of_kin_address: form.next_of_kin_address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(), emergency_contact_phone: form.emergency_contact_phone.trim(),
        insurance: form.insurance, insurance_type: form.insurance_type, insurance_sub_type: form.insurance_sub_type,
        blood_type: form.blood_type,
        tribe: form.tribe, religion: form.religion,
      }
      const patient = await api.post('/patients', payload)
      for (const doc of documents) {
        const fd = new FormData()
        fd.append('file', doc.file); fd.append('document_type', doc.type || 'other'); fd.append('notes', ''); fd.append('uploaded_by', currentUser?.id || '')
        await api.post(`/patients/${patient.data.id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {})
      }
      setNewPatientId(patient.data.id)
      setDone(true)
    } catch (err: any) {
      setErrors({ submit: err.response?.data?.message || 'Registration failed. Please check all required fields and try again.' })
    } finally { setSubmitting(false) }
  }

  if (done) return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"><Check className="w-7 h-7 text-emerald-600" /></div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Registration Complete</h2>
        <p className="text-sm text-slate-500 mb-6">Patient has been registered successfully.</p>
        <button onClick={() => navigate(`/records/patients/${newPatientId}`)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <User size={16} /> View Patient Details</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="mb-8"><h1 className="text-2xl font-bold text-slate-800">Patient Registration</h1><p className="text-sm text-slate-500 mt-1">Register a new patient in the system</p></div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
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
          {/* Step 0 */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-700">Personal Information</h2>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name<Req /></label>
                <input type="text" placeholder="Full name" value={form.full_name} onChange={(e) => update('full_name', e.target.value)}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                {errors.full_name && <p className="text-xs text-rose-500 mt-1">{errors.full_name}</p>}</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth<Req /></label>
                  <input type="date" max={today} value={form.dob} onChange={(e) => update('dob', e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                  {errors.dob && <p className="text-xs text-rose-500 mt-1">{errors.dob}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Sex<Req /></label>
                  <select value={form.sex} onChange={(e) => update('sex', e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                    <option value="">Select...</option><option>Male</option><option>Female</option></select>
                  {errors.sex && <p className="text-xs text-rose-500 mt-1">{errors.sex}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                  <select value={form.marital_status} onChange={(e) => update('marital_status', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                  <SearchableSelect value={form.occupation} onChange={(v) => update('occupation', v)} options={OCCUPATIONS} placeholder="Search occupation..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nationality<Req /></label>
                  <SearchableSelect value={form.nationality} onChange={(v) => { update('nationality', v); update('state_of_origin', ''); update('lga', '') }} options={COUNTRIES} placeholder="Search country..." /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">State of Origin{form.nationality === 'Nigeria' ? <Req /> : ''}</label>
                  {form.nationality === 'Nigeria' ? (
                    <SearchableSelect value={form.state_of_origin} onChange={(v) => { update('state_of_origin', v); update('lga', '') }} options={states} placeholder="Search state..." />
                  ) : (
                    <input type="text" placeholder="Enter state/province" value={form.state_of_origin} onChange={(e) => update('state_of_origin', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
                  {errors.state_of_origin && <p className="text-xs text-rose-500 mt-1">{errors.state_of_origin}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Religion</label>
                  <SearchableSelect value={form.religion} onChange={(v) => update('religion', v)} options={RELIGIONS} placeholder="Search religion..." /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Tribe</label>
                  {form.nationality === 'Nigeria' ? (
                    <SearchableSelect value={form.tribe} onChange={(v) => update('tribe', v)} options={NIGERIA_TRIBES} placeholder="Search tribe..." />
                  ) : (
                    <input type="text" placeholder="Enter ethnicity/tribe" value={form.tribe} onChange={(e) => update('tribe', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
                </div>
              </div>
              {form.state_of_origin && (<div><label className="block text-xs font-medium text-slate-500 mb-1">LGA / District</label>
                {form.nationality === 'Nigeria' ? (
                  <SearchableSelect value={form.lga} onChange={(v) => update('lga', v)} options={lgas} placeholder="Search LGA..." />
                ) : (
                  <input type="text" placeholder="Enter LGA" value={form.lga} onChange={(e) => update('lga', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
              </div>)}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-700">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone<Req /></label>
                  <input type="tel" placeholder="+234 801 234 5678" value={form.phone} onChange={(e) => update("phone", e.target.value.replace(/[^0-9+]/g, ""))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.phone ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />
                  {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                  <input type="email" placeholder="patient@example.com" value={form.email} onChange={(e) => update('email', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
                <textarea rows={2} placeholder="Street, city, state..." value={form.address} onChange={(e) => update('address', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                    <input type="text" placeholder="Full name" value={form.next_of_kin} onChange={(e) => update('next_of_kin', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Relationship</label>
                    <SearchableSelect value={form.relationship} onChange={(v) => update('relationship', v)} options={RELATIONSHIPS} placeholder="Select relationship..." /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Phone</label>
                    <input type="tel" placeholder="Phone" value={form.next_of_kin_phone} onChange={(e) => update('next_of_kin_phone', e.target.value.replace(/[^0-9+]/g, ''))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Address</label>
                    <textarea placeholder="Address" value={form.next_of_kin_address} onChange={(e) => update('next_of_kin_address', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" rows={2} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact<Req /></label>
                    <input type="text" placeholder="Full name" value={form.emergency_contact_name} onChange={(e) => update('emergency_contact_name', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.emergency_contact_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                  {errors.emergency_contact_name && <p className="text-xs text-rose-500 mt-1">{errors.emergency_contact_name}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone<Req /></label>
                    <input type="tel" placeholder="Phone" value={form.emergency_contact_phone} onChange={(e) => update('emergency_contact_phone', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.emergency_contact_phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                  {errors.emergency_contact_phone && <p className="text-xs text-rose-500 mt-1">{errors.emergency_contact_phone}</p>}</div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-700">Medical Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Blood Type<Req /></label>
                  <select value={form.blood_type} onChange={(e) => update('blood_type', e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.blood_type ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                    <option value="">Select...</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select>
                  {errors.blood_type && <p className="text-xs text-rose-500 mt-1">{errors.blood_type}</p>}</div>
              </div>
               <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Insurance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Provider</label>
                    <select value={form.policy_provider_id || ''} onChange={(e) => {
                      const prov = insuranceProviders.find((p: any) => p.id === e.target.value)
                      if (prov) {
                        update('insurance', prov.category || 'Other')
                        update('insurance_type', prov.name)
                        update('policy_provider_id', prov.id)
                      }
                    }} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select provider...</option>
                      {insuranceProviders.filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Policy Number</label>
                    <input type="text" value={form.policy_number || form.insurance_sub_type || ''}
                      onChange={(e) => { update('insurance_sub_type', e.target.value); update('policy_number', e.target.value) }}
                      placeholder="e.g. GPH-78901" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
                {form.policy_provider_id && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Coverage Type</label>
                      <select value={form.coverage_type || 'primary'} onChange={(e) => update('coverage_type', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Co-pay % (optional)</label>
                      <input type="number" min="0" max="100" value={form.co_pay_percentage || ''}
                        onChange={(e) => update('co_pay_percentage', e.target.value)}
                        placeholder="Inherits from provider" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  </div>
                )}
                {form.insurance && (
                  <p className="text-xs text-slate-400 mt-2">Category: <span className="font-medium text-slate-600">{form.insurance === '__other__' ? 'Other' : form.insurance}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-700">Upload Documents</h2>
              <p className="text-xs text-slate-400">Upload patient documents (optional)</p>
              <button onClick={openDocPopup}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500 w-full">
                <Upload size={16} /> Add Document</button>
              {documents.map((doc, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">{doc.type}</span>
                        <span className="text-xs text-slate-400 truncate">{doc.file.name}</span></div>
                    </div>
                    <button onClick={() => removeDoc(i)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><X size={14} /></button>
                  </div>
                  {doc.preview.startsWith('data:image') && (
                    <img src={doc.preview} alt="Preview" className="mt-2 h-24 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer" onClick={() => setFullscreenPreview(doc.preview)} />)}
                </div>
              ))}
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-700">Registration Summary</h2>
              {errors.submit && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{errors.submit}</div>
              )}
              <div className="bg-slate-50 rounded-xl p-5 space-y-3 text-sm max-h-96 overflow-y-auto">
                {[
                  { label: 'Full Name', value: form.full_name }, { label: 'Date of Birth', value: form.dob },
                  { label: 'Sex', value: form.sex }, { label: 'Marital Status', value: form.marital_status || '—' },
                  { label: 'Nationality', value: form.nationality }, { label: 'State of Origin', value: form.state_of_origin || '—' },
                  { label: 'LGA', value: form.lga || '—' }, { label: 'Occupation', value: form.occupation || '—' },
                  { label: 'Phone', value: form.phone }, { label: 'Email', value: form.email || '—' },
                  { label: 'Address', value: form.address || '—' },
                  { label: 'Next of Kin', value: form.next_of_kin || '—' }, { label: 'Next of Kin Phone', value: form.next_of_kin_phone || '—' },
                  { label: 'Relationship', value: form.relationship || '—' }, { label: 'Next of Kin Address', value: form.next_of_kin_address || '—' },
                  { label: 'Emergency Contact', value: form.emergency_contact_name ? `${form.emergency_contact_name} (${form.emergency_contact_phone})` : '—' },
                  { label: 'Blood Type', value: form.blood_type || '—' },
                  { label: 'Religion', value: form.religion || '—' }, { label: 'Tribe', value: form.tribe || '—' },
                  { label: 'Insurance', value: form.insurance || '—' }, { label: 'Insurance Type', value: form.insurance_type || '—' },
                ].map((f) => (
                  <div key={f.label} className="flex justify-between"><span className="text-slate-500">{f.label}</span><span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{f.value}</span></div>
                ))}
                {documents.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <span className="text-xs text-slate-500 mb-2 block">Documents ({documents.length})</span>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {documents.map((doc, i) => (
                        <div key={i} className="relative group cursor-pointer" onClick={() => { if (doc.preview.startsWith('data:image')) setFullscreenPreview(doc.preview) }}>
                          {doc.preview.startsWith('data:image') ? (
                            <><img src={doc.preview} alt={doc.file.name} className="w-full h-16 object-cover rounded-lg border border-slate-200" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center"><Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100" /></div></>
                          ) : (
                            <div className="w-full h-16 flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 text-[10px] text-slate-400 truncate px-1">{doc.file.name}</div>)}
                          <span className="text-[9px] text-slate-400 block text-center truncate mt-0.5">{doc.type}</span>
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
              <button onClick={handleNext} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm">
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

      {/* Document Type Popup */}
      {showDocPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDocPopup(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800"><Upload size={18} className="inline text-primary mr-2" />Add Document</h2>
              <button onClick={() => setShowDocPopup(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 mb-1">Select document type:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {allDocTypes.filter((t) => t !== 'Other').map((t) => (
                  <div key={t} className="flex items-center gap-1">
                    <button onClick={() => { setPopupDocType(t); setPopupCustomType('') }}
                      className={`flex-1 text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${popupDocType === t ? 'bg-primary/10 border-primary text-primary font-medium' : 'bg-white border-slate-200 text-slate-700 hover:border-primary'}`}>{t}</button>
                    {isAdmin && customDocTypes.includes(t) && (
                      <button onClick={(e) => { e.stopPropagation(); deleteCustomDocType(t) }} className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>)}
                  </div>
                ))}
              </div>
              <button onClick={() => { setPopupDocType('Other'); setPopupCustomType('') }}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${popupDocType === 'Other' ? 'bg-primary/10 border-primary text-primary font-medium' : 'bg-white border-slate-200 text-slate-700 hover:border-primary'}`}>Other</button>
              {popupDocType === 'Other' && (
                <input type="text" placeholder="Enter custom type name..." value={popupCustomType}
                  onChange={(e) => setPopupCustomType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 mb-2">Select file:</p>
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500">
                  <Upload size={16} /> {popupDocFile ? popupDocFile.name : 'Browse files...'}
                  <input ref={fileRef} type="file" className="hidden" onChange={handleDocFileSelect} accept="image/*,.pdf,.doc,.docx" />
                </label>
                {popupDocPreview && (
                  <img src={popupDocPreview} alt="Preview" className="mt-2 h-24 w-auto rounded-xl border border-slate-200 object-cover" />)}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowDocPopup(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDocAdd} disabled={!popupDocType || !popupDocFile || (popupDocType === 'Other' && !popupCustomType.trim())}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">Add Document</button>
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
