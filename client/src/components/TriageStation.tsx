import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, Activity, Thermometer, Weight, Droplets, FileText, Users, AlertTriangle, CheckCircle, Clock, Search, Loader2, Stethoscope, Mic } from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient } from '../types/index'

interface VitalsForm {
  systolic_bp: string
  diastolic_bp: string
  pulse: string
  temperature: string
  respiration_rate: string
  weight: string
  spo2: string
  height: string
  fetal_heart_rate: string
  fetal_heart_sound: string
  triage_priority: 'red' | 'yellow' | 'green'
  nursing_notes: string
}

const emptyForm: VitalsForm = {
  systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '',
  weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '',
}

const priorityColors: Record<string, string> = {
  red: 'bg-red-500 text-white',
  yellow: 'bg-yellow-500 text-white',
  green: 'bg-green-500 text-white',
}

function VoiceInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const preSpeechValue = useRef('')
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  function toggle() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    if (!SpeechRecognition) { alert('Voice input is not supported in your browser. Try Chrome.'); return }
    preSpeechValue.current = value
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true
    rec.onresult = (event: any) => {
      let t = ''
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      onChange(preSpeechValue.current + (preSpeechValue.current && t ? ' ' : '') + t)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }
  return (
    <button type="button" onClick={toggle}
      className={`p-1.5 rounded-lg transition-colors ${listening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
      title={listening ? 'Stop recording' : 'Start voice input'}>
      <Mic size={14} />
    </button>
  )
}

export default function TriageStation() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState<Patient[]>([])
  const [triaged, setTriaged] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [form, setForm] = useState<VitalsForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'queue' | 'triage' | 'history'>('queue')
  const [search, setSearch] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const currentUser: { id: string; name: string; role: string } | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
    return null
  })()

  useEffect(() => { loadQueue() }, [])

  async function loadQueue() {
    setLoading(true)
    try {
      const [queueRes, triagedRes] = await Promise.all([
        api.get('/patients?status=checked_in').catch(() => ({ data: [] })),
        api.get('/patients?status=in_triage').catch(() => ({ data: [] })),
      ])
      setQueue(queueRes.data || [])
      setTriaged(triagedRes.data || [])
    } catch {} finally { setLoading(false) }
  }

  const filteredQueue = queue.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit() {
    if (!selectedPatient) return
    setSubmitting(true)
    try {
      const encRes = await api.post('/encounters', {
        patient_id: selectedPatient, encounter_type: 'triage', chief_complaint: form.nursing_notes.slice(0, 200),
        staff_id: currentUser?.id,
      })
      await api.post('/vitals', {
        encounter_id: encRes.data.id,
        systolic_bp: form.systolic_bp ? parseInt(form.systolic_bp) : null,
        diastolic_bp: form.diastolic_bp ? parseInt(form.diastolic_bp) : null,
        pulse: form.pulse ? parseInt(form.pulse) : null,
        temperature: form.temperature ? parseFloat(form.temperature) : null,
        respiration_rate: form.respiration_rate ? parseInt(form.respiration_rate) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        spo2: form.spo2 ? parseInt(form.spo2) : null,
        height: form.height ? parseFloat(form.height) : null,
        fetal_heart_rate: form.fetal_heart_rate ? parseInt(form.fetal_heart_rate) : null,
        fetal_heart_sound: form.fetal_heart_sound || null,
        recorded_by: currentUser?.id,
        triage_priority: form.triage_priority,
        nursing_notes: form.nursing_notes,
      })
      await api.put(`/patients/${selectedPatient}`, { status: 'in_triage' })
      setSuccessMsg('Vitals recorded successfully')
      setSelectedPatient('')
      setForm(emptyForm)
      loadQueue()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch {} finally { setSubmitting(false) }
  }

  async function moveToWaiting(patientId: string) {
    await api.put(`/patients/${patientId}`, { status: 'waiting' })
    setQueue((prev) => prev.filter((p) => p.id !== patientId))
    setTriaged((prev) => prev.filter((p) => p.id !== patientId))
  }

  const selectForTriage = (patient: Patient) => {
    setSelectedPatient(patient.id)
    setForm(emptyForm)
    setTab('triage')
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Stethoscope size={22} className="text-amber-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Triage Station</h1>
          <p className="text-sm text-slate-500">Patient assessment and vital signs</p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      <div className="flex gap-2">
        {[
          { id: 'queue', label: `Waiting (${queue.length})`, icon: Users },
          { id: 'triage', label: selectedPatient ? 'Vitals Entry' : 'Select Patient', icon: Activity },
          { id: 'history', label: `Triaged (${triaged.length})`, icon: Clock },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'queue' && (
        <>
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {filteredQueue.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <Users size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No patients waiting for triage</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredQueue.map((patient) => (
                <div key={patient.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Users size={18} className="text-amber-600" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{patient.full_name}</p>
                      <p className="text-xs text-slate-400">{patient.sex} &middot; {patient.dob?.slice(0, 10) || '—'}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{patient.phone || '—'}</p>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-medium">Checked In</span>
                    <button onClick={() => selectForTriage(patient)}
                      className="ml-auto px-4 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors flex items-center gap-1">
                      <Activity size={12} /> Triage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'triage' && !selectedPatient && (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Users size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">Select a patient from the Waiting list</p>
          <button onClick={() => setTab('queue')} className="mt-2 text-sm text-blue-600 underline">View waiting patients</button>
        </div>
      )}

      {tab === 'triage' && selectedPatient && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">
              Vital Signs — {queue.find((p) => p.id === selectedPatient)?.full_name || ''}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Systolic BP', key: 'systolic_bp', placeholder: '120' },
                { label: 'Diastolic BP', key: 'diastolic_bp', placeholder: '80' },
                { label: 'Pulse', key: 'pulse', placeholder: '72 bpm' },
                { label: 'Temperature', key: 'temperature', placeholder: '36.5 °C' },
                { label: 'Resp. Rate', key: 'respiration_rate', placeholder: '16' },
                { label: 'Weight', key: 'weight', placeholder: '70 kg' },
                { label: 'SpO₂', key: 'spo2', placeholder: '98 %' },
                { label: 'Height', key: 'height', placeholder: '175 cm' },
                { label: 'FHR', key: 'fetal_heart_rate', placeholder: '140 bpm' },
                { label: 'FH Sound', key: 'fetal_heart_sound', placeholder: 'Normal' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                   <input type={f.key === 'fetal_heart_sound' ? 'text' : 'number'} step="any" placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              ))}
              <div className="col-span-2 md:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">Triage Priority</label>
                <div className="flex gap-2">
                  {(['red', 'yellow', 'green'] as const).map((p) => (
                    <button key={p} onClick={() => setForm((prev) => ({ ...prev, triage_priority: p }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${form.triage_priority === p ? priorityColors[p] : 'bg-slate-100 text-slate-500'}`}>
                      {p === 'red' ? 'Emergency' : p === 'yellow' ? 'Urgent' : 'Routine'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FileText size={15} /> Nursing Notes
                <VoiceInput value={form.nursing_notes} onChange={(val) => setForm((p) => ({ ...p, nursing_notes: val }))} />
              </h2>
              <textarea rows={4} placeholder="Chief complaint, observations, notes..." value={form.nursing_notes}
                onChange={(e) => setForm((p) => ({ ...p, nursing_notes: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
            </div>
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:scale-[1.01] transition-transform disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {submitting ? 'Saving...' : 'Submit Vitals & Complete Triage'}
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {triaged.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <Clock size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No patients triaged yet</p>
            </div>
          ) : (
            triaged.map((patient) => (
              <div key={patient.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Users size={18} className="text-amber-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{patient.full_name}</p>
                      <p className="text-xs text-slate-400">{patient.sex} &middot; {patient.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-yellow-100 text-yellow-700 text-[10px] font-medium">In Triage</span>
                    <button onClick={() => moveToWaiting(patient.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors">
                      Move to Waiting
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
