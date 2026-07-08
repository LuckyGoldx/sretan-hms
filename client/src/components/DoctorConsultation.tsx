import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ScrollText, ClipboardList, Pill, Microscope, Scan, Search, Clock, X, Plus,
  ChevronDown, CheckCircle, XCircle, AlertTriangle, Loader2, Syringe, FlaskConical, Activity, Mic,
  FileText, FileImage,
} from 'lucide-react'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import type { Patient, Encounter } from '../types/index'

interface SoapForm { subjective: string; objective: string; assessment: string; plan: string; notes: string }
interface ToastState { show: boolean; message: string; type: 'success' | 'error' }
interface LabOrderForm { test_name: string; doctor_comment: string }
interface RadiologyForm { imaging_type: string; doctor_comment: string }
interface PrescriptionForm { drug_name: string; dosage: string; quantity: string; instructions: string }
type ModalType = 'lab' | 'radiology' | null

import { ICD11_CODES } from '../data/icd11Codes'
const icd11Codes = ICD11_CODES.map((c) => ({ code: c.code, label: c.label }))
const PER_PAGE = 15
const fallbackImagingTypes = ['X-Ray', 'Ultrasound', 'CT', 'MRI']
const emptySoap: SoapForm = { subjective: '', objective: '', assessment: '', plan: '', notes: '' }

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (n: number) => void }) {
  if (totalPages <= 1) return null
  const pages: number[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i) }
  else if (page <= 3) { for (let i = 1; i <= maxVisible; i++) pages.push(i) }
  else if (page >= totalPages - 2) { for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i) }
  else { for (let i = page - 2; i <= page + 2; i++) pages.push(i) }
  return (
    <div className="flex items-center justify-center gap-2 pt-3 pb-1">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
    </div>
  )
}

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
  const urlParams = new URLSearchParams(window.location.search)
  const encounterType = urlParams.get('type') || 'consultation'
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('soap')
  const [soap, setSoap] = useState<SoapForm>(emptySoap)
  const [soapSubmitting, setSoapSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [labForm, setLabForm] = useState<LabOrderForm>({ test_name: '', doctor_comment: '' })
  const [radiologyForm, setRadiologyForm] = useState<RadiologyForm>({ imaging_type: '', doctor_comment: '' })
  const [prescription, setPrescription] = useState<PrescriptionForm>({ drug_name: '', dosage: '', quantity: '', instructions: '' })
  const activeEncounterRef = useRef<string | null>(null)
  const [inventoryDrugs, setInventoryDrugs] = useState<string[]>([])
  const [showDrugSuggestions, setShowDrugSuggestions] = useState(false)
  const [staffCache, setStaffCache] = useState<Record<string, string>>({})
  const [icdSearch, setIcdSearch] = useState('')
  const [selectedIcd, setSelectedIcd] = useState<string>('')
  const [icdOpen, setIcdOpen] = useState(false)
  const [labSubmitting, setLabSubmitting] = useState(false)
  const [labTestCatalog, setLabTestCatalog] = useState<any[]>([])
  const [labInventoryItems, setLabInventoryItems] = useState<any[]>([])
  const [radiologyInventoryItems, setRadiologyInventoryItems] = useState<any[]>([])
  const [labTestSearch, setLabTestSearch] = useState('')
  const [showLabTestDropdown, setShowLabTestDropdown] = useState(false)
  const [radiologySearch, setRadiologySearch] = useState('')
  const [showRadiologyDropdown, setShowRadiologyDropdown] = useState(false)
  const [radiologySubmitting, setRadiologySubmitting] = useState(false)
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false)
  const [timelineModal, setTimelineModal] = useState<TimelineModalData | null>(null)
  const [vitals, setVitals] = useState<any | null>(null)
  const [labResultsMap, setLabResultsMap] = useState<Record<string, any[]>>({})
  const [allLabOrders, setAllLabOrders] = useState<any[]>([])
  const [allRadOrders, setAllRadOrders] = useState<any[]>([])
  const [allPrescriptions, setAllPrescriptions] = useState<any[]>([])
  const [soapPage, setSoapPage] = useState(1)
  const [ordersPage, setOrdersPage] = useState(1)
  const [rxPage, setRxPage] = useState(1)
  const [rxDetailModal, setRxDetailModal] = useState<any | null>(null)
  const [radiologyDetailModal, setRadiologyDetailModal] = useState<any | null>(null)
  const [radModalImage, setRadModalImage] = useState<string | null>(null)
  const [maternityRecord, setMaternityRecord] = useState<any>(null)
  const [lastANCVisit, setLastANCVisit] = useState<any>(null)
  const [icdConfirmModal, setIcdConfirmModal] = useState<{ code: string; label: string; chapter: string } | null>(null)
  const [pendingDiagnoses, setPendingDiagnoses] = useState<{ code: string; label: string }[]>([])
  const [soapIcdSearch, setSoapIcdSearch] = useState('')
  const [soapIcdOpen, setSoapIcdOpen] = useState(false)

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
    api.get<any[]>('/inventory?category=lab').then((res) => setLabInventoryItems(res.data || [])).catch(() => {})
    api.get<any[]>('/inventory?category=radiology').then((res) => setRadiologyInventoryItems(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    api.get<any[]>('/inventory?category=pharmacy').then((res) => {
      const drugs = [...new Set((res.data || []).map((i: any) => i.drug_name).filter(Boolean))] as string[]
      setInventoryDrugs(drugs)
    }).catch(() => {})
  }, [])

  const ensureEncounter = useCallback(async (): Promise<string | null> => {
    if (activeEncounterRef.current) return activeEncounterRef.current
    if (!patientId) return null
    try {
      const encResponse = await api.post('/encounters', { patient_id: patientId, encounter_type: encounterType, chief_complaint: '', staff_id: currentStaffId })
      if (!encResponse.data?.id) return null
      activeEncounterRef.current = encResponse.data.id
      return encResponse.data.id
    } catch { return null }
  }, [patientId, currentStaffId, encounterType])

  useEffect(() => {
    if (!patientId) return
    setPendingDiagnoses([])
    activeEncounterRef.current = null
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
          const allLab: any[] = []; const allRad: any[] = []; const allRx: any[] = []
          for (const enc of encs) {
            const [labRes, radRes, rxRes] = await Promise.all([
              api.get(`/lab-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
              api.get(`/radiology-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
              api.get(`/prescriptions?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
            ])
            allLab.push(...(labRes.data || []))
            allRad.push(...(radRes.data || []))
            allRx.push(...(rxRes.data || []))
          }
          setAllLabOrders(allLab)
          setAllRadOrders(allRad)
          setAllPrescriptions(allRx)
        }
        // Fetch maternity data for consultation banner
        try {
          const matRes = await fetch(`/api/maternity-patients?patient_id=${patientId}`, {
            headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
          })
          const matData = await matRes.json()
          if (Array.isArray(matData) && matData.length > 0) {
            setMaternityRecord(matData[0])
            const ancRes = await fetch(`/api/antenatal-visits?maternity_patient_id=${matData[0].id}&limit=1`, {
              headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
            })
            const ancData = await ancRes.json()
            if (Array.isArray(ancData) && ancData.length > 0) setLastANCVisit(ancData[0])
          }
        } catch {}
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
      if (!encId) { showToast('Failed to create encounter', 'error'); setSoapSubmitting(false); return }
      const diagnoses = pendingDiagnoses.map((d) => ({ code: d.code, label: d.label, diagnosed_at: new Date().toISOString() }))
      await api.put(`/encounters/${encId}`, { encounter_type: encounterType, chief_complaint: soap.subjective.slice(0, 500), soap_notes: soap, diagnoses: diagnoses.length > 0 ? diagnoses : undefined })
      showToast('SOAP note saved successfully', 'success')
      setSoap(emptySoap)
      setPendingDiagnoses([])
      const { data: refreshed } = await api.get<any>(`/patients/${patientId}`)
      setEncounters(refreshed.encounters || [])
    } catch { showToast('Failed to save SOAP note', 'error') } finally { setSoapSubmitting(false) }
  }

  const handleLabSubmit = async () => {
    if (!patientId || !labForm.test_name.trim()) { showToast('Please enter a test name', 'error'); return }
    setLabSubmitting(true)
    try {
      const encId = await ensureEncounter()
      await api.post('/lab-orders', { encounter_id: encId, test_name: labForm.test_name.trim(), lab_number: patient?.hospital_number || undefined, doctor_comment: labForm.doctor_comment.trim() || undefined })
      showToast('Lab order submitted', 'success'); setLabForm({ test_name: '', doctor_comment: '' }); setActiveModal(null)
    } catch { showToast('Failed to submit lab order', 'error') } finally { setLabSubmitting(false) }
  }

  const handleRadiologySubmit = async () => {
    if (!patientId || !radiologyForm.imaging_type) { showToast('Please select an imaging type', 'error'); return }
    setRadiologySubmitting(true)
    try {
      const encId = await ensureEncounter()
      const doctorName = (() => { try { const u = JSON.parse(localStorage.getItem('sretan_user') || '{}'); return u.name || '' } catch {} return '' })()
      const patName = patient?.full_name || ''
      await api.post('/radiology-orders', { encounter_id: encId, imaging_type: radiologyForm.imaging_type, doctor_name: doctorName, patient_name: patName, doctor_comment: radiologyForm.doctor_comment.trim() || undefined })
      showToast('Radiology order submitted', 'success'); setRadiologyForm({ imaging_type: '', doctor_comment: '' }); setActiveModal(null)
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

  const mergedLabTests = (() => {
    const catalogNames = new Set(labTestCatalog.map((t: any) => t.name.toLowerCase()))
    const inventoryNames = labInventoryItems.filter((i: any) => i.stock_count > 0).map((i: any) => i.drug_name).filter(Boolean)
    const extraNames = inventoryNames.filter((n: string) => !catalogNames.has(n.toLowerCase()))
    const result = [
      ...labTestCatalog.map((t: any) => ({ name: t.name, category: t.category || 'catalog', source: 'catalog' })),
      ...extraNames.map((n: string) => ({ name: n, category: 'lab', source: 'inventory' })),
    ]
    return result
  })()

  const radiologyImagingTypes = (() => {
    const fromInventory = radiologyInventoryItems.filter((i: any) => i.stock_count > 0).map((i: any) => i.drug_name).filter(Boolean)
    const uniqueFromInventory = [...new Set(fromInventory)]
    return uniqueFromInventory.length > 0 ? [...new Set([...fallbackImagingTypes, ...uniqueFromInventory])] : fallbackImagingTypes
  })()

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

      {/* Maternity Banner */}
      {maternityRecord && maternityRecord.status === 'active' && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><span className="text-purple-600 text-sm">👶</span></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-800">Antenatal Patient</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-purple-700">
                <span>EDD: {maternityRecord.edd?.slice(0, 10) || '—'}</span>
                {maternityRecord.edd && <span>Gest. Age: {Math.max(0, 40 - Math.floor((new Date(maternityRecord.edd).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))} weeks</span>}
                <span>G{maternityRecord.gravida} P{maternityRecord.para}</span>
                <span>Living: {maternityRecord.living_children ?? 0}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${maternityRecord.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{maternityRecord.risk_level} risk</span>
                {lastANCVisit && <span>Last ANC: {lastANCVisit.visit_date?.slice(0, 10)}</span>}
              </div>
            </div>
            <button onClick={() => window.location.href = `/maternity/patients/${maternityRecord.id}`}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-200 rounded-xl hover:bg-purple-50">
              View Full Chart
            </button>
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
          {/* Inline ICD-11 Search */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1"><Search size={12} /> Add ICD-11 Diagnosis</label>
            <div className="relative">
              <input type="text" placeholder="Search diagnosis code or name..." value={soapIcdSearch}
                onChange={(e) => { setSoapIcdSearch(e.target.value); setSoapIcdOpen(true) }}
                onFocus={() => setSoapIcdOpen(true)}
                onBlur={() => setTimeout(() => setSoapIcdOpen(false), 200)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              {soapIcdOpen && soapIcdSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                  {icd11Codes.filter((c) => c.code.toLowerCase().includes(soapIcdSearch.toLowerCase()) || c.label.toLowerCase().includes(soapIcdSearch.toLowerCase())).slice(0, 15).map((item) => (
                    <button key={item.code} type="button" onMouseDown={() => {
                      if (!pendingDiagnoses.some((d) => d.code === item.code)) {
                        setPendingDiagnoses((prev) => [...prev, { code: item.code, label: item.label }])
                      }
                      setSoapIcdSearch(''); setSoapIcdOpen(false)
                    }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">{item.code}</span>
                      <span className="text-slate-600">{item.label}</span>
                    </button>
                  ))}
                  {icd11Codes.filter((c) => c.code.toLowerCase().includes(soapIcdSearch.toLowerCase()) || c.label.toLowerCase().includes(soapIcdSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-sm text-slate-400">No matching codes</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {pendingDiagnoses.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">Pending Diagnoses ({pendingDiagnoses.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {pendingDiagnoses.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                    <span className="font-mono text-[10px]">{d.code}</span> {d.label}
                    <button type="button" onClick={() => setPendingDiagnoses((prev) => prev.filter((_, j) => j !== i))}
                      className="p-0.5 rounded-full hover:bg-blue-200 transition-colors"><X size={10} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button onClick={handleSoapSubmit} disabled={soapSubmitting}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:scale-[1.01] transition-all duration-200 disabled:opacity-50">
            {soapSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><ScrollText className="w-4 h-4" /> Save SOAP Note{pendingDiagnoses.length > 0 ? ` + ${pendingDiagnoses.length} Diagnosis` : ''}</>}
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
                    {filteredIcd.map((item) => {
                      const fullItem = ICD11_CODES.find((c) => c.code === item.code)
                      return (
                      <button key={item.code} onClick={() => { setIcdOpen(false); setIcdSearch(''); setIcdConfirmModal({ code: item.code, label: item.label, chapter: fullItem?.chapter || '' }) }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${selectedIcd === item.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}>
                        <span className="font-mono text-xs text-primary">{item.code}</span><span className="ml-2">{item.label}</span>
                      </button>)
                    })}
                    {filteredIcd.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No matching codes found</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Historical Timeline */}
      {activeTab === 'soap' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-slate-700">Historical Timeline ({sortedEncounters.length})</h2>
          </div>
          {sortedEncounters.length === 0 ? (
            <p className="text-sm text-slate-400">No prior encounters found.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(sortedEncounters.slice((soapPage - 1) * PER_PAGE, soapPage * PER_PAGE)).map((enc, idx) => {
                const staffName = enc.staff_id ? staffCache[enc.staff_id] : null
                const realIdx = sortedEncounters.indexOf(enc)
                return (
                  <button key={enc.id} type="button" onClick={() => openTimelineModal(enc)}
                    className={`w-full text-left relative flex items-start gap-4 p-3.5 rounded-xl border transition-all hover:shadow-md ${
                      realIdx === 0 ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/40'
                    }`}>
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock className="w-4 h-4 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${enc.encounter_type === 'maternity' ? 'text-purple-600' : 'text-slate-700'}`}>{enc.encounter_type}</span>
                        {enc.encounter_type === 'maternity' && <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">MAT</span>}
                        <span className="text-xs text-slate-400">{new Date(enc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {realIdx === 0 && <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Current</span>}
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
          <Pagination page={soapPage} totalPages={Math.max(1, Math.ceil(sortedEncounters.length / PER_PAGE))} onChange={setSoapPage} />
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-slate-700">Order History ({allLabOrders.length + allRadOrders.length})</h2>
          </div>
          {(allLabOrders.length + allRadOrders.length) === 0 ? (
            <p className="text-sm text-slate-400">No prior lab or radiology orders.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {[...allLabOrders.map((o: any) => ({ ...o, _type: 'lab' })), ...allRadOrders.map((o: any) => ({ ...o, _type: 'radiology' }))]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice((ordersPage - 1) * PER_PAGE, ordersPage * PER_PAGE)
                .map((ord: any) => (
                <div key={ord.id}
                  className="flex items-start gap-4 p-3.5 rounded-xl border border-slate-100 bg-slate-50/40 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => {
                    if (ord._type === 'lab') {
                      api.get(`/lab-results/${ord.id}?status=completed`).then((r) => {
                        const results: Record<string, any[]> = {}
                        if (r.data?.length) results[ord.id] = r.data
                        setLabResultsMap(results)
                        setTimelineModal({ encounter: ord as any, doctorName: ord.doctor_name || '', prescriptions: [], labOrders: [ord], radiologyOrders: [] })
                      }).catch(() => setTimelineModal({ encounter: ord as any, doctorName: ord.doctor_name || '', prescriptions: [], labOrders: [ord], radiologyOrders: [] }))
                    } else {
                      setRadiologyDetailModal(ord)
                    }
                  }}>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {ord._type === 'lab' ? <FlaskConical className="w-4 h-4 text-primary" /> : <Scan className="w-4 h-4 text-indigo-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{ord._type === 'lab' ? ord.test_name : ord.imaging_type}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${
                        ord.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>{ord.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{ord._type === 'lab' ? 'Lab' : 'Radiology'}</span>
                      <span>{new Date(ord.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {ord.doctor_name && <span>by <strong>{ord.doctor_name}</strong></span>}
                    </div>
                    {ord.doctor_comment && <DoctorComment comment={ord.doctor_comment} />}
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 mt-2" />
                </div>
              ))}
            </div>
          )}
          <Pagination page={ordersPage} totalPages={Math.max(1, Math.ceil((allLabOrders.length + allRadOrders.length) / PER_PAGE))} onChange={setOrdersPage} />
        </div>
      )}

      {activeTab === 'prescribe' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-slate-700">Prescription History ({allPrescriptions.length})</h2>
          </div>
          {allPrescriptions.length === 0 ? (
            <p className="text-sm text-slate-400">No prior prescriptions.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {[...allPrescriptions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice((rxPage - 1) * PER_PAGE, rxPage * PER_PAGE).map((rx: any) => (
                <div key={rx.id} onClick={() => setRxDetailModal(rx)}
                  className="cursor-pointer flex items-start gap-4 p-3.5 rounded-xl border border-slate-100 bg-slate-50/40 hover:shadow-md transition-all">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Pill className="w-4 h-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{rx.drug_name}</span>
                      {rx.dosage && <span className="text-xs text-slate-500">{rx.dosage}</span>}
                      {rx.quantity ? <span className="text-xs text-slate-400">Qty: {rx.quantity}</span> : null}
                      {rx.status === 'dispensed' ? (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Dispensed</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-amber-100 text-amber-700">Not Dispensed</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(rx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {rx.instructions && <p className="text-xs text-slate-400 mt-0.5 italic">"{rx.instructions}"</p>}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 mt-2" />
                </div>
              ))}
            </div>
          )}
          <Pagination page={rxPage} totalPages={Math.max(1, Math.ceil(allPrescriptions.length / PER_PAGE))} onChange={setRxPage} />
        </div>
      )}

      {/* Prescription Detail Modal */}
      {rxDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRxDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Pill className="w-4 h-4 text-primary" /> Prescription Details</h3>
              <button onClick={() => setRxDetailModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Drug:</span> <span className="font-medium text-slate-800">{rxDetailModal.drug_name}</span></div>
                <div><span className="text-slate-500">Status:</span>
                  {rxDetailModal.status === 'dispensed' ? (
                    <span className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Dispensed</span>
                  ) : (
                    <span className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-amber-100 text-amber-700">Not Dispensed</span>
                  )}
                </div>
                {rxDetailModal.dosage && <div><span className="text-slate-500">Dosage:</span> <span className="font-medium text-slate-800">{rxDetailModal.dosage}</span></div>}
                {rxDetailModal.quantity && <div><span className="text-slate-500">Quantity:</span> <span className="font-medium text-slate-800">{rxDetailModal.quantity}</span></div>}
                <div><span className="text-slate-500">Prescribed:</span> <span className="font-medium text-slate-800">{new Date(rxDetailModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div><span className="text-slate-500">Payment:</span>
                  {rxDetailModal.is_paid ? (
                    <span className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                  ) : (
                    <span className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700">Unpaid</span>
                  )}
                </div>
              </div>
              {rxDetailModal.doctor_name && (
                <div className="bg-slate-50 rounded-xl p-3 text-sm">
                  <span className="text-slate-500">Prescribed by:</span> <span className="font-medium text-slate-700 ml-1">{rxDetailModal.doctor_name}</span>
                </div>
              )}
              {rxDetailModal.instructions && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Instructions</p>
                  <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 italic">"{rxDetailModal.instructions}"</div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setRxDetailModal(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Radiology Detail Modal */}
      {radiologyDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRadiologyDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Scan size={22} className="text-indigo-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{radiologyDetailModal.imaging_type}</h2>
                  {radiologyDetailModal.imaging_number && <p className="text-xs text-slate-400 font-mono">#{radiologyDetailModal.imaging_number}</p>}
                </div>
              </div>
              <button onClick={() => setRadiologyDetailModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold">{patient?.full_name || radiologyDetailModal.patient_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Ordered By</p>
                  <p className="text-sm font-semibold">{radiologyDetailModal.doctor_name || '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(radiologyDetailModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${radiologyDetailModal.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : radiologyDetailModal.status === 'review' || radiologyDetailModal.status === 'rejected' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                    {radiologyDetailModal.status === 'completed' ? <CheckCircle size={12} /> : null}
                    {radiologyDetailModal.status === 'review' || radiologyDetailModal.status === 'rejected' ? 'In Review' : radiologyDetailModal.status?.charAt(0).toUpperCase() + radiologyDetailModal.status?.slice(1)}
                  </span>
                </div>
                {radiologyDetailModal.imaging_number && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Imaging #</p>
                    <p className="text-sm font-semibold font-mono">{radiologyDetailModal.imaging_number}</p>
                  </div>
                )}
              </div>

              {radiologyDetailModal.doctor_comment && <DoctorComment comment={radiologyDetailModal.doctor_comment} />}

              {radiologyDetailModal.reported_by_name && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Scan size={14} className="text-indigo-600" />
                    <p className="text-xs text-slate-500">Radiologist / Reported By</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{radiologyDetailModal.reported_by_name}</p>
                  {radiologyDetailModal.reported_at && <p className="text-xs text-slate-500 mt-0.5">Reported on: {new Date(radiologyDetailModal.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText size={12} /> Radiology Report</h4>
                <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[100px]">{radiologyDetailModal.report_text || 'No report available'}</div>
              </div>

              {radiologyDetailModal.image_path && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileImage size={12} /> Attached Image</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setRadModalImage(radiologyDetailModal.image_path)}>
                    <img src={radiologyDetailModal.image_path} alt="Radiology image"
                      className="max-w-full max-h-80 rounded-lg object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm text-slate-400 py-4">Image not available</p>' }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">Click image to view full screen</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setRadiologyDetailModal(null)} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Radiology Image Fullscreen */}
      {radModalImage && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center" onClick={() => setRadModalImage(null)}>
          <div className="absolute top-4 right-4 z-10">
            <button onClick={() => setRadModalImage(null)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X size={22} className="text-white" />
            </button>
          </div>
          <img src={radModalImage} alt="Radiology" className="max-w-[95vw] max-h-[95vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

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
                      onChange={(e) => { setLabTestSearch(e.target.value); setLabForm({ test_name: '', doctor_comment: labForm.doctor_comment }); setShowLabTestDropdown(true) }}
                      onFocus={() => setShowLabTestDropdown(true)}
                      onBlur={() => setTimeout(() => setShowLabTestDropdown(false), 200)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
                    {showLabTestDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                        {mergedLabTests.filter((t: any) => t.name.toLowerCase().includes((labTestSearch || labForm.test_name).toLowerCase())).slice(0, 10).map((t: any, i: number) => (
                          <button key={`${t.name}-${i}`} type="button" onMouseDown={() => { setLabForm({ test_name: t.name, doctor_comment: labForm.doctor_comment }); setLabTestSearch(''); setShowLabTestDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{t.name} <span className="text-slate-400 text-xs">{t.category}</span></button>
                        ))}
                        {mergedLabTests.filter((t: any) => t.name.toLowerCase().includes((labTestSearch || labForm.test_name).toLowerCase())).length === 0 && (
                          <div className="px-4 py-2.5 text-sm text-slate-400">No matching tests</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Doctor's Comment</label>
                  <textarea placeholder="Optional: Add clinical notes or specific instructions for the lab..."
                    value={labForm.doctor_comment}
                    onChange={(e) => setLabForm({ ...labForm, doctor_comment: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
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
                  <div className="relative">
                    <input type="text" placeholder="Search imaging types..." value={radiologySearch || radiologyForm.imaging_type}
                      onChange={(e) => { setRadiologySearch(e.target.value); setRadiologyForm({ ...radiologyForm, imaging_type: '' }); setShowRadiologyDropdown(true) }}
                      onFocus={() => setShowRadiologyDropdown(true)}
                      onBlur={() => setTimeout(() => setShowRadiologyDropdown(false), 200)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
                    {showRadiologyDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                        {radiologyImagingTypes.filter((t) => t.toLowerCase().includes((radiologySearch || radiologyForm.imaging_type).toLowerCase())).slice(0, 10).map((type) => (
                          <button key={type} type="button" onMouseDown={() => { setRadiologyForm({ ...radiologyForm, imaging_type: type }); setRadiologySearch(''); setShowRadiologyDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{type}</button>
                        ))}
                        {radiologyImagingTypes.filter((t) => t.toLowerCase().includes((radiologySearch || radiologyForm.imaging_type).toLowerCase())).length === 0 && (
                          <div className="px-4 py-2.5 text-sm text-slate-400">No matching imaging types</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Doctor's Comment</label>
                  <textarea placeholder="Optional: Add clinical notes or specific instructions for the radiologist..."
                    value={radiologyForm.doctor_comment}
                    onChange={(e) => setRadiologyForm({ ...radiologyForm, doctor_comment: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow" />
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
                          {lab.doctor_comment && <DoctorComment comment={lab.doctor_comment} />}
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
                        {rad.doctor_comment && <DoctorComment comment={rad.doctor_comment} />}
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

      {/* ICD-11 Confirmation Modal */}
      {icdConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIcdConfirmModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-primary px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Search size={16} className="text-white" /></div>
                <div>
                  <p className="text-sm font-semibold text-white">Confirm ICD-11 Diagnosis</p>
                  <p className="text-[11px] text-white/70">Review the diagnosis before saving</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-xs font-bold">{icdConfirmModal.code}</span>
                  {icdConfirmModal.chapter && <span className="text-[10px] text-blue-500 font-medium">{icdConfirmModal.chapter}</span>}
                </div>
                <p className="text-sm font-medium text-slate-800">{icdConfirmModal.label}</p>
              </div>
              <p className="text-xs text-slate-400">This diagnosis will be added to your consultation notes. It will be saved together with the SOAP note when you submit.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIcdConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100">Cancel</button>
              <button onClick={() => {
                const item = icdConfirmModal
                setIcdConfirmModal(null)
                setSelectedIcd(item.code)
                if (!pendingDiagnoses.some((d) => d.code === item.code)) {
                  setPendingDiagnoses((prev) => [...prev, { code: item.code, label: item.label }])
                  showToast(`Diagnosis added: ${item.code} — ${item.label}`, 'success')
                }
              }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                <CheckCircle size={14} /> Confirm Diagnosis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
