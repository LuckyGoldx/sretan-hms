import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Activity, Search, Loader2, User, Clock, Heart, Plus, X, Stethoscope, AlertTriangle, CheckCircle, Mic
} from 'lucide-react'

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

export default function DoctorVitals() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null)
  const [vitals, setVitals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vitalsLoading, setVitalsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'patient'>('list')
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [editingVital, setEditingVital] = useState<any | null>(null)
  const [showVitalsPreview, setShowVitalsPreview] = useState(false)
  const [recordForm, setRecordForm] = useState({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' })
  const [recording, setRecording] = useState(false)
  const [recError, setRecError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const currentUser: { id: string; name: string; role: string } | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
    return null
  })()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get('/patients')
        setPatients(data || [])
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  async function loadVitals(patient: any) {
    setSelectedPatient(patient)
    setVitalsLoading(true)
    setView('patient')
    try {
      const encRes = await api.get(`/encounters?patient_id=${patient.id}`)
      const encs = encRes.data || []
      const vits: any[] = []
      for (const enc of encs) {
        try {
          const v = await api.get(`/vitals/${enc.id}`)
          const vitalsData = Array.isArray(v.data) ? v.data : [v.data]
          if (vitalsData.length > 0 && vitalsData[0]?.id) {
            let nurseName = ''
            if (enc.staff_id) {
              try {
                const s = await api.get(`/staff/${enc.staff_id}`)
                nurseName = s.data?.name || ''
              } catch {}
            }
            for (const vital of vitalsData) {
              vits.push({ ...vital, nurse_name: nurseName, recorded_at: enc.created_at, encounter_id: enc.id })
            }
          }
        } catch {}
      }
      setVitals(vits.sort((a, b) => new Date(b.recorded_at || b.created_at).getTime() - new Date(a.recorded_at || a.created_at).getTime()))
    } catch {} finally { setVitalsLoading(false) }
  }

  async function handleRecordVitals() {
    if (!selectedPatient) return
    setRecording(true)
    setRecError('')
    try {
      if (editingVital) {
        await api.put(`/vitals/${editingVital.id}`, {
          systolic_bp: recordForm.systolic_bp ? parseInt(recordForm.systolic_bp) : null,
          diastolic_bp: recordForm.diastolic_bp ? parseInt(recordForm.diastolic_bp) : null,
          pulse: recordForm.pulse ? parseInt(recordForm.pulse) : null,
          temperature: recordForm.temperature ? parseFloat(recordForm.temperature) : null,
          respiration_rate: recordForm.respiration_rate ? parseInt(recordForm.respiration_rate) : null,
          weight: recordForm.weight ? parseFloat(recordForm.weight) : null,
          spo2: recordForm.spo2 ? parseInt(recordForm.spo2) : null,
          height: recordForm.height ? parseFloat(recordForm.height) : null,
          fetal_heart_rate: recordForm.fetal_heart_rate ? parseInt(recordForm.fetal_heart_rate) : null,
          fetal_heart_sound: recordForm.fetal_heart_sound || null,
          triage_priority: recordForm.triage_priority,
          nursing_notes: recordForm.nursing_notes,
          edited_by: currentUser?.id,
        })
        setShowRecordModal(false)
        setEditingVital(null)
        setRecordForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' })
        setSuccessMsg('Vitals updated successfully')
        await loadVitals(selectedPatient)
        setTimeout(() => setSuccessMsg(''), 3000)
        return
      }
      const encRes = await api.post('/encounters', {
        patient_id: selectedPatient.id, encounter_type: 'vitals', chief_complaint: recordForm.nursing_notes.slice(0, 200),
        staff_id: currentUser?.id,
      })
      await api.post('/vitals', {
        encounter_id: encRes.data.id,
        systolic_bp: recordForm.systolic_bp ? parseInt(recordForm.systolic_bp) : null,
        diastolic_bp: recordForm.diastolic_bp ? parseInt(recordForm.diastolic_bp) : null,
        pulse: recordForm.pulse ? parseInt(recordForm.pulse) : null,
        temperature: recordForm.temperature ? parseFloat(recordForm.temperature) : null,
        respiration_rate: recordForm.respiration_rate ? parseInt(recordForm.respiration_rate) : null,
        weight: recordForm.weight ? parseFloat(recordForm.weight) : null,
        spo2: recordForm.spo2 ? parseInt(recordForm.spo2) : null,
        height: recordForm.height ? parseFloat(recordForm.height) : null,
        fetal_heart_rate: recordForm.fetal_heart_rate ? parseInt(recordForm.fetal_heart_rate) : null,
        fetal_heart_sound: recordForm.fetal_heart_sound || null,
        recorded_by: currentUser?.id,
        triage_priority: recordForm.triage_priority,
        nursing_notes: recordForm.nursing_notes,
      })
      setShowRecordModal(false)
      setRecordForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' })
      setSuccessMsg('Vitals recorded successfully')
      await loadVitals(selectedPatient)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err: any) {
      setRecError(err?.response?.data?.message || 'Failed to record vitals')
    } finally { setRecording(false) }
  }

  const filtered = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.hospital_number || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        {view === 'patient' && (
          <button onClick={() => { setView('list'); setSelectedPatient(null) }} className="p-2 rounded-xl hover:bg-slate-100"><Clock size={20} className="text-slate-500" /></button>
        )}
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Activity className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patient Vitals</h1>
          <p className="text-sm text-slate-400">{view === 'patient' ? `${selectedPatient?.full_name} — Vitals History` : 'Select a patient to view or record vitals'}</p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      {view === 'list' ? (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search patients by name or hospital #..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <User size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No patients found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => loadVitals(p)}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-slate-300 transition-all group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><User size={16} className="text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400">{p.hospital_number || p.id?.slice(0, 8)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{p.sex} &middot; {p.dob?.slice(0, 10) || '—'}</p>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {vitalsLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{vitals.length} vitals record{vitals.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setShowRecordModal(true); setRecordForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', height: '', fetal_heart_rate: '', fetal_heart_sound: '', triage_priority: 'green', nursing_notes: '' }) }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform">
                  <Heart size={14} /> Record Vitals
                </button>
              </div>

              {vitals.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-slate-400">
                  <Activity size={40} className="text-slate-300 mb-3" />
                  <p className="text-sm font-medium">No vitals recorded for this patient</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {vitals.map((v, idx) => (
                    <div key={v.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Activity size={15} className="text-primary" />
                          <span className="text-xs font-semibold text-slate-600">
                            {new Date(v.recorded_at || v.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {v.triage_priority && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              v.triage_priority === 'red' ? 'bg-red-100 text-red-700' :
                              v.triage_priority === 'yellow' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{({ red: 'EMERGENCY', yellow: 'URGENT', green: 'ROUTINE' })[v.triage_priority as 'red' | 'yellow' | 'green'] || v.triage_priority}</span>
                          )}
                        </div>
                        {v.nurse_name && (
                          <span className="text-xs text-slate-500">by <strong>{v.nurse_name}</strong></span>
                        )}
                        {v.recorded_by === currentUser?.id && Date.now() - new Date(v.created_at).getTime() < 10 * 60 * 1000 && (
                          <div className="flex items-center gap-1 ml-auto">
                            <button onClick={() => { setEditingVital(v); setRecordForm({
                              systolic_bp: String(v.systolic_bp || ''),
                              diastolic_bp: String(v.diastolic_bp || ''),
                              pulse: String(v.pulse || ''),
                              temperature: String(v.temperature || ''),
                              respiration_rate: String(v.respiration_rate || ''),
                              weight: String(v.weight || ''),
                              spo2: String(v.spo2 || ''),
                              height: String(v.height || ''),
                              fetal_heart_rate: String(v.fetal_heart_rate || ''),
                              fetal_heart_sound: v.fetal_heart_sound || '',
                              triage_priority: v.triage_priority || 'green',
                              nursing_notes: v.nursing_notes || '',
                            }); setShowRecordModal(true) }}
                              className="px-2 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">Edit</button>
                            <button onClick={async () => {
                              if (!window.confirm('Delete this vitals record? This action cannot be undone.')) return
                              try { await api.delete(`/vitals/${v.id}`, { data: { deleted_by: currentUser?.id } }); setVitals((prev) => prev.filter((x: any) => x.id !== v.id)) } catch {}
                            }} className="px-2 py-0.5 rounded text-[9px] font-medium bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors">Delete</button>
                          </div>
                        )}
                        {v.edited_by_name && v.edited_at && (
                          <span className="text-[9px] text-amber-600 ml-auto">Edited by {v.edited_by_name}</span>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 text-center">
                          {[
                            { label: 'BP', value: v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : '—' },
                            { label: 'Pulse', value: v.pulse ? `${v.pulse}` : '—' },
                            { label: 'Temp', value: v.temperature ? `${v.temperature}°C` : '—' },
                            { label: 'RR', value: v.respiration_rate ? `${v.respiration_rate}` : '—' },
                            { label: 'SpO₂', value: v.spo2 ? `${v.spo2}%` : '—' },
                            { label: 'Weight', value: v.weight ? `${v.weight}kg` : '—' },
                            { label: 'Height', value: v.height ? `${v.height}cm` : '—' },
                            { label: 'FHR', value: v.fetal_heart_rate ? `${v.fetal_heart_rate}bpm` : '—' },
                            { label: 'FH Sound', value: v.fetal_heart_sound || '—' },
                            { label: 'Triage', value: v.triage_priority ? ({ red: 'EMERGENCY', yellow: 'URGENT', green: 'ROUTINE' })[v.triage_priority as 'red' | 'yellow' | 'green'] || v.triage_priority : '—' },
                          ].map((f) => (
                            <div key={f.label} className="bg-slate-50 rounded-xl p-2.5">
                              <p className="text-[10px] text-slate-400 font-medium uppercase">{f.label}</p>
                              <p className="text-sm font-bold text-slate-800 mt-0.5">{f.value}</p>
                            </div>
                          ))}
                        </div>
                        {v.nursing_notes && (
                          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
                            <span className="text-xs text-slate-400 font-medium">Notes:</span> {v.nursing_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Record Vitals Modal */}
          {showRecordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!recording) setShowRecordModal(false) }}>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                  <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Heart size={18} className="text-primary" /> Record Vitals — {selectedPatient?.full_name}</h2>
                  <button onClick={() => setShowRecordModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
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
                        <input type={f.key === 'fetal_heart_sound' ? 'text' : 'number'} step="any" placeholder={f.placeholder} value={(recordForm as any)[f.key]}
                          onChange={(e) => setRecordForm((p) => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                    ))}
                    <div className="col-span-2 md:col-span-3">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Triage Priority</label>
                      <div className="flex gap-2">
                        {(['red', 'yellow', 'green'] as const).map((p) => (
                          <button key={p} onClick={() => setRecordForm((prev) => ({ ...prev, triage_priority: p }))}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                              recordForm.triage_priority === p
                                ? p === 'red' ? 'bg-red-500 text-white' : p === 'yellow' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                            {p === 'red' ? 'Emergency' : p === 'yellow' ? 'Urgent' : 'Routine'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-2">
                      Nursing Notes
                      <VoiceInput value={recordForm.nursing_notes} onChange={(val) => setRecordForm((p) => ({ ...p, nursing_notes: val }))} />
                    </label>
                    <textarea rows={3} placeholder="Chief complaint, observations..." value={recordForm.nursing_notes}
                      onChange={(e) => setRecordForm((p) => ({ ...p, nursing_notes: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
                  </div>
                  {recError && <p className="text-xs text-rose-600">{recError}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
                  <button onClick={() => setShowRecordModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
                   <button onClick={() => setShowVitalsPreview(true)} disabled={recording}
                     className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                     {recording ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />}
                     {recording ? 'Saving...' : 'Preview & Save'}
                   </button>
                 </div>
               </div>
             </div>
           )}

           {/* Vitals Preview Modal */}
           {showVitalsPreview && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!recording) setShowVitalsPreview(false) }}>
               <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                   <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-primary" /> Preview Vitals</h2>
                   <button onClick={() => setShowVitalsPreview(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
                 </div>
                 <div className="overflow-y-auto flex-1 p-6 space-y-4">
                   <div className="grid grid-cols-2 gap-3">
                     {[
                       { label: 'Systolic BP', value: recordForm.systolic_bp ? `${recordForm.systolic_bp} mmHg` : '—' },
                       { label: 'Diastolic BP', value: recordForm.diastolic_bp ? `${recordForm.diastolic_bp} mmHg` : '—' },
                       { label: 'Pulse', value: recordForm.pulse ? `${recordForm.pulse} bpm` : '—' },
                       { label: 'Temperature', value: recordForm.temperature ? `${recordForm.temperature} °C` : '—' },
                       { label: 'Resp. Rate', value: recordForm.respiration_rate ? `${recordForm.respiration_rate}` : '—' },
                       { label: 'Weight', value: recordForm.weight ? `${recordForm.weight} kg` : '—' },
                       { label: 'SpO₂', value: recordForm.spo2 ? `${recordForm.spo2} %` : '—' },
                       { label: 'Height', value: recordForm.height ? `${recordForm.height} cm` : '—' },
                       { label: 'FHR', value: recordForm.fetal_heart_rate ? `${recordForm.fetal_heart_rate} bpm` : '—' },
                       { label: 'FH Sound', value: recordForm.fetal_heart_sound || '—' },
                     ].map((f) => (
                       <div key={f.label} className="bg-slate-50 rounded-xl p-3">
                         <p className="text-[10px] text-slate-400 font-medium uppercase">{f.label}</p>
                         <p className="text-sm font-bold text-slate-800 mt-0.5">{f.value}</p>
                       </div>
                     ))}
                   </div>
                   <div className="bg-slate-50 rounded-xl p-3">
                     <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Triage</p>
                     <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                       recordForm.triage_priority === 'red' ? 'bg-red-100 text-red-700' :
                       recordForm.triage_priority === 'yellow' ? 'bg-amber-100 text-amber-700' :
                       'bg-green-100 text-green-700'
                     }`}>{recordForm.triage_priority === 'red' ? 'EMERGENCY' : recordForm.triage_priority === 'yellow' ? 'URGENT' : 'ROUTINE'}</span>
                   </div>
                   {recordForm.nursing_notes && (
                     <div className="bg-slate-50 rounded-xl p-3">
                       <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Nursing Notes</p>
                       <p className="text-sm text-slate-600 whitespace-pre-wrap">{recordForm.nursing_notes}</p>
                     </div>
                   )}
                 </div>
                 <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
                   <button onClick={() => setShowVitalsPreview(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Edit</button>
                   <button onClick={async () => { setShowVitalsPreview(false); await handleRecordVitals() }} disabled={recording}
                     className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                     {recording ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                     {recording ? 'Saving...' : 'Confirm & Save'}
                   </button>
                 </div>
               </div>
             </div>
           )}
         </>
       )}
     </div>
   )
 }
