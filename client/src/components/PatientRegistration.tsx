import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { User, Phone, Shield, Check, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import api from '../hooks/useAxios'

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const steps = [
  { label: 'Personal Info', icon: User },
  { label: 'Contact', icon: Phone },
  { label: 'Medical', icon: Shield },
]

interface FormData {
  full_name: string
  dob: string
  sex: string
  phone: string
  next_of_kin: string
  insurance: string
  blood_type: string
}

const initialForm: FormData = {
  full_name: '',
  dob: '',
  sex: '',
  phone: '',
  next_of_kin: '',
  insurance: '',
  blood_type: '',
}

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
    } else if (s === 1) {
      if (!form.phone.trim()) newErrors.phone = 'Phone number is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, steps.length - 1))
    }
  }

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSubmit = async () => {
    if (!validateStep(step)) return
    setSubmitting(true)
    try {
      const payload = {
        id: uuidv4(),
        full_name: form.full_name.trim(),
        dob: form.dob,
        sex: form.sex,
        phone: form.phone.trim(),
        next_of_kin: form.next_of_kin.trim(),
        insurance: form.insurance.trim(),
        blood_type: form.blood_type,
        status: 'active',
      }
      await api.post('/patients', payload)
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err: any) {
      setErrors({ full_name: err.response?.data?.message || 'Registration failed. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Patient Registration</h1>
        <p className="text-sm text-slate-500 mt-1">Register a new patient in the system</p>
      </div>

      {success ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Patient Registered Successfully</h2>
          <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              {steps.map((s, i) => (
                <div key={s.label} className="flex items-center flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        i < step
                          ? 'bg-emerald-100 text-emerald-600'
                          : i === step
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {i < step ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <s.icon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium hidden sm:inline ${
                        i <= step ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex-1 mx-4">
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: i < step ? '100%' : '0%',
                            backgroundColor: 'var(--primary-color)',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-5 animate-[fadeIn_0.2s_ease-in]">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    placeholder="John Doe"
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      errors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                    }`}
                  />
                  {errors.full_name && (
                    <p className="text-xs text-rose-500 mt-1">{errors.full_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(e) => updateField('dob', e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      errors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                    }`}
                  />
                  {errors.dob && (
                    <p className="text-xs text-rose-500 mt-1">{errors.dob}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sex</label>
                  <select
                    value={form.sex}
                    onChange={(e) => updateField('sex', e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      errors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">Select sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  {errors.sex && (
                    <p className="text-xs text-rose-500 mt-1">{errors.sex}</p>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5 animate-[fadeIn_0.2s_ease-in]">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+234 800 000 0000"
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      errors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                    }`}
                  />
                  {errors.phone && (
                    <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Next of Kin</label>
                  <textarea
                    value={form.next_of_kin}
                    onChange={(e) => updateField('next_of_kin', e.target.value)}
                    placeholder="Name, relationship, phone"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 animate-[fadeIn_0.2s_ease-in]">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Insurance Provider</label>
                  <input
                    type="text"
                    value={form.insurance}
                    onChange={(e) => updateField('insurance', e.target.value)}
                    placeholder="NHIS, HMO name, or None"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Blood Type</label>
                  <select
                    value={form.blood_type}
                    onChange={(e) => updateField('blood_type', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select blood type</option>
                    {bloodTypes.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-8 py-4 bg-slate-50 border-t border-slate-100">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--secondary-color, #10b981)' }}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                {submitting ? 'Registering...' : 'Register Patient'}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
