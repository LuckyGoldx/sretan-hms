import { useState, useEffect, useCallback } from 'react'
import { Heart, Activity, Thermometer, Weight, Droplets, FileText, Users, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient, TriagePriority } from '../types/index'

interface VitalsForm {
  systolic_bp: string
  diastolic_bp: string
  pulse: string
  temperature: string
  respiration_rate: string
  weight: string
  spo2: string
  triage_priority: TriagePriority
  nursing_notes: string
  fluid_intake: string
  fluid_output: string
}

interface ToastState {
  show: boolean
  message: string
  type: 'success' | 'error'
}

const emptyForm: VitalsForm = {
  systolic_bp: '',
  diastolic_bp: '',
  pulse: '',
  temperature: '',
  respiration_rate: '',
  weight: '',
  spo2: '',
  triage_priority: 'green',
  nursing_notes: '',
  fluid_intake: '',
  fluid_output: '',
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (toast.show) {
      const t = setTimeout(onClose, 3500)
      return () => clearTimeout(t)
    }
  }, [toast.show, onClose])

  if (!toast.show) return null

  const isSuccess = toast.type === 'success'
  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm transition-all duration-300 ${
        isSuccess
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      {isSuccess ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="ml-2 p-0.5 rounded-lg hover:bg-black/5 transition-colors">
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function TriageStation() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [form, setForm] = useState<VitalsForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
  }, [])

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }))
  }, [])

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<Patient[]>('/patients', { params: { status: 'checked_in' } })
      setPatients(data)
    } catch {
      showToast('Failed to load patient list', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  const handleChange = (field: keyof VitalsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!selectedPatient) {
      showToast('Please select a patient', 'error')
      return
    }
    const numericFields: (keyof VitalsForm)[] = [
      'systolic_bp', 'diastolic_bp', 'pulse', 'temperature',
      'respiration_rate', 'weight', 'spo2', 'fluid_intake', 'fluid_output',
    ]
    for (const field of numericFields) {
      if (form[field] !== '' && (isNaN(Number(form[field])) || Number(form[field]) < 0)) {
        showToast('Please enter valid numeric values', 'error')
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        encounter_id: selectedPatient,
        systolic_bp: form.systolic_bp ? Number(form.systolic_bp) : null,
        diastolic_bp: form.diastolic_bp ? Number(form.diastolic_bp) : null,
        pulse: form.pulse ? Number(form.pulse) : null,
        temperature: form.temperature ? Number(form.temperature) : null,
        respiration_rate: form.respiration_rate ? Number(form.respiration_rate) : null,
        weight: form.weight ? Number(form.weight) : null,
        spo2: form.spo2 ? Number(form.spo2) : null,
        triage_priority: form.triage_priority,
        nursing_notes: form.nursing_notes,
        fluid_intake: form.fluid_intake ? Number(form.fluid_intake) : null,
        fluid_output: form.fluid_output ? Number(form.fluid_output) : null,
      }
      await api.post('/vitals', payload)
      showToast('Vitals recorded successfully', 'success')
      setForm(emptyForm)
      fetchPatients()
    } catch {
      showToast('Failed to submit vitals', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const triagePills: { value: TriagePriority; label: string; bg: string }[] = [
    { value: 'red', label: 'Emergency', bg: 'bg-red-500' },
    { value: 'yellow', label: 'Urgent', bg: 'bg-yellow-500' },
    { value: 'green', label: 'Routine', bg: 'bg-green-500' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Toast toast={toast} onClose={dismissToast} />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Heart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Triage Station</h1>
          <p className="text-sm text-slate-400">Nursing assessment & vital signs entry</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
          <Users className="w-4 h-4 text-primary" />
          Select Patient
        </label>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading patients...
          </div>
        ) : (
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow appearance-none"
          >
            <option value="">-- Select checked-in patient --</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} — {p.sex} — DOB: {p.dob?.slice(0, 10)}
              </option>
            ))}
          </select>
        )}
        {patients.length === 0 && !loading && (
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            No checked-in patients found
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-slate-700">Vital Signs</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Systolic BP (mmHg)</label>
              <input
                type="number"
                placeholder="120"
                value={form.systolic_bp}
                onChange={(e) => handleChange('systolic_bp', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Diastolic BP (mmHg)</label>
              <input
                type="number"
                placeholder="80"
                value={form.diastolic_bp}
                onChange={(e) => handleChange('diastolic_bp', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Pulse (bpm)</label>
              <input
                type="number"
                placeholder="72"
                value={form.pulse}
                onChange={(e) => handleChange('pulse', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Temperature (°C)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  placeholder="36.6"
                  value={form.temperature}
                  onChange={(e) => handleChange('temperature', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
                <Thermometer className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Respiration Rate (/min)</label>
              <input
                type="number"
                placeholder="16"
                value={form.respiration_rate}
                onChange={(e) => handleChange('respiration_rate', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Weight (kg)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  placeholder="70"
                  value={form.weight}
                  onChange={(e) => handleChange('weight', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
                <Weight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">SpO₂ (%)</label>
              <input
                type="number"
                placeholder="98"
                value={form.spo2}
                onChange={(e) => handleChange('spo2', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-slate-700">Triage Priority</h2>
            </div>
            <div className="flex gap-3">
              {triagePills.map(({ value, label, bg }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleChange('triage_priority', value)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] ${
                    form.triage_priority === value
                      ? `${bg} ring-2 ring-offset-2 ring-${value === 'red' ? 'red' : value === 'yellow' ? 'yellow' : 'green'}-500 shadow-lg`
                      : `${bg} opacity-60 hover:opacity-80`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-slate-700">Nursing Journal</h2>
            </div>
            <textarea
              rows={4}
              placeholder="Enter shift notes, observations, or handover details..."
              value={form.nursing_notes}
              onChange={(e) => handleChange('nursing_notes', e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-none"
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-slate-700">Fluid Balance</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Intake (mL)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.fluid_intake}
                  onChange={(e) => handleChange('fluid_intake', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Output (mL)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.fluid_output}
                  onChange={(e) => handleChange('fluid_output', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !selectedPatient}
        className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3.5 px-6 rounded-xl shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Heart className="w-4 h-4" />
            Record Vitals & Complete Triage
          </>
        )}
      </button>
    </div>
  )
}
