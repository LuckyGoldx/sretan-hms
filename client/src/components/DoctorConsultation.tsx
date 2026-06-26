import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ScrollText, ClipboardList, Pill, Microscope, Scan, Search, Clock, X, Plus,
  ChevronDown, CheckCircle, XCircle, AlertTriangle, Loader2, Syringe, FlaskConical, Activity, Mic,
} from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient, Encounter } from '../types/index'

interface SoapForm { subjective: string; objective: string; assessment: string; plan: string; notes: string }
interface ToastState { show: boolean; message: string; type: 'success' | 'error' }
interface LabOrderForm { test_name: string }
interface RadiologyForm { imaging_type: string }
interface PrescriptionForm { drug_name: string; dosage: string; quantity: string; instructions: string }
type ModalType = 'lab' | 'radiology' | null

const icd11Codes = [
  { code: 'A00-B99', label: 'Certain infectious or parasitic diseases' },
  { code: 'C00-D97', label: 'Neoplasms' },
  { code: 'D50-D89', label: 'Diseases of the blood & immune system' },
  { code: 'E00-E89', label: 'Endocrine, nutritional & metabolic diseases' },
  { code: 'F01-F99', label: 'Mental, behavioural & neurodevelopmental disorders' },
  { code: 'G00-G99', label: 'Diseases of the nervous system' },
  { code: 'H00-H59', label: 'Diseases of the eye & adnexa' },
  { code: 'H60-H95', label: 'Diseases of the ear & mastoid process' },
  { code: 'I00-I99', label: 'Diseases of the circulatory system' },
  { code: 'J00-J99', label: 'Diseases of the respiratory system' },
  { code: 'K00-K95', label: 'Diseases of the digestive system' },
  { code: 'L00-L99', label: 'Diseases of the skin & subcutaneous tissue' },
  { code: 'M00-M99', label: 'Diseases of the musculoskeletal system & connective tissue' },
  { code: 'N00-N99', label: 'Diseases of the genitourinary system' },
  { code: 'O00-O9A', label: 'Pregnancy, childbirth & the puerperium' },
  { code: 'P00-P96', label: 'Certain conditions originating in the perinatal period' },
  { code: 'Q00-Q99', label: 'Congenital malformations, deformations & chromosomal abnormalities' },
  { code: 'R00-R99', label: 'Symptoms, signs or clinical findings, not elsewhere classified' },
  { code: 'S00-T88', label: 'Injury, poisoning & certain other consequences of external causes' },
  { code: 'V00-Y99', label: 'External causes of morbidity & mortality' },
  { code: 'Z00-Z99', label: 'Factors influencing health status & contact with health services' },
]
const imagingTypes = ['X-Ray', 'Ultrasound', 'CT', 'MRI']
const emptySoap: SoapForm = { subjective: '', objective: '', assessment: '', plan: '', notes: '' }

type TabId = 'soap' | 'orders' | 'prescribe' | 'icd'

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'soap', label: 'SOAP Note', icon: ScrollText },
  { id: 'orders', label: 'Orders', icon: Microscope },
  { id: 'prescribe', label: 'Prescribe', icon: Pill },
  { id: 'icd', label: 'ICD-11', icon: Search },
]

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => { if (toast.show) { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) } }, [toast.show, onClose])
  if (!toast.show) return null
  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm transition-all duration-300 ${
      toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="ml-2 p-0.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" /></button>
    </div>
  )
}

interface TimelineModalData {
  encounter: Encounter
  doctorName: string
  prescriptions: any[]
  labOrders: any[]
  radiologyOrders: any[]
}

function VoiceInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const preSpeechValue = useRef('')

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    if (!SpeechRecognition) { alert('Voice input is not supported in your browser. Try Chrome.'); return }
    preSpeechValue.current = value
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event: any) => {
      let fullTranscript = ''
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript
      }
      onChange(preSpeechValue.current + (preSpeechValue.current && fullTranscript ? ' ' : '') + fullTranscript)
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

export default function DoctorConsultation() {
  const navigate = useNavigate()
  const { patientId } = useParams<{ patientId: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('soap')
  const [soap, setSoap] = useState<SoapForm>(emptySoap)
  const [soapSubmitting, setSoapSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [labForm, setLabForm] = useState<LabOrderForm>({ test_name: '' })
  const [radiologyForm, setRadiologyForm] = useState<RadiologyForm>({ imaging_type: '' })
  const [prescription, setPrescription] = useState<PrescriptionForm>({ drug_name: '', dosage: '', quantity: '', instructions: '' })
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null)
  const [inventoryDrugs, setInventoryDrugs] = useState<string[]>([])
  const [showDrugSuggestions, setShowDrugSuggestions] = useState(false)
  const [staffCache, setStaffCache] = useState<Record<string, string>>({})
  const [icdSearch, setIcdSearch] = useState('')
  const [selectedIcd, setSelectedIcd] = useState<string>('')
  const [icdOpen, setIcdOpen] = useState(false)
  const [labSubmitting, setLabSubmitting] = useState(false)
  const [labTestCatalog, setLabTestCatalog] = useState<any[]>([])
  const [labTestSearch, setLabTestSearch] = useState('')
  const [showLabTestDropdown, setShowLabTestDropdown] = useState(false)
  const [radiologySubmitting, setRadiologySubmitting] = useState(false)
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false)
  const [timelineModal, setTimelineModal] = useState<TimelineModalData | null>(null)
  const [vitals, setVitals] = useState<any | null>(null)
  const [labResultsMap, setLabResultsMap] = useState<Record<string, any[]>>({})

  const showToast = useCallback((message: string, type: 'success' | 'error') => { setToast({ show: true, message, type }) }, [])
  const dismissToast = useCallback(() => { setToast((prev) => ({ ...prev, show: false })) }, [])

  const currentStaffId: string | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {}
    return null
  })()

  async function fetchStaffName(id: string): Promise<string> {
    if (staffCache[id]) return staffCache[id]
    try { const res = await api.get<any>(`/staff/${id}`); const name = res.data?.name || 'Unknown'; setStaffCache((p) => ({ ...p, [id]: name })); return name } catch { return 'Unknown' }
  }

  useEffect(() => {
    api.get<any[]>('/lab-test-catalog').then((res) => setLabTestCatalog(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    api.get<any[]>('/inventory?category=pharmacy').then((res) => {
      const drugs = [...new Set((res.data || []).map((i: any) => i.drug_name).filter(Boolean))] as string[]
      setInventoryDrugs(drugs)
    }).catch(() => {})
  }, [])

  const ensureEncounter = useCallback(async (): Promise<string> => {
    if (activeEncounterId) return activeEncounterId
    if (!patientId) throw new Error('No patient selected')
    const encResponse = await api.post('/encounters', { patient_id: patientId, encounter_type: 'consultation', chief_complaint: '', staff_id: currentStaffId })
    setActiveEncounterId(encResponse.data.id)
    return encResponse.data.id
  }, [activeEncounterId, patientId, currentStaffId])

  useEffect(() => {
    if (!patientId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const { data } = await api.get<any>(`/patients/${patientId}`)
        const { encounters: encs, ...patData } = data
        setPatient(patData as Patient)
        setEncounters(encs || [])
        for (const enc of (encs || [])) { if (enc.staff_id) fetchStaffName(enc.staff_id) }
        if (encs && encs.length > 0) {
          const firstEnc = encs[0]
          try {
            const vRes = await api.get(`/vitals/${firstEnc.id}`)
            if (vRes.data && vRes.data.id) setVitals(vRes.data)
          } catch {}
        }
      } catch { showToast('Failed to load patient data', 'error') } finally { setLoading(false) }
    }
    fetchData()
  }, [patientId, showToast])

  async function openTimelineModal(enc: Encounter) {
    const doctorName = enc.staff_id ? staffCache[enc.staff_id] || await fetchStaffName(enc.staff_id) : 'N/A'
    try {
      const [rxRes, labRes, radRes] = await Promise.all([
        api.get(`/prescriptions?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/lab-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/radiology-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
      ])
      const labOrders = labRes.data || []
      const results: Record<string, any[]> = {}
      for (const lo of labOrders) {
        try {
          const r = await api.get(`/lab-results/${lo.id}?status=completed`)
          if (r.data && r.data.length > 0) results[lo.id] = r.data
        } catch {}
      }
      setLabResultsMap(results)
      setTimelineModal({ encounter: enc, doctorName, prescriptions: rxRes.data || [], labOrders, radiologyOrders: radRes.data || [] })
    } catch { setTimelineModal({ encounter: enc, doctorName, prescriptions: [], labOrders: [], radiologyOrders: [] }) }
  }

  const handleSoapChange = (field: keyof SoapForm, value: string) => setSoap((prev) => ({ ...prev, [field]: value }))

  const handleSoapSubmit = async () => {
    if (!patientId) return
    if (!soap.subjective && !soap.objective && !soap.assessment && !soap.plan) { showToast('Please fill in at least one SOAP field', 'error'); return }
    setSoapSubmitting(true)
    try {
      const encId = await ensureEncounter()
      await api.put(`/encounters/${encId}`, { encounter_type: 'consultation', chief_complaint: soap.subjective.slice(0, 500), soap_notes: soap })
      showToast('SOAP note saved successfully', 'success')
      setSoap(emptySoap)
      const { data: refreshed } = await api.get<any>(`/patients/${patientId}`)
      setEncounters(refreshed.encounters || [])
    } catch { showToast('Failed to save SOAP note', 'error') } finally { setSoapSubmitting(false) }
  }

  const handleLabSubmit = async () => {
    if (!patientId || !labForm.test_name.trim()) { showToast('Please enter a test name', 'error'); return }
    setLabSubmitting(true)
    try {
      const encId = await ensureEncounter()
      await api.post('/lab-orders', { encounter_id: encId, test_name: labForm.test_name.trim(), lab_number: patient?.hospital_number || undefined })
      showToast('Lab order submitted', 'success'); setLabForm({ test_name: '' }); setActiveModal(null)
    } catch { showToast('Failed to submit lab order', 'error') } finally { setLabSubmitting(false) }
  }

  const handleRadiologySubmit = async () => {
    if (!patientId || !radiologyForm.imaging_type) { showToast('Please select an imaging type', 'error'); return }
    setRadiologySubmitting(true)
    try {
      const encId = await ensureEncounter()
      const doctorName = (() => { try { const u = JSON.parse(localStorage.getItem('sretan_user') || '{}'); return u.name || '' } catch {} return '' })()
      const patName = patient?.full_name || ''
      await api.post('/radiology-orders', { encounter_id: encId, imaging_type: radiologyForm.imaging_type, doctor_name: doctorName, patient_name: patName })
      showToast('Radiology order submitted', 'success'); setRadiologyForm({ imaging_type: '' }); setActiveModal(null)
    } catch { showToast('Failed to submit radiology order', 'error') } finally { setRadiologySubmitting(false) }
  }

  const handlePrescriptionSubmit = async () => {
    if (!patientId || !prescription.drug_name.trim()) { showToast('Please enter a drug name', 'error'); return }
    setPrescriptionSubmitting(true)
    try {
      const encId = await ensureEncounter()
      await api.post('/prescriptions', { encounter_id: encId, drug_name: prescription.drug_name.trim(), dosage: prescription.dosage, quantity: Number(prescription.quantity) || 0, instructions: prescription.instructions })
      showToast('Prescription created', 'success')
      setPrescription({ drug_name: '', dosage: '', quantity: '', instructions: '' })
    } catch { showToast('Failed to create prescription', 'error') } finally { setPrescriptionSubmitting(false) }
  }

  const filteredIcd = icdSearch ? icd11Codes.filter((c) => c.code.toLowerCase().includes(icdSearch.toLowerCase()) || c.label.toLowerCase().includes(icdSearch.toLowerCase())) : icd11Codes
  const sortedEncounters = [...encounters].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (!patientId) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-slate-400">
      <ClipboardList className="w-10 h-10 mb-3" />
      <p className="text-sm font-medium text-slate-600">No patient selected</p>
      <p className="text-xs mt-1">Select a patient from <strong>Dashboard</strong> or <strong>My Patients</strong> to start a consultation.</p>
    </div>
  )
  if (loading) return <div className="flex items-center justify-center h-full min-h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  if (!patient) return <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-slate-400"><AlertTriangle className="w-10 h-10 mb-3" /><p className="text-sm font-medium">Patient not found</p></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Toast toast={toast} onClose={dismissToast} />

      {/* Patient Header */}
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Doctor Consultation</h1>
          <p className="text-sm text-slate-400">{patient.full_name} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; {patient.blood_type || 'Blood type N/A'}</p>
        </div>
      </div>

      {/* Vitals Display */}
      {vitals && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Triage Vitals</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 text-center">
            {[
              { label: 'BP', value: vitals.systolic_bp && vitals.diastolic_bp ? `${vitals.systolic_bp}/${vitals.diastolic_bp}` : '—' },
              { label: 'Pulse', value: vitals.pulse ? `${vitals.pulse} bpm` : '—' },
              { label: 'Temp', value: vitals.temperature ? `${vitals.temperature}°C` : '—' },
              { label: 'RR', value: vitals.respiration_rate ? `${vitals.respiration_rate}` : '—' },
              { label: 'SpO₂', value: vitals.spo2 ? `${vitals.spo2}%` : '—' },
              { label: 'Weight', value: vitals.weight ? `${vitals.weight}kg` : '—' },
              { label: 'Triage', value: vitals.triage_priority ? ({ red: 'EMERGENCY', yellow: 'URGENT', green: 'ROUTINE' })[vitals.triage_priority as 'red' | 'yellow' | 'green'] || vitals.triage_priority : '—' },
            ].map((v) => (
              <div key={v.label} className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 font-medium uppercase">{v.label}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{v.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                isActive ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab: SOAP Note */}
      {activeTab === 'soap' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['subjective', 'objective', 'assessment', 'plan'] as (keyof SoapForm)[]).map((field) => (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 capitalize flex items-center gap-1">{field}
                  <VoiceInput value={soap[field]} onChange={(val) => handleSoapChange(field, val)} />
                </label>
                <textarea placeholder={field === 'subjective' ? "Patient's reported symptoms, history, and concerns..." : field === 'objective' ? "Vital signs, exam findings, lab results..." : field === 'assessment' ? "Diagnosis, differential diagnoses, clinical reasoning..." : "Treatment plan, medications, follow-up, referrals..."}
                  value={soap[field]} onChange={(e) => handleSoapChange(field, e.target.value)}
                  className="auto-expand w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">Notes
              <VoiceInput value={soap.notes} onChange={(val) => handleSoapChange('notes', val)} />
            </label>
            <textarea rows={3} placeholder="Additional notes, instructions, observations..."
              value={soap.notes} onChange={(e) => handleSoapChange('notes', e.target.value)}
              className="auto-expand w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
          </div>
          <button onClick={handleSoapSubmit} disabled={soapSubmitting}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:scale-[1.01] transition-all duration-200 disabled:opacity-50">
            {soapSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><ScrollText className="w-4 h-4" /> Save SOAP Note</>}
          </button>
        </div>
      )}

      {/* Tab: Orders (CPOE) */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex gap-3 mb-4">
            <button onClick={() => setActiveModal('lab')}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 hover:scale-[1.01] transition-all duration-200">
              <Microscope className="w-5 h-5" /> Order Lab Test
            </button>
            <button onClick={() => setActiveModal('radiology')}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 hover:scale-[1.01] transition-all duration-200">
              <Scan className="w-5 h-5" /> Order Radiology
            </button>
          </div>
          <div className="text-xs text-slate-400 text-center">Orders are created for the current active encounter</div>
        </div>
      )}

      {/* Tab: e-Prescribing */}
      {activeTab === 'prescribe' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="space-y-3">
            <div className="relative">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Drug Name</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                <input type="text" placeholder="Type drug name or search inventory..." value={prescription.drug_name}
                  onChange={(e) => { setPrescription((prev) => ({ ...prev, drug_name: e.target.value })); setShowDrugSuggestions(true) }}
                  onFocus={() => setShowDrugSuggestions(true)} onBlur={() => setTimeout(() => setShowDrugSuggestions(false), 200)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
              </div>
              {showDrugSuggestions && prescription.drug_name.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                  {inventoryDrugs.filter((d) => d.toLowerCase().includes(prescription.drug_name.toLowerCase())).slice(0, 10).map((drug) => (
                    <button key={drug} type="button" onMouseDown={() => { setPrescription((prev) => ({ ...prev, drug_name: drug })); setShowDrugSuggestions(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center gap-2"><Pill className="w-3.5 h-3.5 text-blue-500" /> {drug}</button>
                  ))}
                  <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">Type any custom drug name — it will be sent to pharmacy</div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Dosage</label>
                <input type="text" placeholder="e.g. 500mg" value={prescription.dosage}
                  onChange={(e) => setPrescription((prev) => ({ ...prev, dosage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Quantity</label>
                <input type="number" placeholder="30" value={prescription.quantity}
                  onChange={(e) => setPrescription((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">Instructions
                <VoiceInput value={prescription.instructions} onChange={(val) => setPrescription((prev) => ({ ...prev, instructions: val }))} />
              </label>
              <textarea placeholder="e.g. Take one capsule three times daily after meals" value={prescription.instructions}
                onChange={(e) => setPrescription((prev) => ({ ...prev, instructions: e.target.value }))}
                className="auto-expand-sm w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
            </div>
            <button onClick={handlePrescriptionSubmit} disabled={prescriptionSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:scale-[1.01] transition-all duration-200 disabled:opacity-50">
              {prescriptionSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Syringe className="w-4 h-4" /> Issue Prescription</>}
            </button>
          </div>
        </div>
      )}

      {/* Tab: ICD-11 Browser */}
      {activeTab === 'icd' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="relative">
            <button onClick={() => setIcdOpen((prev) => !prev)}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 bg-white hover:border-slate-300 transition-colors">
              <span className={selectedIcd ? 'text-slate-700' : 'text-slate-400'}>{selectedIcd || 'Select ICD-11 code...'}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${icdOpen ? 'rotate-180' : ''}`} />
            </button>
            {icdOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIcdOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      <input type="text" placeholder="Search codes..." value={icdSearch} onChange={(e) => setIcdSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-44">
                    {filteredIcd.map((item) => (
                      <button key={item.code} onClick={async () => {
                        setSelectedIcd(item.code); setIcdOpen(false); setIcdSearch('')
                        const encId = await ensureEncounter()
                        try {
                          const existing = await api.get(`/encounters/${encId}`)
                          const current = existing.data?.diagnoses || []
                          if (!current.some((d: any) => d.code === item.code)) {
                            await api.put(`/encounters/${encId}`, { diagnoses: [...current, { code: item.code, label: item.label, diagnosed_at: new Date().toISOString() }] })
                          }
                        } catch {}
                      }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${selectedIcd === item.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}>
                        <span className="font-mono text-xs text-primary">{item.code}</span><span className="ml-2">{item.label}</span>
                      </button>
                    ))}
                    {filteredIcd.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No matching codes found</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Historical Timeline at bottom */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-slate-700">Historical Timeline ({sortedEncounters.length})</h2>
        </div>
        {sortedEncounters.length === 0 ? (
          <p className="text-sm text-slate-400">No prior encounters found.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {sortedEncounters.map((enc, idx) => {
              const staffName = enc.staff_id ? staffCache[enc.staff_id] : null
              return (
                <button key={enc.id} type="button" onClick={() => openTimelineModal(enc)}
                  className={`w-full text-left relative flex items-start gap-4 p-3.5 rounded-xl border transition-all hover:shadow-md ${
                    idx === 0 ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/40'
                  }`}>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock className="w-4 h-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{enc.encounter_type}</span>
                      <span className="text-xs text-slate-400">{new Date(enc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {idx === 0 && <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Current</span>}
                    </div>
                    {enc.chief_complaint && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{enc.chief_complaint}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      {staffName ? <span>By: <strong>{staffName}</strong></span> : null}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 mt-2" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Order Modals (lab / radiology) */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!labSubmitting && !radiologySubmitting) setActiveModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                {activeModal === 'lab' ? <><Microscope className="w-4 h-4 text-primary" /> Order Lab Test</> : <><Scan className="w-4 h-4 text-primary" /> Order Radiology</>}
              </h3>
              <button onClick={() => setActiveModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {activeModal === 'lab' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Test Name</label>
                  <div className="relative">
                    <input type="text" placeholder="Search lab tests..." value={labTestSearch || labForm.test_name}
                      onChange={(e) => { setLabTestSearch(e.target.value); setLabForm({ test_name: '' }); setShowLabTestDropdown(true) }}
                      onFocus={() => setShowLabTestDropdown(true)}
                      onBlur={() => setTimeout(() => setShowLabTestDropdown(false), 200)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
                    {showLabTestDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                        {labTestCatalog.filter((t: any) => t.name.toLowerCase().includes((labTestSearch || labForm.test_name).toLowerCase())).slice(0, 10).map((t: any) => (
                          <button key={t.id} type="button" onMouseDown={() => { setLabForm({ test_name: t.name }); setLabTestSearch(''); setShowLabTestDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{t.name} <span className="text-slate-400 text-xs">{t.category}</span></button>
                        ))}
                        {labTestCatalog.filter((t: any) => t.name.toLowerCase().includes((labTestSearch || labForm.test_name).toLowerCase())).length === 0 && (
                          <div className="px-4 py-2.5 text-sm text-slate-400">No matching tests</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setActiveModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button onClick={handleLabSubmit} disabled={labSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 rounded-xl shadow-sm hover:scale-[1.01] transition-all duration-200 disabled:opacity-50">
                    {labSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Submit</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Imaging Type</label>
                  <select value={radiologyForm.imaging_type} onChange={(e) => setRadiologyForm({ imaging_type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow appearance-none">
                    <option value="">-- Select imaging type --</option>
                    {imagingTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setActiveModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button onClick={handleRadiologySubmit} disabled={radiologySubmitting}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 rounded-xl shadow-sm hover:scale-[1.01] transition-all duration-200 disabled:opacity-50">
                    {radiologySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Submit</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline Encounter Detail Modal */}
      {timelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setTimelineModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Encounter Details
              </h2>
              <button onClick={() => setTimelineModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700 capitalize">{timelineModal.encounter.encounter_type}</span></div>
                <div><span className="text-slate-500">Doctor:</span> <span className="font-medium text-slate-700">{timelineModal.doctorName}</span></div>
                <div><span className="text-slate-500">Created:</span> <span className="font-medium text-slate-700">{new Date(timelineModal.encounter.created_at).toLocaleString()}</span></div>
                {timelineModal.encounter.updated_at !== timelineModal.encounter.created_at && (
                  <div><span className="text-slate-500">Last Updated:</span> <span className="font-medium text-slate-700">{new Date(timelineModal.encounter.updated_at).toLocaleString()}</span></div>
                )}
              </div>

              {/* Chief Complaint */}
              {timelineModal.encounter.chief_complaint && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{timelineModal.encounter.chief_complaint}</p>
                </div>
              )}

              {/* SOAP Notes */}
              {(() => {
                const soapNotes = timelineModal.encounter.soap_notes
                  ? (typeof timelineModal.encounter.soap_notes === 'string' ? JSON.parse(timelineModal.encounter.soap_notes) : timelineModal.encounter.soap_notes)
                  : null
                if (!soapNotes) return null
                const fields = ['subjective', 'objective', 'assessment', 'plan'] as const
                return (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SOAP Notes</p>
                    <div className="grid grid-cols-2 gap-3">
                      {fields.map((f) => soapNotes[f] ? (
                        <div key={f} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary capitalize mb-0.5">{f}</p>
                          <p className="text-sm text-slate-700">{soapNotes[f]}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )
              })()}

              {/* Prescriptions */}
              {timelineModal.prescriptions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Pill size={12} /> Prescriptions ({timelineModal.prescriptions.length})</p>
                  <div className="space-y-2">
                    {timelineModal.prescriptions.map((rx: any) => (
                      <div key={rx.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm">
                        <div><span className="font-medium text-slate-800">{rx.drug_name}</span> <span className="text-slate-400">{rx.dosage}</span></div>
                        <span className="text-slate-500">Qty: {rx.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnoses */}
              {(() => {
                const diags = timelineModal.encounter.diagnoses
                if (!diags || (Array.isArray(diags) && diags.length === 0)) return null
                const list = Array.isArray(diags) ? diags : typeof diags === 'string' ? JSON.parse(diags) : []
                if (list.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Diagnoses</p>
                    <div className="space-y-1.5">
                      {list.map((d: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-blue-600 font-medium">{d.code}</span>
                          <span className="text-slate-700">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Lab Orders with Results */}
              {timelineModal.labOrders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FlaskConical className="w-3 h-3" /> Lab Orders ({timelineModal.labOrders.length})</p>
                  <div className="space-y-3">
                    {timelineModal.labOrders.map((lab: any) => {
                      const results = labResultsMap[lab.id] || []
                      return (
                        <div key={lab.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-slate-800 text-sm">{lab.test_name}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                              lab.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>{lab.status}</span>
                          </div>
                          {results.length > 0 && (
                            <div className="space-y-1">
                              {results.map((r: any) => (
                                <div key={r.id} className={`flex items-center gap-3 text-xs px-2.5 py-1.5 rounded-lg ${
                                  r.is_abnormal ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-600'
                                }`}>
                                  <span className="font-medium flex-1">{r.analyte_name}</span>
                                  <span className="font-bold">{r.value}</span>
                                  <span className="text-slate-400">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                                  {r.is_abnormal && <AlertTriangle size={10} className="text-rose-500" />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Radiology Orders */}
              {timelineModal.radiologyOrders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Scan size={12} /> Radiology Orders ({timelineModal.radiologyOrders.length})</p>
                  <div className="space-y-2">
                    {timelineModal.radiologyOrders.map((rad: any) => (
                      <div key={rad.id} className="bg-slate-50 rounded-xl p-3 text-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">{rad.imaging_type}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                            rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>{rad.status}</span>
                        </div>
                        {rad.report_text && (
                          <div className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-slate-100">{rad.report_text}</div>
                        )}
                        {rad.reported_by_name && (
                          <p className="text-[10px] text-slate-400">Reported by: {rad.reported_by_name}{rad.reported_at ? ` · ${new Date(rad.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!timelineModal.encounter.chief_complaint && !timelineModal.encounter.soap_notes &&
               timelineModal.prescriptions.length === 0 && timelineModal.labOrders.length === 0 &&
               timelineModal.radiologyOrders.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No additional details recorded for this encounter.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
