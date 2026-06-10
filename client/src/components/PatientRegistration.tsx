import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { User, Phone, Shield, Check, ChevronRight, ChevronLeft, Loader2, ArrowLeft, Mail, MapPin, Heart, Briefcase, Globe } from 'lucide-react'
import api from '../hooks/useAxios'

interface FormData {
  full_name: string
  dob: string
  sex: string
  phone: string
  email: string
  address: string
  next_of_kin: string
  emergency_contact_name: string
  emergency_contact_phone: string
  insurance: string
  blood_type: string
  occupation: string
  marital_status: string
  nationality: string
}

const initialForm: FormData = {
  full_name: '', dob: '', sex: '', phone: '', email: '', address: '',
  next_of_kin: '', emergency_contact_name: '', emergency_contact_phone: '',
  insurance: '', blood_type: '', occupation: '', marital_status: '', nationality: '',
}

const steps = [
  { title: 'Personal Info', icon: User },
  { title: 'Contact', icon: Phone },
  { title: 'Medical', icon: Shield },
  { title: 'Registration Summary', icon: Check },
]

export default function PatientRegistration() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validateStep = (s: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    if (s === 0) {
      if (!form.full_name.trim()) newErrors.full_name = 'Full name is required'
      if (!form.dob) newErrors.dob = 'Date of birth is required'
      if (!form.sex) newErrors.sex = 'Sex is required'
      if (!form.nationality.trim()) newErrors.nationality = 'Nationality is required'
    } else if (s === 1) {
      if (!form.phone.trim()) newErrors.phone = 'Phone number is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(step)) setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const handleBack = () => setStep((prev) => Math.max(prev - 1, 0))

  const handleSubmit = async () => {
    if (!validateStep(step)) return
    setSubmitting(true)
    try {
      const payload = {
        id: uuidv4(), status: 'checked_in',
        full_name: form.full_name.trim(), dob: form.dob, sex: form.sex,
        phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(),
        next_of_kin: form.next_of_kin.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        insurance: form.insurance.trim(), blood_type: form.blood_type,
        occupation: form.occupation.trim(), marital_status: form.marital_status,
        nationality: form.nationality.trim(),
      }
      await api.post('/patients', payload)
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err: any) {
      setErrors({ full_name: err.response?.data?.message || 'Registration failed. Please try again.' })
    } finally { setSubmitting(false) }
  }

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
          <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Progress Steps */}
          <div className="flex border-b border-slate-100">
            {steps.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.title} className={`flex-1 text-center py-4 text-xs font-medium transition-colors ${i === step ? 'bg-primary/5 text-primary border-b-2 border-primary' : i < step ? 'text-emerald-600' : 'text-slate-400'}`}>
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
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                    {errors.sex && <p className="text-xs text-rose-500 mt-1">{errors.sex}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                    <select value={form.marital_status} onChange={(e) => updateField('marital_status', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Nationality *</label>
                    <input type="text" placeholder="e.g. Nigerian" value={form.nationality}
                      onChange={(e) => updateField('nationality', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.nationality ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.nationality && <p className="text-xs text-rose-500 mt-1">{errors.nationality}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                  <input type="text" placeholder="e.g. Teacher, Business" value={form.occupation}
                    onChange={(e) => updateField('occupation', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
            )}

            {/* Step 1: Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Contact Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Phone Number *</label>
                    <input type="tel" placeholder="e.g. +234 801 234 5678" value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${errors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                    {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" placeholder="patient@example.com" value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
                  <textarea rows={2} placeholder="Street, city, state..." value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
                </div>
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin</label>
                      <input type="text" placeholder="Name, relationship, phone" value={form.next_of_kin}
                        onChange={(e) => updateField('next_of_kin', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact Name</label>
                      <input type="text" placeholder="Full name" value={form.emergency_contact_name}
                        onChange={(e) => updateField('emergency_contact_name', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone</label>
                      <input type="tel" placeholder="Phone number" value={form.emergency_contact_phone}
                        onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Medical */}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Medical Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
                    <select value={form.blood_type} onChange={(e) => updateField('blood_type', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                      <option value="">Select...</option>
                      <option value="A+">A+</option><option value="A-">A-</option>
                      <option value="B+">B+</option><option value="B-">B-</option>
                      <option value="AB+">AB+</option><option value="AB-">AB-</option>
                      <option value="O+">O+</option><option value="O-">O-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Insurance Provider</label>
                    <input type="text" placeholder="e.g. NHIS, Private" value={form.insurance}
                      onChange={(e) => updateField('insurance', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Summary */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-slate-700">Registration Summary</h2>
                <div className="bg-slate-50 rounded-xl p-5 space-y-3 text-sm">
                  {[
                    { label: 'Full Name', value: form.full_name },
                    { label: 'Date of Birth', value: form.dob },
                    { label: 'Sex', value: form.sex },
                    { label: 'Marital Status', value: form.marital_status || '—' },
                    { label: 'Nationality', value: form.nationality },
                    { label: 'Occupation', value: form.occupation || '—' },
                    { label: 'Phone', value: form.phone },
                    { label: 'Email', value: form.email || '—' },
                    { label: 'Address', value: form.address || '—' },
                    { label: 'Next of Kin', value: form.next_of_kin || '—' },
                    { label: 'Emergency Contact', value: form.emergency_contact_name ? `${form.emergency_contact_name} (${form.emergency_contact_phone})` : '—' },
                    { label: 'Blood Type', value: form.blood_type || '—' },
                    { label: 'Insurance', value: form.insurance || '—' },
                  ].map((f) => (
                    <div key={f.label} className="flex justify-between">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
              <button onClick={handleBack} disabled={step === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-30">
                <ChevronLeft size={16} /> Back
              </button>
              {step < steps.length - 1 ? (
                <button onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm">
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:scale-[1.01] transition-transform shadow-sm disabled:opacity-50">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {submitting ? 'Registering...' : 'Confirm & Register'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
