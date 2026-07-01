import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import type { Patient, Encounter } from '../types'
import {
  User, Clock, Pill, Beaker, Scan, Activity, Loader2, Bed, Search, ClipboardList, ChevronDown, Info,
  AlertTriangle, ChevronRight, ArrowLeft, Stethoscope, FlaskConical, Droplets, XCircle,
  FileText, X, Plus, CheckCircle, Edit2, Mic, Printer, FileImage
} from 'lucide-react'

const PER_PAGE = 15
const TREATMENT_PER_PAGE = 25

function usePagination<T>(items: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PER_PAGE
  return { items: items.slice(start, start + PER_PAGE), totalPages }
}

function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  return (
    <span className="inline" style={{ position: 'relative' }}
      onMouseEnter={(e) => { setShow(true); const r = (e.target as HTMLElement).getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top - 8 }) }}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="fixed z-[100] pointer-events-none" style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}>
          <div className="bg-slate-800 text-white text-[11px] leading-relaxed rounded-xl px-3 py-2 shadow-xl max-w-[220px] text-center whitespace-pre-line">{text}</div>
          <div className="w-2 h-2 bg-slate-800 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </span>
  )
}

function to12Hour(time: string): string {
  if (!time) return ''
  const parts = time.split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] || '00'
  if (isNaN(h)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${m} ${period}`
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

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (n: number) => void }) {
  if (totalPages <= 1) return null
  const pages: number[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 3) {
    for (let i = 1; i <= maxVisible; i++) pages.push(i)
  } else if (page >= totalPages - 2) {
    for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i)
  } else {
    for (let i = page - 2; i <= page + 2; i++) pages.push(i)
  }
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
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

async function fetchDoctorName(staffId: string): Promise<string> {
  try { const s = await api.get(`/staff/${staffId}`); return s.data?.name || 'Unknown Doctor' } catch { return 'Unknown Doctor' }
}

export default function PatientChart() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<any[]>([])
  const [rxList, setRxList] = useState<any[]>([])
  const [labOrders, setLabOrders] = useState<any[]>([])
  const [labResults, setLabResults] = useState<Record<string, any[]>>({})
  const [radOrders, setRadOrders] = useState<any[]>([])
  const [vitalsList, setVitalsList] = useState<any[]>([])
  const [admissions, setAdmissions] = useState<any[]>([])
  const [viewLabModal, setViewLabModal] = useState<any | null>(null)
  const [viewRadModal, setViewRadModal] = useState<any | null>(null)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [imageZoom, setImageZoom] = useState(false)
  const [showVitalsForm, setShowVitalsForm] = useState(false)
  const [vitalsForm, setVitalsForm] = useState({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', triage_priority: 'green', nursing_notes: '' })
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false)
  const [rxPage, setRxPage] = useState(1)
  const [encPage, setEncPage] = useState(1)
  const [labPage, setLabPage] = useState(1)
  const [radPage, setRadPage] = useState(1)
  const [vitPage, setVitPage] = useState(1)
  const [nurseNotes, setNurseNotes] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [fluidBalance, setFluidBalance] = useState<any[]>([])
  const [fluidSessions, setFluidSessions] = useState<any[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState('general')
  const [doctorNoteContent, setDoctorNoteContent] = useState('')
  const [doctorNoteType, setDoctorNoteType] = useState('clinical')
  const [doctorNoteSubmitting, setDoctorNoteSubmitting] = useState(false)
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [showTreatmentModal, setShowTreatmentModal] = useState(false)
  const [treatmentForm, setTreatmentForm] = useState({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])
  const [doseMap, setDoseMap] = useState<Record<string, any[]>>({})
  const [treatmentSuggestions, setTreatmentSuggestions] = useState<string[]>([])
  const [showTreatmentDropdown, setShowTreatmentDropdown] = useState(false)
  const [treatmentRoute, setTreatmentRoute] = useState<string[]>([])
  const [treatmentOtherRoute, setTreatmentOtherRoute] = useState('')
  const [sessionsMap, setSessionsMap] = useState<Record<string, any[]>>({})
  const [expandedTreatments, setExpandedTreatments] = useState<Record<string, boolean>>({})
  const [showAddSessionModal, setShowAddSessionModal] = useState(false)
  const [addSessionTreatment, setAddSessionTreatment] = useState<any | null>(null)
  const [txFilter, setTxFilter] = useState<'all' | 'active'>('all')
  const [treatmentSubmitting, setTreatmentSubmitting] = useState(false)
  const [addTxChoice, setAddTxChoice] = useState<{ treatment_id: string; name: string } | null>(null)
  const [showFluidModal, setShowFluidModal] = useState(false)
  const [confirmDose, setConfirmDose] = useState<{ doseId: string; treatmentName: string; time: string; treatmentId: string } | null>(null)
  const [endTreatment, setEndTreatment] = useState<{ treatmentId: string; treatmentName: string } | null>(null)
  const [endReason, setEndReason] = useState('')
  const [endIsDrug, setEndIsDrug] = useState(false)
  const [drugEndChoice, setDrugEndChoice] = useState<{ treatmentId: string; name: string } | null>(null)
  const [parentInfoModal, setParentInfoModal] = useState<any | null>(null)
  const [childInfoModal, setChildInfoModal] = useState<{ session: any; treatmentName: string } | null>(null)
  const [summarySearch, setSummarySearch] = useState('')
  const [summaryDateFilter, setSummaryDateFilter] = useState('all')
  const [summaryDateFrom, setSummaryDateFrom] = useState('')
  const [summaryDateTo, setSummaryDateTo] = useState('')
  const [summaryPage, setSummaryPage] = useState(1)
  const [showSummaryDropdown, setShowSummaryDropdown] = useState(false)
  const [skipReason, setSkipReason] = useState<{ doseId: string; treatmentId: string } | null>(null)
  const [skipReasonText, setSkipReasonText] = useState('')
  const [doseDetail, setDoseDetail] = useState<any | null>(null)
  const [fluidForm, setFluidForm] = useState({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' })
  const [fluidRoutes, setFluidRoutes] = useState<string[]>([])
  const [fluidOtherRoute, setFluidOtherRoute] = useState('')
  const [fluidSubmitting, setFluidSubmitting] = useState(false)
  const [showFluidDetailModal, setShowFluidDetailModal] = useState(false)
  const [fluidDetail, setFluidDetail] = useState<'intake' | 'output'>('intake')
  const [fluidEditMode, setFluidEditMode] = useState(false)
  const [fluidSearch, setFluidSearch] = useState('')
  const [showFluidDropdown, setShowFluidDropdown] = useState(false)
  const [isFluidOther, setIsFluidOther] = useState(false)
  const [showOutputModal, setShowOutputModal] = useState(false)
  const [outputForm, setOutputForm] = useState({ urine: '', vomit: '', aspirate: '', bowels: '', blood_loss: '' })
  const [outputSubmitting, setOutputSubmitting] = useState(false)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)

  async function performAddTreatment() {
    if (!treatmentForm.treatment.trim() || !patientId) return
    setTreatmentSubmitting(true)
    try {
      const timesStr = selectedTimes.join(',')
      const routeStr = [...treatmentRoute, ...(treatmentOtherRoute.trim() ? [treatmentOtherRoute.trim()] : [])].join(', ')
      const res = await api.post('/treatments', { ...treatmentForm, route: routeStr || null, patient_id: patientId, staff_id: currentUser?.id, times: timesStr || undefined })
      const { treatment_id } = res.data || {}
      setShowTreatmentModal(false)
      setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
      setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute('')
      const res2 = await api.get(`/treatments?patient_id=${patientId}`)
      setTreatments(res2.data || [])
      if (treatment_id) {
        const sessRes = await api.get(`/treatment-sessions?treatment_id=${treatment_id}`)
        setSessionsMap((prev) => ({ ...prev, [treatment_id]: sessRes.data || [] }))
        const doseMapNew: Record<string, any[]> = { ...doseMap }
        for (const s of (sessRes.data || [])) { try { const doseRes = await api.get(`/treatment-doses?session_id=${s.id}`); doseMapNew[s.id] = doseRes.data || [] } catch { doseMapNew[s.id] = [] } }
        setDoseMap(doseMapNew)
      }
    } catch {} finally { setTreatmentSubmitting(false) }
  }

  async function autoCompleteTreatment(sessionId: string, doses: any[]) {
    if (doses.length === 0) return
    const allDone = doses.every((d: any) => d.status === 'administered' || d.status === 'skipped')
    if (!allDone) return
    try {
      await api.put(`/treatment-sessions/${sessionId}`, { status: 'completed', end_date: new Date().toISOString(), ended_by: currentUser?.id })
      setSessionsMap((prev) => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          next[key] = next[key].map((s: any) => s.id === sessionId ? { ...s, status: 'completed', end_date: new Date().toISOString() } : s)
        }
        return next
      })
    } catch {}
  }

  const COMMON_FLUIDS = [
    // ── Crystalloids ──
    'Normal Saline (0.9% NaCl)', 'Half Normal Saline (0.45% NaCl)', 'Hypertonic Saline 3%',
    'Hypertonic Saline 5%', 'Hypertonic Saline 7.5%', 'Hypertonic Saline 23.4%',
    'Dextrose 5% (D5W)', 'Dextrose 10% (D10W)', 'Dextrose 20%', 'Dextrose 25%',
    'Dextrose 30%', 'Dextrose 50% (D50W)', 'D5 0.225% NaCl', 'D5 0.45% NaCl (D5 1/2 NS)',
    'D5 0.9% NaCl (D5 NS)', 'D5 Lactated Ringers (D5 LR)', 'D5 Ringer Solution',
    'Lactated Ringers (LR)', 'Ringer Lactate', 'Ringer Solution', 'Hartmanns Solution',
    'Plasmalyte', 'Plasmalyte 148', 'Plasmalyte 56', 'Normosol-R', 'Normosol-M',
    'Sterile Water for Injection', 'Sterile Water for Irrigation',
    'Balanced Salt Solution (BSS)', 'BSS Plus',
    // ── Colloids / Plasma Expanders ──
    'Albumin 5%', 'Albumin 25%', 'Hetastarch (HES) 6%', 'Hetastarch (HES) 10%',
    'Pentastarch', 'Tetrastarch (Voluven)', 'Dextran 40', 'Dextran 70',
    'Gelatin (Gelofusine)', 'Gelatin (Haemaccel)', 'Polygeline',
    // ── Electrolytes / Replacement ──
    'Sodium Chloride 0.45%', 'Sodium Chloride 3%', 'Potassium Chloride (KCl)',
    'Potassium Chloride 20 mEq/L', 'Potassium Chloride 40 mEq/L',
    'Potassium Phosphate', 'Sodium Phosphate', 'Potassium Acetate',
    'Sodium Acetate', 'Magnesium Sulfate 10%', 'Magnesium Sulfate 20%',
    'Magnesium Sulfate 50%', 'Calcium Chloride', 'Calcium Gluconate',
    'Sodium Bicarbonate 5%', 'Sodium Bicarbonate 8.4%', 'Sodium Bicarbonate 7.5%',
    'Ammonium Chloride', 'Sodium Lactate',
    // ── Blood Products ──
    'Packed Red Blood Cells', 'Fresh Frozen Plasma (FFP)', 'Platelets (Pooled)',
    'Platelets (Apheresis)', 'Cryoprecipitate', 'Whole Blood', 'Leukoreduced RBCs',
    'Washed RBCs', 'Irradiated RBCs', 'Granulocytes', 'Prothrombin Complex Concentrate',
    'Fibrinogen Concentrate', 'Factor VIII Concentrate', 'Factor IX Concentrate',
    'Anti-D Immunoglobulin', 'IV Immunoglobulin (IVIG)', 'Rhogam',
    // ── Osmotic Diuretics ──
    'Mannitol 5%', 'Mannitol 10%', 'Mannitol 15%', 'Mannitol 20%', 'Mannitol 25%',
    'Glycerol', 'Isosorbide', 'Urea',
    // ── TPN / Nutrition ──
    'TPN (Total Parenteral Nutrition)', 'TPN with Electrolytes', 'TPN with Multivitamins',
    'Peripheral Parenteral Nutrition (PPN)', 'Lipids (Intralipid 10%)',
    'Lipids (Intralipid 20%)', 'Lipids (Intralipid 30%)', 'Omegaven (Fish Oil)',
    'SMOFlipid', 'Amino Acid 3%', 'Amino Acid 5%', 'Amino Acid 8.5%',
    'Amino Acid 10%', 'Amino Acid 15%', 'Aminosyn', 'Trophamine',
    'Fat Emulsion (MCT/LCT)', 'Carnitine', 'Enteral Nutrition (Tube Feed)',
    // ── Oral / Enteral ──
    'Oral Rehydration Solution (ORS)', 'Water', 'Juice', 'Milk', 'Soy Milk',
    'Ensure Plus', 'Ensure Clear', 'Glucerna', 'Boost', 'Pedialyte',
    'Gatorade', 'Coconut Water', 'Clear Fast', 'Milk of Magnesia',
    // ── Dialysis / Renal ──
    'Peritoneal Dialysis Solution 1.5%', 'Peritoneal Dialysis Solution 2.5%',
    'Peritoneal Dialysis Solution 4.25%', 'Hemodialysis Bicarbonate Solution',
    'Hemodialysis Acetate Solution', 'Citrate Anticoagulant (ACD-A)',
    // ── Irrigation / Topical ──
    'Normal Saline for Irrigation', 'Sterile Water for Irrigation', 'Glycine 1.5%',
    'Sorbitol 3%', 'Mannitol Irrigation', 'Acetic Acid 0.25%',
    'Neomycin-Polymyxin Irrigation', 'Bacitracin Irrigation',
    'Ringer Irrigation', 'Lactated Ringers Irrigation',
    // ── Medications in Fluids ──
    'D50 with Thiamine', 'N-Acetylcysteine (Mucomyst)', 'Vitamin B Complex',
    'Folic Acid', 'Multivitamin Infusion (MVI)', 'Vitamin C (Ascorbic Acid)',
    'Vitamin K (Phytonadione)', 'Zinc Sulfate', 'Selenium', 'Famotidine in NS',
    'Pantoprazole in NS', 'Heparin 25000 units in D5W', 'Heparin Lock Flush',
    'Magnesium Sulfate in D5W', 'Potassium Chloride in NS', 'Lidocaine in D5W',
    'Amiodarone in D5W', 'Dobutamine in D5W', 'Dopamine in D5W',
    'Norepinephrine in D5W', 'Epinephrine in D5W', 'Vasopressin in NS',
    'Propofol', 'Thiopental', 'Etomidate', 'Dexmedetomidine (Precedex)',
    'Fentanyl in NS', 'Morphine in NS', 'Hydromorphone in NS',
    'Tromethamine (THAM)', 'Naloxone in NS', 'Sodium Nitroprusside',
    'Nitroglycerin in D5W', 'Milrinone in D5W',
    // ── Anticoagulants / Thrombolytics ──
    'Low-Molecular-Weight Heparin', 'Unfractionated Heparin in NS',
    'Enoxaparin', 'Fondaparinux', 'Argatroban', 'Bivalirudin',
    'Alteplase (tPA)', 'Tenecteplase (TNK)', 'Reteplase', 'Streptokinase',
    'Urokinase',
    // ── Other / Specialty ──
    'Sorbitol 3%', 'Sodium Polystyrene Sulfonate', 'Calcium Polystyrene Sulfonate',
    'Sodium Thiosulfate', 'Dimercaprol (BAL)', 'EDTA', 'Deferoxamine',
    'Penicillamine', 'Methylene Blue', 'Flumazenil', 'Protamine Sulfate',
    'Fomepizole', 'Crystalloids', 'Colloids', 'Other',
  ]
  const [notePage, setNotePage] = useState(1)
  const [treatmentPage, setTreatmentPage] = useState(1)
  const [fluidPage, setFluidPage] = useState(1)
  const [admPage, setAdmPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('summary')
  const [modalRx, setModalRx] = useState<any | null>(null)
  const [modalEnc, setModalEnc] = useState<any | null>(null)
  const [modalEncData, setModalEncData] = useState<{ prescriptions: any[]; labOrders: any[]; labResultsMap: Record<string, any[]>; radiologyOrders: any[]; doctorName: string } | null>(null)
  const [staffCache, setStaffCache] = useState<Record<string, string>>({})
  useEffect(() => {
    api.get<any[]>('/inventory?category=pharmacy').then((res) => {
      const drugs = [...new Set((res.data || []).map((i: any) => i.drug_name).filter(Boolean))] as string[]
      setTreatmentSuggestions(drugs)
    }).catch(() => {})
  }, [])

  const currentUser: { id: string; name: string; role: string } | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {} return null })()
  const isNurse = currentUser?.role === 'Nurse'
  const isDoctor = currentUser?.role === 'Doctor'

  async function fetchDoctorNameWithCache(staffId: string): Promise<string> {
    if (staffCache[staffId]) return staffCache[staffId]
    const name = await fetchDoctorName(staffId)
    setStaffCache((p) => ({ ...p, [staffId]: name }))
    return name
  }

  async function enrichWithDoctor<T extends { encounter_id: string }>(items: T[]): Promise<(T & { doctor_name?: string })[]> {
    const enriched: (T & { doctor_name?: string })[] = []
    for (const item of items) {
      let doctorName = ''
      try {
        const enc = await api.get(`/encounters/${item.encounter_id}`)
        if (enc.data?.staff_id) doctorName = await fetchDoctorNameWithCache(enc.data.staff_id)
      } catch {}
      enriched.push({ ...item, doctor_name: doctorName })
    }
    return enriched
  }

  async function handleVitalsSubmit() {
    if (!patientId) return
    setVitalsSubmitting(true)
    try {
      const currentUser = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {} return null })()
      const encRes = await api.post('/encounters', {
        patient_id: patientId, encounter_type: 'vitals', chief_complaint: vitalsForm.nursing_notes.slice(0, 200),
        staff_id: currentUser?.id,
      })
      await api.post('/vitals', {
        encounter_id: encRes.data.id,
        systolic_bp: vitalsForm.systolic_bp ? parseInt(vitalsForm.systolic_bp) : null,
        diastolic_bp: vitalsForm.diastolic_bp ? parseInt(vitalsForm.diastolic_bp) : null,
        pulse: vitalsForm.pulse ? parseInt(vitalsForm.pulse) : null,
        temperature: vitalsForm.temperature ? parseFloat(vitalsForm.temperature) : null,
        respiration_rate: vitalsForm.respiration_rate ? parseInt(vitalsForm.respiration_rate) : null,
        weight: vitalsForm.weight ? parseFloat(vitalsForm.weight) : null,
        spo2: vitalsForm.spo2 ? parseInt(vitalsForm.spo2) : null,
        triage_priority: vitalsForm.triage_priority,
        nursing_notes: vitalsForm.nursing_notes,
      })
      setShowVitalsForm(false)
      setVitalsForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', triage_priority: 'green', nursing_notes: '' })
      const encRes2 = await api.get(`/encounters?patient_id=${patientId}`)
      const loadedEncs = encRes2.data || []
      const vits: any[] = []
      for (const enc of loadedEncs) {
        try {
          const v = await api.get(`/vitals/${enc.id}`)
          const vitalsData = Array.isArray(v.data) ? v.data : [v.data]
          if (vitalsData.length > 0 && vitalsData[0]?.id) {
            let nurseName = ''
            if (enc.staff_id) {
              try { const s = await api.get(`/staff/${enc.staff_id}`); nurseName = s.data?.name || '' } catch {}
            }
            for (const vital of vitalsData) {
              vits.push({ ...vital, nurse_name: nurseName, encounter_date: enc.created_at })
            }
          }
        } catch {}
      }
      setVitalsList(vits)
    } catch {} finally { setVitalsSubmitting(false) }
  }

  async function openEncounterModal(enc: any) {
    const doctorName = enc.staff_id ? await fetchDoctorNameWithCache(enc.staff_id) : 'N/A'
    setModalEnc(enc)
    setModalEncData(null)
    try {
      const [rxRes, labRes, radRes] = await Promise.all([
        api.get(`/prescriptions?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/lab-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/radiology-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
      ])
      const labOrders = labRes.data || []
      const resultsMap: Record<string, any[]> = {}
      for (const lo of labOrders) {
        try { const r = await api.get(`/lab-results/${lo.id}?status=completed`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
      }
      setModalEncData({ prescriptions: rxRes.data || [], labOrders, labResultsMap: resultsMap, radiologyOrders: radRes.data || [], doctorName })
    } catch { setModalEncData({ prescriptions: [], labOrders: [], labResultsMap: {}, radiologyOrders: [], doctorName }) }
  }

  useEffect(() => {
    if (!patientId) return
    async function load() {
      setLoading(true)
      try {
        const patRes = await api.get(`/patients/${patientId}`).catch(() => ({ data: null }))
        let loadedEncs: any[] = []
        if (patRes.data) {
          const { encounters: encs, ...patData } = patRes.data
          loadedEncs = encs || []
          setPatient(patData as Patient)
          setEncounters(loadedEncs)
          for (const enc of loadedEncs) {
            if (enc.staff_id) fetchDoctorNameWithCache(enc.staff_id)
          }
        }

        const encIds = loadedEncs.map((e: any) => e.id)

        const allRx: any[] = []
        const allLabOrders: any[] = []
        const allRadOrders: any[] = []
        const resultsMap: Record<string, any[]> = {}
        const vits: any[] = []

        for (const encId of encIds) {
          const [rxRes, labRes, radRes] = await Promise.all([
            api.get(`/prescriptions?encounter_id=${encId}`).catch(() => ({ data: [] })),
            api.get(`/lab-orders?encounter_id=${encId}`).catch(() => ({ data: [] })),
            api.get(`/radiology-orders?encounter_id=${encId}`).catch(() => ({ data: [] })),
          ])
          allRx.push(...(rxRes.data || []))
          allLabOrders.push(...(labRes.data || []))
          allRadOrders.push(...(radRes.data || []))

          for (const lo of (labRes.data || [])) {
            try { const r = await api.get(`/lab-results/${lo.id}?status=completed`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
          }

          try {
            const v = await api.get(`/vitals/${encId}`)
            const vitalsData = Array.isArray(v.data) ? v.data : [v.data]
            if (vitalsData.length > 0 && vitalsData[0]?.id) {
              const enc = loadedEncs.find((e: any) => e.id === encId)
              let nurseName = ''
              if (enc?.staff_id) {
                try { const s = await api.get(`/staff/${enc.staff_id}`); nurseName = s.data?.name || '' } catch {}
              }
              for (const vital of vitalsData) {
                vits.push({ ...vital, nurse_name: nurseName, encounter_date: enc?.created_at })
              }
            }
          } catch {}
        }

        setRxList(allRx)
        setLabOrders(allLabOrders)
        setRadOrders(allRadOrders)
        setLabResults(resultsMap)
        setVitalsList(vits)

        const admRes = await api.get(`/admissions?patient_id=${patientId}`).catch(() => ({ data: [] }))
        setAdmissions(admRes.data || [])

        if (patientId) {
          const [notesRes, txRes, fbRes, sessRes] = await Promise.all([
            api.get(`/nurse-notes?patient_id=${patientId}`).catch(() => ({ data: [] })),
            api.get(`/treatments?patient_id=${patientId}`).catch(() => ({ data: [] })),
            api.get(`/fluid-balance?patient_id=${patientId}`).catch(() => ({ data: [] })),
            api.get(`/fluid-sessions?patient_id=${patientId}`).catch(() => ({ data: [] })),
          ])
          setNurseNotes(notesRes.data || [])
          setTreatments(txRes.data || [])
          setFluidBalance(fbRes.data || [])
          setFluidSessions(sessRes.data || [])
        }
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [patientId])

  useEffect(() => {
    if (rxList.length > 0 && !(rxList[0] as any).doctor_name) {
      enrichWithDoctor(rxList).then(setRxList)
    }
  }, [rxList.length])

  useEffect(() => {
    if (labOrders.length > 0 && !(labOrders[0] as any).doctor_name) {
      enrichWithDoctor(labOrders).then(setLabOrders)
    }
  }, [labOrders.length])

  useEffect(() => {
    if (radOrders.length > 0 && !(radOrders[0] as any).doctor_name) {
      enrichWithDoctor(radOrders).then(setRadOrders)
    }
  }, [radOrders.length])

  useEffect(() => {
    const isNurseUser = (() => { try { const u = JSON.parse(localStorage.getItem('sretan_user') || '{}'); return u?.role === 'Nurse' } catch { return false } })()
    if (isNurseUser && treatments.length > 0) {
      const hasActive = treatments.some((t: any) => t.status === 'active')
      setTxFilter(hasActive ? 'active' : 'all')
    }
  }, [treatments.length])

  function getTreatmentDoses(tId: string): any[] {
    const sess = sessionsMap[tId] || []
    const result: any[] = []
    for (const s of sess) result.push(...(doseMap[s.id] || []))
    return result
  }

  useEffect(() => {
    if (treatments.length === 0) return
    async function loadSessionsAndDoses() {
      const sessMap: Record<string, any[]> = {}
      const doseMapNew: Record<string, any[]> = {}
      for (const t of treatments) {
        try {
          const sessRes = await api.get(`/treatment-sessions?treatment_id=${t.id}`)
          const sessions = sessRes.data || []
          sessMap[t.id] = sessions
          for (const s of sessions) {
            try {
              const doseRes = await api.get(`/treatment-doses?session_id=${s.id}`)
              doseMapNew[s.id] = doseRes.data || []
            } catch { doseMapNew[s.id] = [] }
          }
        } catch { sessMap[t.id] = [] }
      }
      setSessionsMap(sessMap)
      setDoseMap(doseMapNew)
    }
    loadSessionsAndDoses()
  }, [treatments.length])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!patient) return <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400"><AlertTriangle size={32} /><p className="text-sm mt-2">Patient not found</p></div>

  const doctorNotes = nurseNotes.filter((n: any) => n.note_type === 'doctor')
  const nurseOnlyNotes = nurseNotes.filter((n: any) => n.note_type !== 'doctor')
  const soapEncounters = encounters.filter((e: any) => e.soap_notes && (e.soap_notes.subjective || e.soap_notes.objective || e.soap_notes.assessment || e.soap_notes.plan))

  const sections = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'vitals', label: vitalsList.length > 0 ? `Vitals (${vitalsList.length})` : 'Vitals', icon: Activity },
    { id: 'encounters', label: encounters.filter((e: any) => e.soap_notes && (e.soap_notes.subjective || e.soap_notes.objective || e.soap_notes.assessment || e.soap_notes.plan)).length > 0 ? `Encounters (${encounters.filter((e: any) => e.soap_notes && (e.soap_notes.subjective || e.soap_notes.objective || e.soap_notes.assessment || e.soap_notes.plan)).length})` : 'Encounters', icon: Clock },
    { id: 'prescriptions', label: rxList.length > 0 ? `Rx (${rxList.length})` : 'Rx', icon: Pill },
    { id: 'lab', label: labOrders.length > 0 ? `Lab (${labOrders.length})` : 'Lab', icon: FlaskConical },
    { id: 'radiology', label: radOrders.length > 0 ? `Radiology (${radOrders.length})` : 'Radiology', icon: Scan },
    { id: 'admissions', label: admissions.length > 0 ? `Admissions (${admissions.length})` : 'Admissions', icon: Bed },
    { id: 'treatment_sheet', label: `Tx Sheet (${treatments.filter((t: any) => t.status === 'active').length})`, icon: Pill },
    { id: 'treatment_summary', label: `Tx Summary (${treatments.length})`, icon: ClipboardList },
    { id: 'fluid_balance', label: fluidSessions.length > 0 ? `Fluid (${fluidSessions.length})` : 'Fluid', icon: Droplets },
    { id: 'nurse_clinical_notes', label: nurseOnlyNotes.length > 0 ? `Nurses Clin. Notes (${nurseOnlyNotes.length})` : 'Nurses Clin. Notes', icon: FileText },
    { id: 'doctor_clinical_notes', label: (doctorNotes.length + soapEncounters.length) > 0 ? `Doctors Cli. Notes (${doctorNotes.length + soapEncounters.length})` : 'Doctors Cli. Notes', icon: Stethoscope },
  ]

  const visibleSections = sections.filter((s) => {
    if (isNurse) return !['prescriptions', 'radiology', 'doctor_clinical_notes'].includes(s.id)
    return true
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 flex-shrink-0 mt-0.5"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><User className="w-5 h-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-800 truncate">Patient Chart</h1>
          <p className="text-sm text-slate-400 truncate">{patient.full_name} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; {patient.blood_type || 'N/A'}</p>
        </div>
        {isNurse || isDoctor ? (
          <div className="w-full lg:w-auto flex items-center gap-2 lg:ml-auto pt-2 lg:pt-0">
            <button onClick={() => { setShowVitalsForm(true); setActiveSection('vitals') }}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
              <Activity size={15} /> Record Vitals
            </button>
            {isDoctor && (
              <button onClick={() => navigate(`/consultation/${patientId}`)}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                <Stethoscope size={15} /> Consult
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {visibleSections.map((s) => {
          const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeSection === s.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon size={12} className="hidden sm:inline" /> {s.label}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      {activeSection === 'summary' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Patient Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'Full Name', value: patient.full_name },
                { label: 'Sex', value: patient.sex || '—' },
                { label: 'DOB', value: patient.dob?.slice(0, 10) || '—' },
                { label: 'Blood Type', value: patient.blood_type || '—' },
                { label: 'Phone', value: patient.phone || '—' },
                { label: 'Insurance', value: patient.insurance ? patient.insurance + (patient.insurance_type ? ' - ' + patient.insurance_type.replace('_', ' ') : '') + (patient.insurance_sub_type ? ' (' + patient.insurance_sub_type + ')' : '') : '—' },
                { label: 'Next of Kin', value: patient.next_of_kin || '—' },
                { label: 'Hospital No.', value: patient.hospital_number || '—' },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs text-slate-400">{f.label}</p>
                  <p className="font-medium text-slate-800 mt-0.5">{f.value}</p>
                </div>
              ))}
            </div>
            {(() => {
  const activeAdmission = admissions.find((a: any) => a.status === 'active')
  if (activeAdmission) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Current Status</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-emerald-50 border-emerald-200 text-emerald-700">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Admitted — {activeAdmission.ward_name}{activeAdmission.bed_number ? <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-[10px] font-bold"><Bed size={9} />{activeAdmission.bed_number}</span> : null}
          </span>
        </div>
      </div>
    )
  }
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    checked_in: { label: 'Checked In', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    in_triage: { label: 'In Triage', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    waiting: { label: 'Waiting', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
    with_doctor: { label: 'With Doctor', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
    discharged: { label: 'Discharged', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
  }
  const s = statusMap[patient.status] || { label: patient.status?.replace('_', ' ') || 'Unknown', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' }
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Current Status</span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${s.bg} ${s.color}`}>
          {patient.status === 'in_triage' && <span className="inline-block w-2 h-2 rounded-full animate-pulse bg-amber-500" />}
          {s.label}
        </span>
      </div>
    </div>
  )
})()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Pill size={16} className="text-violet-500" /><h3 className="text-sm font-semibold">Recent Prescriptions</h3></div>
              {rxList.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {rxList.slice(0, 5).map((rx: any) => (
                    <button key={rx.id} onClick={() => setModalRx(rx)}
                      className="w-full flex justify-between text-xs p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-700 font-medium truncate min-w-0">{rx.drug_name}</span>
                      <span className="text-slate-400 flex-shrink-0">{rx.quantity} × {rx.dosage}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><FlaskConical size={16} className="text-amber-500" /><h3 className="text-sm font-semibold">Lab Orders</h3></div>
              {labOrders.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {labOrders.slice(0, 5).map((l: any) => (
                    <button key={l.id} onClick={() => setViewLabModal(l)}
                      className="w-full flex justify-between text-xs gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-700 font-medium truncate min-w-0">{l.test_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Scan size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold">Radiology Orders</h3></div>
              {radOrders.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {radOrders.slice(0, 5).map((r: any) => (
                    <button key={r.id} onClick={() => setViewRadModal(r)}
                      className="w-full flex justify-between text-xs gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-700 font-medium truncate min-w-0">{r.imaging_type}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : r.status === 'review' || r.status === 'rejected' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{r.status === 'review' ? 'In Review' : r.status === 'rejected' ? 'In Review' : r.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Activity size={16} className="text-primary" /><h3 className="text-sm font-semibold">Encounters</h3></div>
              <p className="text-2xl font-bold text-slate-900">{soapEncounters.length}</p>
              <p className="text-xs text-slate-400">Total visits</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Bed size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold">Admissions</h3></div>
              <p className="text-2xl font-bold text-slate-900">{admissions.length}</p>
              <p className="text-xs text-slate-400">Total admissions</p>
              {(() => {
                const active = admissions.find((a: any) => a.status === 'active')
                return active ? (
                  <div className="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-emerald-700 font-medium">Currently admitted</span>
                    <span className="text-emerald-400 flex-shrink-0">·</span>
                    <span className="text-emerald-600 truncate min-w-0">{active.ward_name}</span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-slate-500">Not admitted</div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Encounters */}
      {activeSection === 'encounters' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          {soapEncounters.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No encounters with doctor notes recorded</p>
          ) : (
            <div className="space-y-3">
              {usePagination([...soapEncounters].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), encPage).items.map((enc: any) => {
                const doctorName = enc.staff_id ? staffCache[enc.staff_id] : null
                return (
                  <button key={enc.id} onClick={() => openEncounterModal(enc)}
                    className="w-full text-left flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock size={15} className="text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold uppercase text-slate-700">{enc.encounter_type}</span>
                        <span className="text-xs text-slate-400">{new Date(enc.created_at).toLocaleString()}</span>
                        {doctorName && <span className="text-[11px] text-slate-500">by <strong>{doctorName}</strong></span>}
                      </div>
                      {enc.chief_complaint && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{enc.chief_complaint}</p>}
                      {enc.diagnoses && Array.isArray(enc.diagnoses) && enc.diagnoses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {enc.diagnoses.slice(0, 3).map((d: any, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{d.code}</span>
                          ))}
                          {enc.diagnoses.length > 3 && <span className="text-[10px] text-slate-400">+{enc.diagnoses.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0 mt-3" />
                  </button>
                )
              })}
              <Pagination page={encPage} totalPages={usePagination(soapEncounters, encPage).totalPages} onChange={setEncPage} />
            </div>
          )}
        </div>
      )}

      {/* Prescriptions */}
      {activeSection === 'prescriptions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          {rxList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No prescriptions</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Drug</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Dosage</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Prescribed By</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {usePagination(rxList, rxPage).items.map((rx: any) => (
                    <tr key={rx.id} onClick={() => setModalRx(rx)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-5 py-3 font-medium text-slate-800 truncate max-w-[160px]">{rx.drug_name}</td>
                      <td className="px-5 py-3 text-slate-500">{rx.dosage || '—'}</td>
                      <td className="px-5 py-3">{rx.quantity}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{rx.doctor_name || '—'}</td>
                      <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${rx.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rx.status}</span></td>
                      <td className="px-5 py-3 text-xs text-slate-400">{new Date(rx.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={rxPage} totalPages={usePagination(rxList, rxPage).totalPages} onChange={setRxPage} />
            </>
          )}
        </div>
      )}

      {/* Lab */}
      {activeSection === 'lab' && (
        <div className="space-y-4">
          {labOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No lab orders</div>
          ) : usePagination(labOrders, labPage).items.map((lab: any) => {
            const results = labResults[lab.id] || []
            const statusStyle = lab.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              lab.status === 'processing' ? 'bg-purple-100 text-purple-700' :
              lab.status === 'collected' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            return (
              <div key={lab.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-semibold text-slate-800 truncate">{lab.test_name}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyle}`}>
                      {lab.status.charAt(0).toUpperCase() + lab.status.slice(1)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(lab.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="px-5 py-3">
                  <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 flex-wrap">
                    {lab.doctor_name && <span>Ordered by: <strong>{lab.doctor_name}</strong></span>}
                    {lab.lab_number && <span className="font-mono">#{lab.lab_number}</span>}
                  </div>
                  {lab.doctor_comment && <DoctorComment comment={lab.doctor_comment} />}
                  {results.length > 0 ? (
                    <div className="space-y-1.5">
                      {results.map((r: any) => (
                        <div key={r.id} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl flex-wrap ${r.is_abnormal ? 'bg-rose-50' : 'bg-slate-50'}`}>
                          <span className="font-medium flex-1 min-w-0 text-slate-700">{r.analyte_name}</span>
                          <span className={`font-bold flex-shrink-0 ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                          <span className="text-slate-400 flex-shrink-0">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                          {r.is_abnormal && <AlertTriangle size={12} className="text-rose-500 flex-shrink-0" />}
                          {r.result_number && <span className="text-xs text-slate-300 font-mono flex-shrink-0">#{r.result_number}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      {lab.status === 'ordered' ? 'Awaiting sample collection' :
                       lab.status === 'collected' ? 'Sample collected, processing' :
                       lab.status === 'processing' ? 'Processing in lab' :
                       'Pending results'}
                    </p>
                  )}
                  {lab.status === 'completed' && (
                    <button onClick={() => setViewLabModal(lab)}
                      className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                      <FileText size={14} /> View Results
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <Pagination page={labPage} totalPages={usePagination(labOrders, labPage).totalPages} onChange={setLabPage} />
        </div>
      )}

      {viewLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewLabModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setViewLabModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{viewLabModal.test_name}</span></div>
                <div><span className="text-slate-500">Lab #:</span> <span className="font-mono text-xs">{viewLabModal.lab_number || '—'}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{viewLabModal.status}</span></div>
                <div><span className="text-slate-500">Ordered:</span> <span className="font-medium">{new Date(viewLabModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="col-span-2"><span className="text-slate-500">Ordered by:</span> <span className="font-medium">{viewLabModal.doctor_name || '—'}</span></div>
              </div>

              {viewLabModal.doctor_comment && <DoctorComment comment={viewLabModal.doctor_comment} />}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                {(labResults[viewLabModal.id] || []).length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {(labResults[viewLabModal.id] || []).map((r: any, idx: number) => (
                      <div key={r.id}>
                        <div className={`px-4 py-3 flex items-center gap-2 text-sm flex-wrap ${r.is_abnormal ? 'bg-rose-50' : 'bg-white'}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-medium text-slate-700">{r.analyte_name}</span>
                            <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-slate-400">Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}</span>
                            {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                          </div>
                        </div>
                        {idx === (labResults[viewLabModal.id] || []).length - 1 && (
                          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                            {r.entered_by_name && (
                              <p>Entered by: <strong className="text-slate-700">{r.entered_by_name}</strong> &middot; {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                            )}
                            {r.approved_by_name && (
                              <p>Approved by: <strong className="text-slate-700">{r.approved_by_name}</strong> &middot; {r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setViewLabModal(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Radiology Report Modal */}
      {viewRadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewRadModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Scan size={22} className="text-indigo-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{viewRadModal.imaging_type}</h2>
                  {viewRadModal.imaging_number && <p className="text-xs text-slate-400 font-mono">#{viewRadModal.imaging_number}</p>}
                </div>
              </div>
              <button onClick={() => setViewRadModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold text-slate-800">{viewRadModal.patient_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Ordered By</p>
                  <p className="text-sm font-semibold text-slate-800">{viewRadModal.doctor_name || '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(viewRadModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                {viewRadModal.doctor_comment && <DoctorComment comment={viewRadModal.doctor_comment} />}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${viewRadModal.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : viewRadModal.status === 'review' || viewRadModal.status === 'rejected' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                    {viewRadModal.status === 'completed' ? <CheckCircle size={12} /> : null}
                    {viewRadModal.status === 'review' || viewRadModal.status === 'rejected' ? 'In Review' : viewRadModal.status?.charAt(0).toUpperCase() + viewRadModal.status?.slice(1)}
                  </span>
                </div>
              </div>

              {/* Reported By */}
              {viewRadModal.reported_by_name && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Scan size={14} className="text-indigo-600" />
                    <p className="text-xs text-slate-500">Radiologist / Reported By</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{viewRadModal.reported_by_name}</p>
                  {viewRadModal.reported_at && <p className="text-xs text-slate-500 mt-0.5">Reported on: {new Date(viewRadModal.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              )}

              {/* Report Text */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText size={12} /> Radiology Report</h4>
                <div className="bg-white rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[100px]">{viewRadModal.report_text || 'No report available'}</div>
              </div>

              {/* Uploaded Image */}
              {viewRadModal.image_path && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileImage size={12} /> Attached Image</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setViewImage(viewRadModal.image_path)}>
                    <img src={viewRadModal.image_path} alt="Radiology image"
                      className="max-w-full max-h-80 rounded-lg object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm text-slate-400 py-4">Image not available</p>' }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">Click image to view full screen</p>
                </div>
              )}

              {/* Print */}
              <div className="flex justify-end">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                  <Printer size={14} /> Print Report
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setViewRadModal(null)} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Image Viewer */}
      {viewImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={() => { setViewImage(null); setImageZoom(false) }}>
          <div className="flex items-center justify-between px-6 py-4 bg-black/60 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-white">
              <Scan size={20} className="text-indigo-400" />
              <div>
                <p className="text-sm font-semibold">{viewRadModal?.patient_name || 'Patient'}</p>
                <p className="text-xs text-slate-400">{viewRadModal?.imaging_type} {viewRadModal?.imaging_number ? `· ${viewRadModal.imaging_number}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setImageZoom(!imageZoom)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${imageZoom ? 'bg-white text-slate-800' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                {imageZoom ? 'Fit to Screen' : 'Zoom In'}
              </button>
              <button onClick={() => { setViewImage(null); setImageZoom(false) }}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X size={22} className="text-white" />
              </button>
            </div>
          </div>
          <div className={`flex-1 p-6 overflow-auto ${imageZoom ? 'block' : 'flex items-center justify-center'}`} onClick={(e) => e.stopPropagation()}>
            <img src={viewImage} alt="Radiology image"
              className={`transition-all duration-300 ${imageZoom ? 'w-auto h-auto max-w-none max-h-none cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in'}`}
              onClick={() => setImageZoom(!imageZoom)}
              style={imageZoom ? { maxWidth: 'none', maxHeight: 'none', width: 'auto', height: 'auto', minWidth: '80vw', minHeight: '80vh' } : {}} />
          </div>
        </div>
      )}

      {/* Radiology */}
      {activeSection === 'radiology' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          {radOrders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No radiology orders</p>
          ) : (
            <div className="space-y-3">
              {usePagination(radOrders, radPage).items.map((rad: any) => (
                  <div key={rad.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1 gap-3">
                      <p className="text-sm font-medium text-slate-800 truncate">{rad.imaging_type}</p>
                      <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : rad.status === 'review' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status === 'review' ? 'In Review' : rad.status === 'rejected' ? 'In Review' : rad.status === 'completed' ? 'Completed' : rad.status?.charAt(0).toUpperCase() + rad.status?.slice(1)}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-500 flex-wrap">
                      {rad.doctor_name && <span>Ordered by: <strong>{rad.doctor_name}</strong></span>}
                      <span>{new Date(rad.created_at).toLocaleString()}</span>
                    </div>
                    {rad.doctor_comment && <DoctorComment comment={rad.doctor_comment} />}
                    {rad.status === 'completed' && (
                      <div className="mt-3 space-y-2">
                        {rad.report_text && (
                          <div className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded-lg p-3 border border-slate-200 leading-relaxed max-h-24 overflow-y-auto">{rad.report_text}</div>
                        )}
                        <button onClick={() => setViewRadModal(rad)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                          <FileText size={14} /> {rad.report_text ? 'View Full Report' : 'View Details'}
                        </button>
                      </div>
                    )}
                  </div>
              ))}
              <Pagination page={radPage} totalPages={usePagination(radOrders, radPage).totalPages} onChange={setRadPage} />
            </div>
          )}
        </div>
      )}

      {/* Admissions */}
      {activeSection === 'admissions' && (
        <div className="space-y-4">
          {admissions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No admissions recorded</div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-3xl font-bold text-slate-900">{admissions.length}</p>
                        <p className="text-sm text-slate-500">Total admissions</p>
                      </div>
                      {(() => {
                        const active = admissions.find((a: any) => a.status === 'active')
                        if (!active) return <div className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-2">Not currently admitted</div>
                        return (
                          <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 truncate max-w-full">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-emerald-700 font-medium">Active — {active.ward_name}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
              {usePagination(admissions, admPage).items.map((a: any, idx: number) => (
                <div key={a.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-5 py-3 border-b flex items-center gap-2 flex-wrap ${a.status === 'active' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Bed size={15} className={`flex-shrink-0 ${a.status === 'active' ? 'text-emerald-600' : 'text-slate-500'}`} />
                      <span className="text-sm font-semibold text-slate-700 truncate">{a.ward_name}</span>
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold flex-shrink-0 ${
                        a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>{a.status === 'active' ? 'Active' : 'Discharged'}</span>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(a.admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-slate-500">Admitted:</span> <span className="font-medium text-slate-700">{new Date(a.admitted_at).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Admitted by:</span> <span className="font-medium text-slate-700">{a.admitted_by_name || '—'}</span></div>
                      {a.discharged_at && <div><span className="text-slate-500">Discharged:</span> <span className="font-medium text-slate-700">{new Date(a.discharged_at).toLocaleString()}</span></div>}
                      {a.discharged_by_name && <div><span className="text-slate-500">Discharged by:</span> <span className="font-medium text-slate-700">{a.discharged_by_name}</span></div>}
                    </div>
                    {a.notes && <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{a.notes}</p>}
                  </div>
                </div>
              ))}
              <Pagination page={admPage} totalPages={usePagination(admissions, admPage).totalPages} onChange={setAdmPage} />
            </>
          )}
        </div>
      )}

      {/* Prescription Detail Modal */}
      {modalRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setModalRx(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Pill size={18} className="text-violet-500" />
                Prescription Details
              </h2>
              <button onClick={() => setModalRx(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Drug Name</p>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{modalRx.drug_name}</p>
                </div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Dosage</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.dosage || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Quantity</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.quantity}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Status</p><span className={`inline-flex mt-0.5 px-2.5 py-0.5 rounded-lg text-xs font-medium ${modalRx.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{modalRx.status}</span></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Prescribed By</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.doctor_name || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Date</p><p className="text-sm font-medium text-slate-700 mt-0.5">{new Date(modalRx.created_at).toLocaleString()}</p></div>
                <div className="col-span-2"><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Instructions</p><p className="text-sm text-slate-600 mt-0.5 bg-slate-50 rounded-xl p-3">{modalRx.instructions || 'No instructions provided'}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Encounter Detail Modal */}
      {modalEnc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setModalEnc(null); setModalEncData(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                Encounter Details
              </h2>
              <button onClick={() => { setModalEnc(null); setModalEncData(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700 capitalize">{modalEnc.encounter_type}</span></div>
                <div><span className="text-slate-500">Doctor:</span> <span className="font-medium text-slate-700">{modalEncData?.doctorName || '—'}</span></div>
                <div><span className="text-slate-500">Created:</span> <span className="font-medium text-slate-700">{new Date(modalEnc.created_at).toLocaleString()}</span></div>
                {modalEnc.updated_at !== modalEnc.created_at && (
                  <div><span className="text-slate-500">Updated:</span> <span className="font-medium text-slate-700">{new Date(modalEnc.updated_at).toLocaleString()}</span></div>
                )}
              </div>
              {modalEnc.chief_complaint && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{modalEnc.chief_complaint}</p>
                </div>
              )}
              {modalEnc.diagnoses && Array.isArray(modalEnc.diagnoses) && modalEnc.diagnoses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Diagnoses</p>
                  <div className="space-y-1.5">
                    {modalEnc.diagnoses.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-blue-600 font-medium">{d.code}</span>
                        <span className="text-slate-700">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const soap = modalEnc.soap_notes ? (typeof modalEnc.soap_notes === 'string' ? JSON.parse(modalEnc.soap_notes) : modalEnc.soap_notes) : null
                if (!soap) return null
                const fields = ['subjective', 'objective', 'assessment', 'plan'] as const
                return (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SOAP Notes</p>
                    <div className="grid grid-cols-2 gap-3">
                      {fields.map((f) => soap[f] ? (
                        <div key={f} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary capitalize mb-0.5">{f}</p>
                          <p className="text-sm text-slate-700 break-words">{soap[f]}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )
              })()}
              {modalEncData && (
                <>
                  {modalEncData.prescriptions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Pill size={12} /> Prescriptions ({modalEncData.prescriptions.length})</p>
                      <div className="space-y-1.5">
                        {modalEncData.prescriptions.map((rx: any) => (
                          <div key={rx.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm gap-3">
                            <div className="min-w-0 truncate"><span className="font-medium text-slate-800 truncate">{rx.drug_name}</span> <span className="text-slate-400">{rx.dosage}</span></div>
                            <span className="text-slate-500 flex-shrink-0">Qty: {rx.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {modalEncData.labOrders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FlaskConical size={12} /> Lab Orders ({modalEncData.labOrders.length})</p>
                      <div className="space-y-2">
                        {modalEncData.labOrders.map((lab: any) => {
                          const results = modalEncData.labResultsMap[lab.id] || []
                          return (
                            <div key={lab.id} className="bg-slate-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-slate-800">{lab.test_name}</span>
                                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${lab.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lab.status}</span>
                              </div>
                              {lab.doctor_comment && <DoctorComment comment={lab.doctor_comment} />}
                              {results.length > 0 && results.map((r: any) => (
                                <div key={r.id} className={`flex items-center gap-2 sm:gap-3 text-xs px-2.5 py-1 rounded-lg mt-1 flex-wrap ${r.is_abnormal ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-600'}`}>
                                  <span className="font-medium flex-1 min-w-0 truncate">{r.analyte_name}</span>
                                  <span className="font-bold flex-shrink-0">{r.value}</span>
                                  <span className="text-slate-400 flex-shrink-0">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                                  {r.is_abnormal && <AlertTriangle size={10} className="text-rose-500 flex-shrink-0" />}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {modalEncData.radiologyOrders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Scan size={12} /> Radiology Orders ({modalEncData.radiologyOrders.length})</p>
                      <div className="space-y-1.5">
                        {modalEncData.radiologyOrders.map((rad: any) => (
                          <div key={rad.id} className="bg-slate-50 rounded-xl p-3 text-sm space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-800 truncate min-w-0">{rad.imaging_type}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : rad.status === 'review' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status === 'review' ? 'In Review' : rad.status === 'rejected' ? 'In Review' : rad.status === 'completed' ? 'Completed' : rad.status?.charAt(0).toUpperCase() + rad.status?.slice(1)}</span>
                          </div>
                          {rad.doctor_comment && <DoctorComment comment={rad.doctor_comment} />}
                            {rad.report_text && (
                              <div className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-slate-100 max-h-20 overflow-y-auto">{rad.report_text}</div>
                            )}
                            {rad.reported_by_name && (
                              <p className="text-[10px] text-slate-400">Reported by: {rad.reported_by_name}{rad.reported_at ? ` · ${new Date(rad.reported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!modalEncData && <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-primary" /></div>}
            </div>
          </div>
        </div>
      )}

      {/* Vitals */}
      {activeSection === 'vitals' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{vitalsList.length} record{vitalsList.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowVitalsForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform">
              <Activity size={14} /> Record Vitals
            </button>
          </div>
          {vitalsList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No vitals recorded</div>
          ) : usePagination(vitalsList, vitPage).items.map((v: any, idx: number) => (
            <div key={v.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Activity size={15} className="text-primary flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-700 uppercase">
                    Vitals — {new Date(v.encounter_date || v.created_at).toLocaleDateString('en-GB', {
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
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <User size={12} />
                    <span>by <strong className="text-slate-700">{v.nurse_name}</strong></span>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 sm:gap-3 text-center">
                  {[
                    { label: 'BP', value: v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : '—' },
                    { label: 'Pulse', value: v.pulse ? `${v.pulse}` : '—' },
                    { label: 'Temp', value: v.temperature ? `${v.temperature}°C` : '—' },
                    { label: 'RR', value: v.respiration_rate ? `${v.respiration_rate}` : '—' },
                    { label: 'SpO₂', value: v.spo2 ? `${v.spo2}%` : '—' },
                    { label: 'Weight', value: v.weight ? `${v.weight}kg` : '—' },
                    { label: 'Triage', value: v.triage_priority ? ({ red: 'EMERGENCY', yellow: 'URGENT', green: 'ROUTINE' })[v.triage_priority as 'red' | 'yellow' | 'green'] || v.triage_priority : '—' },
                  ].map((f) => (
                    <div key={f.label} className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-[10px] text-slate-400 font-medium uppercase">{f.label}</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{f.value}</p>
                    </div>
                  ))}
                </div>
                {v.nursing_notes && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Nursing Notes</p>
                    <p className="text-sm text-slate-600">{v.nursing_notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Pagination page={vitPage} totalPages={usePagination(vitalsList, vitPage).totalPages} onChange={setVitPage} />
        </div>
      )}

      {/* Nurses Clinical Notes Tab */}
      {activeSection === 'nurse_clinical_notes' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Clinical Notes</h2>
            {!isDoctor && (
              <button onClick={() => { setShowNoteModal(true); setNoteContent(''); setNoteType('general') }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Plus size={14} /> Add Note</button>
            )}
          </div>
           {nurseOnlyNotes.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No clinical notes recorded</p> : (
            <div className="space-y-3">
              {usePagination(nurseOnlyNotes, notePage).items.map((n: any) => (
                <div key={n.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1 flex-wrap mb-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      {n.note_type && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium uppercase">{n.note_type}</span>}
                      <span>{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {n.staff_name && <span>by <strong>{n.staff_name}</strong></span>}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
              <Pagination page={notePage} totalPages={usePagination(nurseOnlyNotes, notePage).totalPages} onChange={setNotePage} />
            </div>
          )}
        </div>
      )}


      {/* Doctors Clinical Notes Tab */}
      {activeSection === 'doctor_clinical_notes' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Doctors Clinical Notes</h2>
            {isDoctor && (
              <button onClick={() => { setShowDoctorNoteModal(true); setDoctorNoteContent(''); setDoctorNoteType('clinical') }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Stethoscope size={14} /> New Note</button>
            )}
          </div>
          {doctorNotes.length === 0 && soapEncounters.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No doctor clinical notes recorded</p>
          ) : (
            <div className="space-y-4">
              {doctorNotes.length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Written Notes</p>
                  {usePagination(doctorNotes, notePage).items.map((n: any) => (
                    <div key={n.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1 flex-wrap mb-2 text-xs text-slate-400">
                        <span>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        {n.staff_name && <span>by <strong>{n.staff_name}</strong></span>}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {soapEncounters.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SOAP Notes from Encounters</p>
                  {soapEncounters.slice(0, 15).map((enc: any) => {
                    const soap = enc.soap_notes ? (typeof enc.soap_notes === "string" ? JSON.parse(enc.soap_notes) : enc.soap_notes) : null
                    const doctorName = enc.staff_id ? staffCache[enc.staff_id] : null
                    const diagnoses = enc.diagnoses ? (Array.isArray(enc.diagnoses) ? enc.diagnoses : typeof enc.diagnoses === "string" ? JSON.parse(enc.diagnoses) : []) : []
                    return (
                      <div key={enc.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-1 flex-wrap mb-2 text-xs text-slate-400">
                          <div className="flex items-center gap-2">
                            <Stethoscope size={13} className="text-primary flex-shrink-0" />
                            <span className="font-semibold text-slate-700 uppercase text-[10px]">{enc.encounter_type}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{new Date(enc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                            {doctorName && <span>by <strong>{doctorName}</strong></span>}
                          </div>
                        </div>
                        {diagnoses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {diagnoses.map((d: any, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{d.code} {d.label?.slice(0, 40)}</span>
                            ))}
                          </div>
                        )}
                        {soap && (
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            {['subjective', 'objective', 'assessment', 'plan', 'notes'].filter((f) => soap[f]).map((f) => (
                              <div key={f} className="bg-white rounded-lg p-2.5 border border-slate-100">
                                <p className="text-[10px] font-medium text-primary capitalize mb-0.5">{f === 'notes' ? 'Notes' : f}</p>
                                <p className="text-sm text-slate-600">{soap[f]}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {activeSection === 'treatment_sheet' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Treatment Sheet</h2>
            <div className="flex bg-slate-100 rounded-xl p-0.5">
              <Hint text="Show only drugs with active courses that have unmarked dose slots.">
                <button onClick={() => { setTxFilter('active'); setTreatmentPage(1) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${txFilter === 'active' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Active</button>
              </Hint>
              <Hint text="Show all drugs including ended and completed.">
                <button onClick={() => { setTxFilter('all'); setTreatmentPage(1) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${txFilter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
              </Hint>
            </div>
            {!isDoctor && (
              <Hint text="Add a new drug treatment. If the drug already exists, you can add a course or create a new cycle.">
                <button onClick={() => {
                  setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
                  setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowTreatmentModal(true)
                }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Plus size={14} /> Add Treatment</button>
              </Hint>
            )}
          </div>
          {treatments.length === 0 ? (
            <div className="text-center py-12">
              <Pill size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">No treatments recorded yet</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Click <strong>Add Treatment</strong> to prescribe a new medication</p>
              {!isDoctor && (
                <button onClick={() => { setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' }); setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowTreatmentModal(true) }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><Plus size={16} /> Add Treatment</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const grouped: Record<string, any[]> = {}
                for (const t of treatments) {
                  if (!grouped[t.treatment]) grouped[t.treatment] = []
                  grouped[t.treatment].push(t)
                }
                const groupNames = Object.keys(grouped).filter((name) => {
                  if (txFilter === 'all') return true
                  const t = grouped[name][0]
                  return t.status === 'active'
                }).sort((a, b) => {
                  const aAllSess = grouped[a].flatMap((tx: any) => sessionsMap[tx.id] || [])
                  const bAllSess = grouped[b].flatMap((tx: any) => sessionsMap[tx.id] || [])
                  const aHasActive = grouped[a].some((t: any) => t.status === 'active')
                  const bHasActive = grouped[b].some((t: any) => t.status === 'active')
                  if (aHasActive !== bHasActive) return aHasActive ? -1 : 1
                  const aLatest = aAllSess.length > 0 ? Math.max(...aAllSess.map((s: any) => new Date(s.created_at).getTime())) : new Date(grouped[a][0].created_at).getTime()
                  const bLatest = bAllSess.length > 0 ? Math.max(...bAllSess.map((s: any) => new Date(s.created_at).getTime())) : new Date(grouped[b][0].created_at).getTime()
                  return bLatest - aLatest
                })
                if (groupNames.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <Pill size={36} className="mx-auto text-slate-300 mb-3" />
                      {txFilter === 'active' ? (
                        <>
                          <p className="text-sm font-medium text-slate-500">No active treatments</p>
                          <p className="text-xs text-slate-400 mt-1 mb-4">All treatments have been completed or ended</p>
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => setTxFilter('all')} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">View All</button>
                            {!isDoctor && (
                              <button onClick={() => { setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' }); setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowTreatmentModal(true) }}
                                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform">+ Add Treatment</button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-slate-500">No treatments recorded</p>
                          <p className="text-xs text-slate-400 mt-1 mb-4">No medications have been prescribed for this patient yet</p>
                          {!isDoctor && (
                            <button onClick={() => { setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' }); setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowTreatmentModal(true) }}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><Plus size={16} /> Add Treatment</button>
                          )}
                        </>
                      )}
                    </div>
                  )
                }
                const pageGroups = groupNames.slice((treatmentPage - 1) * TREATMENT_PER_PAGE, treatmentPage * TREATMENT_PER_PAGE)
                return pageGroups.map((name) => {
                  const group = grouped[name]
                  const latestT = group.find((t: any) => t.status === 'active') || group[0]
                  const allSessions = group.flatMap((tx: any) => sessionsMap[tx.id] || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  const activeSessions = allSessions.filter((s: any) => {
                    if (s.status !== 'active') return false
                    const ds = doseMap[s.id] || []
                    return ds.length === 0 || ds.some((d: any) => d.status !== 'administered' && d.status !== 'skipped')
                  })
                  const treatmentActive = latestT.status !== 'ended' && latestT.status !== 'completed'
                  const allSessionsDone = allSessions.length > 0 && allSessions.every((s: any) => {
                    const ds = doseMap[s.id] || []
                    return ds.length > 0 && ds.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                  })
                  return (
                    <div key={name} className={`rounded-2xl border overflow-hidden ${latestT.status === 'ended' ? 'border-red-200' : latestT.status === 'completed' ? 'border-blue-200' : 'border-slate-200'}`}>
                      <div className={`px-5 py-3 border-b flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100 transition-colors ${latestT.status === 'ended' ? 'bg-red-50 border-red-100' : latestT.status === 'completed' ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}
                        onClick={() => setExpandedTreatments((prev) => ({ ...prev, [name]: !prev[name] }))}>
                        <div className="flex items-center gap-3 min-w-0">
                          <Hint text="Drug/treatment name. Click to expand or collapse its courses."><span className="text-sm font-semibold text-slate-800">{name}</span></Hint>
                          <Hint text="Total number of courses (dose cycles) under this drug."><span className="text-[10px] text-slate-400 bg-white rounded-lg px-2 py-0.5 border">{allSessions.length} course{allSessions.length !== 1 ? 's' : ''}</span></Hint>
                          {activeSessions.length > 0 && <Hint text="Courses with unmarked dose slots pending administration."><span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-lg px-2 py-0.5">{activeSessions.length} active</span></Hint>}
                          {latestT.status === 'completed' && <Hint text="All courses completed — all doses administered or skipped."><span className="text-[10px] font-medium bg-blue-100 text-blue-700 rounded-lg px-2 py-0.5">Completed</span></Hint>}
                          {latestT.status === 'ended' && <Hint text="This drug treatment has been ended by a nurse."><span className="text-[10px] font-medium bg-red-100 text-red-700 rounded-lg px-2 py-0.5">Ended</span></Hint>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Hint text="View comprehensive drug summary — created by, ended by, dose stats, course history.">
                            <button onClick={(e) => { e.stopPropagation(); setParentInfoModal(latestT) }}
                              className="p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"><Info size={14} className="text-slate-400" /></button>
                          </Hint>
                          {treatmentActive && (
                            <>
                              <Hint text="Add a new course (dose cycle) to this drug. Latest dosage is pre-filled.">
                                <button onClick={(e) => {
                                  e.stopPropagation()
                                  const lastActive = allSessions.find((s: any) => s.status === 'active' || s.status === 'completed')
                                  setAddSessionTreatment({ treatment_id: latestT.id, name })
                                  setTreatmentForm({ treatment: name, dosage: lastActive?.dosage || '', route: '', frequency: '', notes: '' })
                                  setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowAddSessionModal(true)
                                }}
                                  className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">+ New Course</button>
                              </Hint>
                              <Hint text="End this drug treatment. Stops all active courses and hides the +New Course button.">
                                <button onClick={(e) => {
                                  e.stopPropagation()
                                  setDrugEndChoice({ treatmentId: latestT.id, name })
                                }}
                                  className="px-3 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors">End Treatment</button>
                              </Hint>
                            </>
                          )}
                          <Hint text={expandedTreatments[name] ? 'Collapse courses' : 'Expand to view courses'}>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedTreatments[name] ? 'rotate-180' : ''}`} />
                          </Hint>
                        </div>
                      </div>
                      {expandedTreatments[name] && (
                        <div className="divide-y-2 divide-slate-100">
                          {allSessions.length === 0 ? (
                            <div className="px-5 py-6 text-center text-sm text-slate-400">
                              No courses yet.
                              <button onClick={() => {
                                const lastActive = allSessions.find((s: any) => s.status === 'active' || s.status === 'completed')
                                setAddSessionTreatment({ treatment_id: latestT.id, name })
                                setTreatmentForm({ treatment: name, dosage: lastActive?.dosage || '', route: '', frequency: '', notes: '' })
                                setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute(''); setShowAddSessionModal(true)
                              }}
                                className="ml-2 text-primary underline underline-offset-2">Create first course</button>
                            </div>
                          ) : (
                            allSessions.map((s: any, idx: number, arr: any[]) => {
                              const doses = doseMap[s.id] || []
                              const allDone = doses.length > 0 && doses.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                              const displayStatus = allDone ? 'completed' : s.status
                              const prevSess = idx < arr.length - 1 ? arr[idx + 1] : null
                              const prevDosage = prevSess?.dosage
                              const doseChange = s.dosage && prevDosage && s.dosage !== prevDosage ? (parseInt(s.dosage) > parseInt(prevDosage) ? 'increased' : 'reduced') : null
                              return (
                                <div key={s.id} className={`px-5 py-3 ${displayStatus === 'ended' ? 'bg-red-50/30' : displayStatus === 'active' ? 'bg-blue-50/20' : ''}`}>
                                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Hint text={`Course status: ${displayStatus}. Click for comprehensive details.`}>
                                        <button onClick={() => setChildInfoModal({ session: s, treatmentName: name })}
                                          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium cursor-pointer hover:opacity-80 ${displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : displayStatus === 'completed' ? 'bg-blue-100 text-blue-700' : displayStatus === 'ended' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                                          {displayStatus === 'active' ? 'Active' : displayStatus === 'completed' ? 'Completed' : 'Ended'}
                                        </button>
                                      </Hint>
                                      <Hint text="View full course details — dosage, times, dose records, start/end info.">
                                        <button onClick={() => setChildInfoModal({ session: s, treatmentName: name })}
                                          className="p-0.5 rounded hover:bg-slate-200/60 transition-colors"><Info size={12} className="text-slate-400" /></button>
                                      </Hint>
                                      {s.dosage && <Hint text="Dosage prescribed for this course."><span className="text-xs text-slate-500">{s.dosage}</span></Hint>}
                                      {doseChange && (
                                        <Hint text={`Dosage changed from previous course — ${doseChange === 'increased' ? 'increased' : 'reduced'}.`}>
                                          <span className={`text-[10px] font-medium ${doseChange === 'increased' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {doseChange === 'increased' ? '↑ Increased' : '↓ Reduced'}
                                          </span>
                                        </Hint>
                                      )}
                                      {s.route && <Hint text={`Administration route: ${s.route}.`}><span className="text-xs text-amber-600">{s.route}</span></Hint>}
                                      {s.frequency && <Hint text={`Dosing frequency: ${s.frequency}.`}><span className="text-xs text-green-600">{s.frequency}</span></Hint>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {displayStatus === 'active' && (
                                        <Hint text="Manually end this course. All unmarked doses will be left pending.">
                                          <button onClick={() => { setEndTreatment({ treatmentId: s.id, treatmentName: name }); setEndIsDrug(false); setEndReason('') }} className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-medium hover:bg-rose-100">End</button>
                                        </Hint>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-400 mb-1.5">
                                    <Hint text={`Course started by ${s.staff_name || 'the nurse'} on ${new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`}>
                                      <span>Started {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} by <strong>{s.staff_name || '—'}</strong></span>
                                    </Hint>
                                    {s.ended_by_name && (
                                      <Hint text={`Course ${displayStatus === 'ended' ? 'ended' : 'completed'} by ${s.ended_by_name} on ${s.end_date ? new Date(s.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}.`}>
                                        <span>Ended {s.end_date ? new Date(s.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} by <strong>{s.ended_by_name}</strong></span>
                                      </Hint>
                                    )}
                                  </div>
                                  {s.end_reason && <Hint text="Nurse-provided reason for ending this course."><p className="text-[10px] text-red-500 mb-1">Reason: {s.end_reason}</p></Hint>}
                                  {doses.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                                      {doses.map((d: any) => {
                                        const isAdmin = d.status === 'administered'
                                        const isSkipped = d.status === 'skipped'
                                        return (
                                          <Hint text={isAdmin ? `Given at ${to12Hour(d.scheduled_time?.slice(0, 5))}. Click to view details.` : isSkipped ? `Skipped at ${to12Hour(d.scheduled_time?.slice(0, 5))}. Click to view details.` : `Pending dose at ${to12Hour(d.scheduled_time?.slice(0, 5))}. Click to mark as given or skip.`}>
                                          <div key={d.id} className={`rounded-lg border p-2 text-center transition-all ${
                                            isAdmin ? 'bg-emerald-50 border-emerald-200' :
                                            isSkipped ? 'bg-rose-50 border-rose-200' :
                                            'bg-white border-slate-200 hover:border-blue-300 cursor-pointer'
                                          }`} onClick={() => {
                                            if (isAdmin || isSkipped) { setDoseDetail({ ...d, treatment_name: name }); return }
                                            if (s.status !== 'active' || latestT.status === 'ended' || latestT.status === 'completed') return
                                            setConfirmDose({ doseId: d.id, treatmentName: name, time: to12Hour(d.scheduled_time?.slice(0, 5)), treatmentId: s.id })
                                          }}>
                                            <p className="text-[11px] font-bold text-slate-700">{to12Hour(d.scheduled_time?.slice(0, 5))}</p>
                                            {isAdmin ? <p className="text-[9px] text-emerald-600 font-bold mt-0.5">DONE</p> : isSkipped ? <p className="text-[9px] text-rose-600 font-bold mt-0.5">SKIPPED</p> : <p className="text-[9px] text-slate-400 mt-0.5">—</p>}
                                            {d.administered_by_name && <p className="text-[10px] text-slate-600 font-medium">{d.administered_by_name}</p>}
                                          </div>
                                          </Hint>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">No doses scheduled</p>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
              <Pagination page={treatmentPage} totalPages={Math.max(1, Math.ceil([...new Set(treatments.map((t: any) => t.treatment))].length / TREATMENT_PER_PAGE))} onChange={setTreatmentPage} />
            </div>
          )}
        </div>
      )}

      {/* Treatment Summary Tab */}
      {activeSection === 'treatment_summary' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-slate-700">Treatment Summary ({treatments.length})</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Search treatment..." value={summarySearch}
                  onChange={(e) => { setSummarySearch(e.target.value); setShowSummaryDropdown(true); setSummaryPage(1) }}
                  onFocus={() => setShowSummaryDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSummaryDropdown(false), 200)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                {showSummaryDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                    {[...new Set(treatments.map((t: any) => t.treatment).filter(Boolean))].filter((name) => name.toLowerCase().includes(summarySearch.toLowerCase())).slice(0, 10).map((name) => (
                      <button key={name} type="button" onMouseDown={() => { setSummarySearch(name); setShowSummaryDropdown(false); setSummaryPage(1) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center gap-2"><Pill size={14} className="text-blue-500" /> {name}</button>
                    ))}
                    {[...new Set(treatments.map((t: any) => t.treatment).filter(Boolean))].filter((name) => name.toLowerCase().includes(summarySearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2.5 text-sm text-slate-400">No matching treatments</div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: 'all', label: 'All Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'this_week', label: 'This Week' },
                  { value: 'custom_date', label: 'Custom Date' },
                  { value: 'custom_range', label: 'Custom Range' },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => { setSummaryDateFilter(opt.value); setSummaryPage(1) }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${summaryDateFilter === opt.value ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'}`}>{opt.label}</button>
                ))}
              </div>
              {summaryDateFilter === 'custom_date' && (
                <input type="date" value={summaryDateFrom} onChange={(e) => setSummaryDateFrom(e.target.value)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              )}
              {summaryDateFilter === 'custom_range' && (
                <>
                  <input type="date" value={summaryDateFrom} onChange={(e) => { setSummaryDateFrom(e.target.value); setSummaryPage(1) }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  <span className="text-xs text-slate-400 self-center">to</span>
                  <input type="date" value={summaryDateTo} onChange={(e) => { setSummaryDateTo(e.target.value); setSummaryPage(1) }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </>
              )}
            </div>
          </div>

          {treatments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <ClipboardList size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">No treatments recorded.</p>
            </div>
          ) : (
            <>
              {(() => {
                const now = new Date()
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const yesterdayStart = new Date(todayStart.getTime() - 86400000)
                const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86400000)

                const filtered = [...treatments].filter((t: any) => {
                  if (summarySearch) {
                    const q = summarySearch.toLowerCase()
                    if (!(t.treatment || '').toLowerCase().includes(q) && !(t.dosage || '').toLowerCase().includes(q) && !(t.staff_name || '').toLowerCase().includes(q)) return false
                  }
                  const d = new Date(t.created_at)
                  if (summaryDateFilter === 'today' && d < todayStart) return false
                  if (summaryDateFilter === 'yesterday' && (d < yesterdayStart || d >= todayStart)) return false
                  if (summaryDateFilter === 'this_week' && d < weekStart) return false
                  if (summaryDateFilter === 'custom_date' && summaryDateFrom) {
                    const from = new Date(summaryDateFrom)
                    if (d < from || d >= new Date(from.getTime() + 86400000)) return false
                  }
                  if (summaryDateFilter === 'custom_range' && summaryDateFrom && summaryDateTo) {
                    if (d < new Date(summaryDateFrom) || d > new Date(summaryDateTo + 'T23:59:59')) return false
                  }
                  return true
                }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

                const totalDosesGiven = filtered.reduce((sum: number, t: any) => sum + getTreatmentDoses(t.id).filter((d: any) => d.status === 'administered').length, 0)

                return (
                  <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
                        <p className="text-lg font-bold text-emerald-700">{filtered.filter((t: any) => {
                          const ds = getTreatmentDoses(t.id)
                          return t.status === 'active' && !(ds.length > 0 && ds.every((d: any) => d.status === 'administered' || d.status === 'skipped'))
                        }).length}</p>
                        <p className="text-xs text-emerald-600">Active</p>
                      </div>
                      <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
                        <p className="text-lg font-bold text-blue-700">{filtered.filter((t: any) => {
                          const doses = getTreatmentDoses(t.id)
                          return doses.length > 0 && doses.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                        }).length}</p>
                        <p className="text-xs text-blue-600">Completed</p>
                      </div>
                      <div className="bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                        <p className="text-lg font-bold text-red-700">{filtered.filter((t: any) => t.status === 'ended').length}</p>
                        <p className="text-xs text-red-600">Ended</p>
                      </div>
                      <div className="bg-purple-50 rounded-xl px-4 py-3 border border-purple-100">
                        <p className="text-lg font-bold text-purple-700">{totalDosesGiven}</p>
                        <p className="text-xs text-purple-600">Doses Given</p>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
                              <th className="text-left px-3 py-2.5 font-medium">Treatment</th>
                              <th className="text-left px-3 py-2.5 font-medium">Dosage</th>
                              <th className="text-left px-3 py-2.5 font-medium">Route</th>
                              <th className="text-left px-3 py-2.5 font-medium">Frequency</th>
                              <th className="text-left px-3 py-2.5 font-medium">Nurse</th>
                              <th className="text-left px-3 py-2.5 font-medium">Status</th>
                              <th className="text-left px-3 py-2.5 font-medium">Started</th>
                              <th className="text-left px-3 py-2.5 font-medium">Ended</th>
                              <th className="text-left px-3 py-2.5 font-medium">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.slice((summaryPage - 1) * TREATMENT_PER_PAGE, summaryPage * TREATMENT_PER_PAGE).map((t: any) => {
                              const doses = getTreatmentDoses(t.id)
                              const allDone = doses.length > 0 && doses.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                              const displayStatus = allDone ? 'completed' : t.status
                              const administeredTimes = doses.filter((d: any) => d.status === 'administered').map((d: any) => to12Hour(d.scheduled_time?.slice(0, 5)))
                              const freqText = t.frequency ? (administeredTimes.length > 0 ? `${t.frequency} (${administeredTimes.join(', ')})` : t.frequency) : (administeredTimes.length > 0 ? administeredTimes.join(', ') : '—')
                              return (
                                <tr key={t.id}
                                  onClick={() => { setDoseDetail({ type: 'treatment', data: t }) }}
                                  className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${displayStatus === 'ended' ? 'bg-red-50/30' : ''}`}>
                                  <td className="px-3 py-3 font-medium text-slate-800">{t.treatment}</td>
                                  <td className="px-3 py-3 text-slate-600">{t.dosage || '—'}</td>
                                  <td className="px-3 py-3 text-slate-600">{t.route || '—'}</td>
                                  <td className="px-3 py-3 text-xs text-slate-600">{freqText}</td>
                                  <td className="px-3 py-3 text-slate-600">{t.staff_name || '—'}</td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-medium ${displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : displayStatus === 'completed' ? 'bg-blue-100 text-blue-700' : displayStatus === 'ended' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                                      {displayStatus === 'active' ? 'Active' : displayStatus === 'completed' ? 'Completed' : displayStatus === 'ended' ? 'Ended' : 'Expired'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-3 py-3 text-xs text-slate-500">{t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                  <td className="px-3 py-3 text-xs text-slate-500">{t.end_reason || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Pagination page={summaryPage} totalPages={Math.max(1, Math.ceil(filtered.length / TREATMENT_PER_PAGE))} onChange={setSummaryPage} />
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Fluid Balance Tab */}
      {activeSection === 'fluid_balance' && (
        <div className="space-y-4">

          {/* Sessions list */}
          {fluidSessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <Droplets size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500 mb-4">No fluid balance sessions yet</p>
              {!isDoctor && (
                <button onClick={async () => {
                  if (!patientId) return
                  setCreatingSession(true)
                  try {
                    const res = await api.post('/fluid-sessions', { patient_id: patientId, staff_id: currentUser?.id })
                    setFluidSessions((prev) => [res.data, ...prev])
                    setActiveSession(res.data.id)
                  } catch {} finally { setCreatingSession(false) }
                }} disabled={creatingSession}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                  {creatingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New Session (Day)
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{fluidSessions.length} session{fluidSessions.length !== 1 ? 's' : ''}</p>
                {!isDoctor && (
                  <button onClick={async () => {
                    if (!patientId) return
                    setCreatingSession(true)
                    try {
                      const res = await api.post('/fluid-sessions', { patient_id: patientId, staff_id: currentUser?.id })
                      setFluidSessions((prev) => [res.data, ...prev])
                      setActiveSession(res.data.id)
                    } catch {} finally { setCreatingSession(false) }
                  }} disabled={creatingSession}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                    {creatingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New Session (Day)
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {fluidSessions.map((sess) => {
                  const sessEntries = fluidBalance.filter((f) => f.session_id === sess.id)
                  const totalIntake = sessEntries.reduce((s, f) => s + Number(f.intake_ml), 0)
                  const totalOutput = sessEntries.reduce((s, f) => s + Number(f.output_ml), 0)
                  const isActive = activeSession === sess.id
                  return (
                    <div key={sess.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button onClick={() => setActiveSession(isActive ? null : sess.id)}
                        className="w-full px-5 py-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors flex-wrap">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <Droplets size={16} className="text-primary flex-shrink-0" />
                          <span className="text-sm font-semibold text-slate-800">{new Date(sess.session_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-medium flex-shrink-0">{sessEntries.length} entries</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
                          {sess.staff_name && <span className="text-slate-400">by <strong>{sess.staff_name}</strong></span>}
                          <span className={`font-semibold ${totalIntake - totalOutput >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            Net: {(totalIntake - totalOutput).toFixed(0)} mL
                          </span>
                        </div>
                      </button>

                      {isActive && (
                        <div className="border-t border-slate-100 p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div onClick={() => { setActiveSession(sess.id); setFluidDetail('intake'); setFluidEditMode(false); setShowFluidDetailModal(true) }} className="bg-blue-50 rounded-xl p-3 text-center cursor-pointer hover:bg-blue-100 transition-colors">
                              <p className="text-xs text-blue-500 font-medium">Intake</p>
                              <p className="text-lg font-bold text-blue-700">{totalIntake.toFixed(0)} mL</p>
                            </div>
                            <div onClick={() => { setActiveSession(sess.id); setFluidDetail('output'); setFluidEditMode(false); setShowFluidDetailModal(true) }} className="bg-amber-50 rounded-xl p-3 text-center cursor-pointer hover:bg-amber-100 transition-colors">
                              <p className="text-xs text-amber-500 font-medium">Output</p>
                              <p className="text-lg font-bold text-amber-700">{totalOutput.toFixed(0)} mL</p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3 text-center">
                              <p className="text-xs text-emerald-500 font-medium">Net</p>
                              <p className={`text-lg font-bold ${totalIntake - totalOutput >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{(totalIntake - totalOutput).toFixed(0)} mL</p>
                            </div>
                          </div>

                          {!isDoctor && (
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => { setActiveSession(sess.id); setFluidForm({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' }); setFluidRoutes([]); setFluidOtherRoute(''); setFluidSearch(''); setIsFluidOther(false); setShowFluidModal(true) }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"><Plus size={14} /> Add Intake</button>
                              <button onClick={() => { setActiveSession(sess.id); setFluidDetail('intake'); setFluidEditMode(false); setShowFluidDetailModal(true) }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors"><Droplets size={14} /> Intake Detail</button>
                              <button onClick={() => { setActiveSession(sess.id); setFluidDetail('output'); setFluidEditMode(false); setShowFluidDetailModal(true) }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors"><Droplets size={14} /> Output Detail</button>
                              <button onClick={() => { setActiveSession(sess.id); setShowOutputModal(true); setOutputForm({ urine: '', vomit: '', aspirate: '', bowels: '', blood_loss: '' }) }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"><Plus size={14} /> Add Output</button>
                            </div>
                          )}

                          {sessEntries.length > 0 ? (
                            <div className="space-y-3 pt-2">
                              {/* Intake Entries */}
                              <div>
                                <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5"><Droplets size={13} /> Intake Entries ({sessEntries.filter((e: any) => Number(e.intake_ml) > 0).length})</p>
                                {sessEntries.filter((e: any) => Number(e.intake_ml) > 0).length > 0 ? (
                                  <div className="space-y-1.5">
                                    {sessEntries.filter((e: any) => Number(e.intake_ml) > 0).sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 5).map((f: any) => {
                                      const details = f.details ? (typeof f.details === 'string' ? JSON.parse(f.details) : f.details) : null
                                      const intakeRoutes = details?.intake || {}
                                      return (
                                        <div key={f.id} onClick={() => { setSelectedEntry(f); setShowEntryModal(true) }} className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
                                          <div className="flex items-center gap-1 flex-wrap text-[11px] text-slate-500 mb-1">
                                            <span>{new Date(f.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                            {f.staff_name && <span>by {f.staff_name}</span>}
                                          </div>
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <p className="text-xs font-semibold text-blue-700">Intake: {Number(f.intake_ml).toFixed(0)} mL</p>
                                            {f.fluid_type && <span className="text-[10px] text-blue-600 font-medium truncate max-w-[120px] sm:max-w-[160px]">{f.fluid_type}</span>}
                                          </div>
                                          {Object.keys(intakeRoutes).length > 0 ? (
                                            <div className="text-[10px] text-blue-500 mt-0.5 space-y-0.5">
                                              {Object.entries(intakeRoutes).map(([r, ml]) => (
                                                <div key={r} className="flex gap-2"><span className="capitalize">{r}:</span><span className="font-medium">{String(ml)} mL</span></div>
                                              ))}
                                            </div>
                                          ) : f.route ? (
                                            <div className="text-[10px] text-blue-400 mt-0.5">Route: <span className="font-medium capitalize">{f.route}</span></div>
                                          ) : null}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : <p className="text-xs text-blue-400 italic">No intake recorded this session</p>}
                              </div>

                              {/* Output Entries */}
                              <div>
                                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5"><Droplets size={13} /> Output Entries ({sessEntries.filter((e: any) => Number(e.output_ml) > 0).length})</p>
                                {sessEntries.filter((e: any) => Number(e.output_ml) > 0).length > 0 ? (
                                  <div className="space-y-1.5">
                                    {sessEntries.filter((e: any) => Number(e.output_ml) > 0).sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 5).map((f: any) => {
                                      const details = f.details ? (typeof f.details === 'string' ? JSON.parse(f.details) : f.details) : null
                                      const outputTypes = details?.output || {}
                                      return (
                                        <div key={f.id} onClick={() => { setSelectedEntry(f); setShowEntryModal(true) }} className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors">
                                          <div className="flex items-center gap-1 flex-wrap text-[11px] text-slate-500 mb-1">
                                            <span>{new Date(f.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                            {f.staff_name && <span>by {f.staff_name}</span>}
                                          </div>
                                          <p className="text-xs font-semibold text-amber-700">Output: {Number(f.output_ml).toFixed(0)} mL</p>
                                          {Object.keys(outputTypes).length > 0 && (
                                            <div className="text-[10px] text-amber-500 mt-0.5 space-y-0.5">
                                              {Object.entries(outputTypes).map(([t, ml]) => (
                                                <div key={t} className="flex gap-2 text-[10px] text-amber-500"><span className="capitalize">{t.replace('_', ' ')}:</span><span className="font-medium">{String(ml)}</span></div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : <p className="text-xs text-amber-400 italic">No output recorded this session</p>}
                              </div>
                              {sessEntries.length > 10 && <p className="text-[11px] text-slate-400 text-center">+ {sessEntries.length - 10} more entries</p>}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic text-center py-3">No entries yet. Click "Add Intake" or "Add Output" to record.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Fluid Balance Modal — simple */}
      {showFluidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!fluidSubmitting) setShowFluidModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Droplets size={18} className="text-blue-500" /> Add Fluid Entry</h2>
              <button onClick={() => setShowFluidModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-slate-500 mb-1">Fluid Type</label>
                {isFluidOther ? (
                  <input type="text" placeholder="Type custom fluid name..." value={fluidForm.fluid_type}
                    onChange={(e) => setFluidForm((p) => ({ ...p, fluid_type: e.target.value }))}
                    onBlur={() => { if (!fluidForm.fluid_type) setIsFluidOther(false) }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" autoFocus />
                ) : (
                  <>
                    <input type="text" placeholder="Search or select fluid type..." value={fluidSearch || fluidForm.fluid_type}
                      onChange={(e) => { setFluidSearch(e.target.value); setFluidForm((p) => ({ ...p, fluid_type: '' })); setShowFluidDropdown(true) }}
                      onFocus={() => setShowFluidDropdown(true)}
                      onBlur={() => setTimeout(() => setShowFluidDropdown(false), 200)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    {showFluidDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                        {COMMON_FLUIDS.filter((f) => f !== 'Other' && f.toLowerCase().includes((fluidSearch || '').toLowerCase())).slice(0, 15).map((fluid) => (
                          <button key={fluid} type="button" onMouseDown={() => { setFluidForm((p) => ({ ...p, fluid_type: fluid })); setFluidSearch(''); setShowFluidDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{fluid}</button>
                        ))}
                        {COMMON_FLUIDS.filter((f) => f !== 'Other' && f.toLowerCase().includes((fluidSearch || '').toLowerCase())).length === 0 && (
                          <button type="button" onMouseDown={() => { setIsFluidOther(true); setFluidForm((p) => ({ ...p, fluid_type: '' })); setShowFluidDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-100">+ Other — type custom fluid name</button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Intake (mL)</label>
                <input type="number" placeholder="0" value={fluidForm.intake_ml}
                  onChange={(e) => setFluidForm((p) => ({ ...p, intake_ml: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Route(s)</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['IV', 'Oral', 'Foley', 'Parenteral'].map((r) => {
                    const isSelected = fluidRoutes.includes(r)
                    return (
                      <button key={r} type="button" onClick={() => setFluidRoutes((prev) => prev.includes(r) ? prev.filter((v) => v !== r) : [...prev, r])}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${isSelected ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>{r}</button>
                    )
                  })}
                  {(() => {
                    const isOther = fluidRoutes.includes('Other')
                    return (
                      <button type="button" onClick={() => { if (isOther) { setFluidRoutes((prev) => prev.filter((v) => v !== 'Other')); setFluidOtherRoute('') } else setFluidRoutes((prev) => [...prev, 'Other']) }}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${isOther ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>Other</button>
                    )
                  })()}
                </div>
                {fluidRoutes.includes('Other') && (
                  <input type="text" placeholder="Specify other route..." value={fluidOtherRoute}
                    onChange={(e) => setFluidOtherRoute(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={2} placeholder="Optional" value={fluidForm.notes}
                  onChange={(e) => setFluidForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowFluidModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!patientId || !activeSession) return
                setFluidSubmitting(true)
                try {
                  const activeRoutes = [...fluidRoutes, ...(fluidOtherRoute.trim() ? [fluidOtherRoute.trim()] : [])]
                  const routeStr = activeRoutes.join(', ')
                  const intakeAmount = Number(fluidForm.intake_ml) || 0
                  const intakeDetails: Record<string, number> = {}
                  if (activeRoutes.length > 0 && intakeAmount > 0) {
                    const perRoute = intakeAmount / activeRoutes.length
                    activeRoutes.forEach(r => { intakeDetails[r.toLowerCase()] = perRoute })
                  }
                  await api.post('/fluid-balance', {
                    patient_id: patientId, staff_id: currentUser?.id,
                    intake_ml: intakeAmount, output_ml: 0, notes: fluidForm.notes || null,
                    route: routeStr || null, fluid_type: fluidForm.fluid_type || null,
                    session_id: activeSession, details: { intake: intakeDetails, output: {} },
                  })
                  setShowFluidModal(false)
                  setFluidForm({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' })
                  setFluidRoutes([]); setFluidOtherRoute(''); setFluidSearch(''); setIsFluidOther(false)
                  const [fbRes, sessRes] = await Promise.all([
                    api.get(`/fluid-balance?patient_id=${patientId}`).catch(() => ({ data: [] })),
                    api.get(`/fluid-sessions?patient_id=${patientId}`).catch(() => ({ data: [] })),
                  ])
                  setFluidBalance(fbRes.data || [])
                  setFluidSessions(sessRes.data || [])
                } catch {} finally { setFluidSubmitting(false) }
              }} disabled={fluidSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {fluidSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />} Save Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Fluid Detail Modal — View & Edit */}
      {showFluidDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!fluidSubmitting) setShowFluidDetailModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Droplets size={18} className={fluidDetail === 'intake' ? 'text-blue-500' : 'text-amber-500'} />
                {fluidDetail === 'intake' ? 'Intake Breakdown' : 'Output Breakdown'}
                {!fluidEditMode && <span className="text-xs font-normal text-slate-400 ml-2">(view only)</span>}
              </h2>
              <button onClick={() => setShowFluidDetailModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {fluidEditMode ? (
                fluidDetail === 'intake' ? (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 mb-3">Enter intake amounts per route</p>
                    <div className="space-y-3">
                      {['IV', 'Oral', 'Foley', 'Parenteral', 'Other'].map((route) => (
                        <div key={route}>
                          <label className="block text-xs font-medium text-slate-500 mb-1">{route} (mL)</label>
                          <input type="number" min={0} placeholder="0" value={(fluidForm as any)[`intake_${route.toLowerCase()}`] || ''}
                            onChange={(e) => setFluidForm((p: any) => ({ ...p, [`intake_${route.toLowerCase()}`]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                      ))}
                      <div className="p-3 bg-blue-50 rounded-xl text-center">
                        <span className="text-sm text-blue-700 font-semibold">Total: {(
                          ['oral', 'iv', 'foley', 'parenteral', 'other'].reduce((s, r) => s + Number((fluidForm as any)[`intake_${r}`] || 0), 0)
                        ).toFixed(0)} mL</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-3">Enter output amounts per type</p>
                    <div className="space-y-3">
                      {['Urine', 'Vomit', 'Aspirate', 'Bowels', 'Blood Loss'].map((type) => {
                        const key = `output_${type.toLowerCase().replace(' ', '_')}`
                        return (
                          <div key={type}>
                            <label className="block text-xs font-medium text-slate-500 mb-1">{type} (mL)</label>
                            <input type="number" min={0} placeholder="0" value={(fluidForm as any)[key] || ''}
                              onChange={(e) => setFluidForm((p: any) => ({ ...p, [key]: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                          </div>
                        )
                      })}
                      <div className="p-3 bg-amber-50 rounded-xl text-center">
                        <span className="text-sm text-amber-700 font-semibold">Total: {(
                          ['urine', 'vomit', 'aspirate', 'bowels', 'blood_loss'].reduce((s, t) => s + Number((fluidForm as any)[`output_${t}`] || 0), 0)
                        ).toFixed(0)} mL</span>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div>
                  {fluidDetail === 'intake' ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Accumulated Intake by Route</p>
                      <div className="space-y-2 bg-blue-50 rounded-xl p-4">
                        {(() => {
                          const totals: Record<string, number> = {}
                          const individualEntries: any[] = []
                          const sessionEntries = activeSession ? fluidBalance.filter((f: any) => f.session_id === activeSession) : fluidBalance
                          sessionEntries.forEach((f: any) => {
                            if (Number(f.intake_ml) <= 0) return
                            individualEntries.push(f)
                            const d = f.details ? (typeof f.details === 'string' ? JSON.parse(f.details) : f.details) : null
                            if (d?.intake) {
                              Object.entries(d.intake).forEach(([r, ml]) => { totals[r] = (totals[r] || 0) + Number(ml) })
                            } else {
                              const routes = f.route ? f.route.split(',').map((r: string) => r.trim().toLowerCase()).filter(Boolean) : ['other']
                              const perRoute = Number(f.intake_ml) / routes.length
                              routes.forEach((r: string) => { totals[r] = (totals[r] || 0) + perRoute })
                            }
                          })
                          const routeEntries = Object.entries(totals)
                          const grandTotal = routeEntries.reduce((s, [, ml]) => s + ml, 0)
                          return (routeEntries.length > 0 || individualEntries.length > 0) ? (
                            <>
                              {individualEntries.length > 0 && (
                                <div className="space-y-2 mb-4">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Entries</p>
                                  {individualEntries.map((f: any) => (
                                    <div key={f.id} className="bg-white rounded-xl p-3 border border-blue-100">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-blue-700">{f.fluid_type || 'Fluid'}</span>
                                        <span className="text-xs font-bold text-blue-700">{Number(f.intake_ml).toFixed(0)} mL</span>
                                      </div>
                                      {f.route && <div className="text-[10px] text-blue-400">Route: <span className="font-medium capitalize">{f.route}</span></div>}
                                      <div className="text-[10px] text-slate-400 mt-1">{new Date(f.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{f.staff_name ? ` by ${f.staff_name}` : ''}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Accumulated by Route</p>
                              <div className="space-y-2 bg-blue-50 rounded-xl p-4">
                                {routeEntries.map(([route, ml]) => (
                                  <div key={route} className="flex justify-between text-sm text-blue-700 border-b border-blue-100 pb-1.5 last:border-0">
                                    <span className="font-medium capitalize">{route}</span>
                                    <span className="font-bold">{ml.toFixed(0)} mL</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-sm text-blue-800 font-bold pt-1 border-t border-blue-200 mt-1">
                                  <span>Total Intake</span>
                                  <span>{grandTotal.toFixed(0)} mL</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-blue-400 italic text-center py-4">No intake recorded this session</p>
                          )
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Accumulated Output by Type</p>
                      <div className="space-y-2 bg-amber-50 rounded-xl p-4">
                        {(() => {
                          const totals: Record<string, number> = {}
                          const sessionEntries = activeSession ? fluidBalance.filter((f: any) => f.session_id === activeSession) : fluidBalance
                          sessionEntries.forEach((f: any) => {
                            const d = f.details ? (typeof f.details === 'string' ? JSON.parse(f.details) : f.details) : null
                            if (d?.output) Object.entries(d.output).forEach(([t, ml]) => { totals[t] = (totals[t] || 0) + Number(ml) })
                          })
                          const outputEntries = Object.entries(totals)
                          const grandTotal = outputEntries.reduce((s, [, ml]) => s + ml, 0)
                          return outputEntries.length > 0 ? (
                            <>
                              {outputEntries.map(([type, ml]) => (
                                <div key={type} className="flex justify-between text-sm text-amber-700 border-b border-amber-100 pb-1.5 last:border-0">
                                  <span className="font-medium capitalize">{type.replace('_', ' ')}</span>
                                  <span className="font-bold">{ml.toFixed(0)} mL</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm text-amber-800 font-bold pt-1 border-t border-amber-200 mt-1">
                                <span>Total Output</span>
                                <span>{grandTotal.toFixed(0)} mL</span>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-amber-400 italic text-center py-4">No output breakdown data recorded</p>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowFluidDetailModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">{fluidEditMode ? 'Cancel' : 'Close'}</button>
              {fluidEditMode && (
                <button onClick={async () => {
                  if (!patientId) return
                  setFluidSubmitting(true)
                  try {
                    const intakeMap: Record<string, number> = {}
                    const outputMap: Record<string, number> = {}
                    let totalIntake = 0, totalOutput = 0
                    ;['oral', 'iv', 'foley', 'parenteral', 'other'].forEach((r) => {
                      const val = Number((fluidForm as any)[`intake_${r}`] || 0)
                      if (val > 0) { intakeMap[r] = val; totalIntake += val }
                    })
                    ;['urine', 'vomit', 'aspirate', 'bowels', 'blood_loss'].forEach((t) => {
                      const val = Number((fluidForm as any)[`output_${t}`] || 0)
                      if (val > 0) { outputMap[t] = val; totalOutput += val }
                    })
                    const details = { intake: intakeMap, output: outputMap }
                    await api.post('/fluid-balance', {
                      patient_id: patientId, staff_id: currentUser?.id,
                      intake_ml: totalIntake, output_ml: totalOutput, notes: null, details,
                    })
                    setShowFluidDetailModal(false)
                    Object.keys(fluidForm).forEach((k: string) => {
                      if (k.startsWith('intake_') || k.startsWith('output_')) (fluidForm as any)[k] = ''
                    })
                    const res = await api.get(`/fluid-balance?patient_id=${patientId}`)
                    setFluidBalance(res.data || [])
                  } catch {} finally { setFluidSubmitting(false) }
                }} disabled={fluidSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                  {fluidSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />} Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Output Modal */}
      {showOutputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!outputSubmitting) setShowOutputModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Droplets size={18} className="text-amber-500" /> Record Output</h2>
              <button onClick={() => setShowOutputModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                {[
                  { key: 'urine', label: 'Urine (mL)' },
                  { key: 'vomit', label: 'Vomit (mL)' },
                  { key: 'aspirate', label: 'Aspirate (mL)' },
                  { key: 'bowels', label: 'Bowels (mL)' },
                  { key: 'blood_loss', label: 'Blood Loss (mL)' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    <input type="number" min={0} placeholder="0" value={(outputForm as any)[f.key] || ''}
                      onChange={(e) => setOutputForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                ))}
                <div className="p-3 bg-amber-50 rounded-xl text-center">
                  <span className="text-sm text-amber-700 font-semibold">
                    Total Output: {(
                      Number(outputForm.urine || 0) + Number(outputForm.vomit || 0) +
                      Number(outputForm.aspirate || 0) + Number(outputForm.bowels || 0) +
                      Number(outputForm.blood_loss || 0)
                    ).toFixed(0)} mL
                  </span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowOutputModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!patientId || !activeSession) return
                setOutputSubmitting(true)
                try {
                  const outputMap: Record<string, number> = {}
                  let totalOutput = 0
                  ;['urine', 'vomit', 'aspirate', 'bowels', 'blood_loss'].forEach((k) => {
                    const val = Number((outputForm as any)[k] || 0)
                    if (val > 0) { outputMap[k] = val; totalOutput += val }
                  })
                  if (totalOutput > 0) {
                    await api.post('/fluid-balance', {
                      patient_id: patientId, staff_id: currentUser?.id,
                      intake_ml: 0, output_ml: totalOutput, notes: null,
                      details: { intake: {}, output: outputMap },
                      session_id: activeSession,
                    })
                  }
                  setShowOutputModal(false)
                  setOutputForm({ urine: '', vomit: '', aspirate: '', bowels: '', blood_loss: '' })
                  const [fbRes, sessRes] = await Promise.all([
                    api.get(`/fluid-balance?patient_id=${patientId}`).catch(() => ({ data: [] })),
                    api.get(`/fluid-sessions?patient_id=${patientId}`).catch(() => ({ data: [] })),
                  ])
                  setFluidBalance(fbRes.data || [])
                  setFluidSessions(sessRes.data || [])
                } catch {} finally { setOutputSubmitting(false) }
              }} disabled={outputSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-transform disabled:opacity-50">
                {outputSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />} Save Output
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Clinical Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!noteSubmitting) setShowNoteModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Add Clinical Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <select value={noteType} onChange={(e) => setNoteType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                <option value="general">General Note</option>
                <option value="observation">Observation</option>
                <option value="handover">Handover</option>
                <option value="incident">Incident Report</option>
                <option value="care_plan">Care Plan Update</option>
              </select>
              <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-2">
                Note
                <VoiceInput value={noteContent} onChange={(val) => setNoteContent(val)} />
              </label>
              <textarea rows={5} placeholder="Type your clinical note..." value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowNoteModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!noteContent.trim() || !patientId) return
                setNoteSubmitting(true)
                try {
                  await api.post('/nurse-notes', { patient_id: patientId, staff_id: currentUser?.id, note_type: noteType, content: noteContent })
                  setShowNoteModal(false)
                  setNoteContent('')
                  const res = await api.get(`/nurse-notes?patient_id=${patientId}`)
                  setNurseNotes(res.data || [])
                } catch {} finally { setNoteSubmitting(false) }
              }} disabled={noteSubmitting || !noteContent.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {noteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Doctor Note Modal */}
      {showDoctorNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!doctorNoteSubmitting) setShowDoctorNoteModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Stethoscope size={18} className="text-primary" /> New Clinical Note</h2>
              <button onClick={() => setShowDoctorNoteModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <select value={doctorNoteType} onChange={(e) => setDoctorNoteType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                <option value="clinical">Clinical Note</option>
                <option value="progress">Progress Note</option>
                <option value="summary">Discharge Summary</option>
                <option value="referral">Referral Note</option>
              </select>
              <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-2">
                Note
                <VoiceInput value={doctorNoteContent} onChange={(val) => setDoctorNoteContent(val)} />
              </label>
              <textarea rows={6} placeholder="Write your clinical note..." value={doctorNoteContent}
                onChange={(e) => setDoctorNoteContent(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowDoctorNoteModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!doctorNoteContent.trim() || !patientId) return
                setDoctorNoteSubmitting(true)
                try {
                  await api.post('/nurse-notes', { patient_id: patientId, staff_id: currentUser?.id, note_type: 'doctor', content: doctorNoteContent })
                  setShowDoctorNoteModal(false)
                  setDoctorNoteContent('')
                  const res = await api.get(`/nurse-notes?patient_id=${patientId}`)
                  setNurseNotes(res.data || [])
                } catch {} finally { setDoctorNoteSubmitting(false) }
              }} disabled={doctorNoteSubmitting || !doctorNoteContent.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {doctorNoteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Treatment Modal */}
      {showTreatmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!treatmentSubmitting) setShowTreatmentModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Add Treatment</h2>
              <button onClick={() => setShowTreatmentModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Treatment <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  <input type="text" placeholder="Search drug or type custom..." value={treatmentForm.treatment}
                    onChange={(e) => { setTreatmentForm((p) => ({ ...p, treatment: e.target.value })); setShowTreatmentDropdown(true) }}
                    onFocus={() => setShowTreatmentDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTreatmentDropdown(false), 200)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  {showTreatmentDropdown && treatmentForm.treatment.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                      {treatmentSuggestions.filter((d) => d.toLowerCase().includes(treatmentForm.treatment.toLowerCase())).slice(0, 10).map((drug) => (
                        <button key={drug} type="button" onMouseDown={() => { setTreatmentForm((p) => ({ ...p, treatment: drug })); setShowTreatmentDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center gap-2"><Pill size={14} className="text-blue-500" /> {drug}</button>
                      ))}
                      <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">No match? The typed name will be saved as-is.</div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Dosage <span className="text-rose-500">*</span></label>
                <input type="text" placeholder="e.g. 500mg" value={treatmentForm.dosage}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, dosage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Route(s) <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Oral', 'IV', 'IM', 'SC', 'Topical', 'Other'].map((r) => {
                    const isSelected = treatmentRoute.includes(r)
                    return (
                      <button key={r} type="button" onClick={() => setTreatmentRoute((prev) => prev.includes(r) ? prev.filter((v) => v !== r) : [...prev, r])}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${isSelected ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>{r}</button>
                    )
                  })}
                </div>
                {treatmentRoute.includes('Other') && (
                  <input type="text" placeholder="Specify other route..." value={treatmentOtherRoute}
                    onChange={(e) => setTreatmentOtherRoute(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
                <input type="text" placeholder="e.g. 8 hourly, PRN" value={treatmentForm.frequency}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, frequency: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Administration Times</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {[
                    { label: '6 AM', value: '6:00' }, { label: '8 AM', value: '8:00' },
                    { label: '10 AM', value: '10:00' }, { label: '12 PM', value: '12:00' },
                    { label: '2 PM', value: '14:00' }, { label: '4 PM', value: '16:00' },
                    { label: '6 PM', value: '18:00' }, { label: '8 PM', value: '20:00' },
                    { label: '10 PM', value: '22:00' }, { label: '12 AM', value: '0:00' },
                    { label: '2 AM', value: '2:00' }, { label: '4 AM', value: '4:00' },
                  ].map((t) => {
                    const isSelected = selectedTimes.includes(t.value)
                    return (
                      <button key={t.value} type="button" onClick={() => setSelectedTimes((prev) => prev.includes(t.value) ? prev.filter((v) => v !== t.value) : [...prev, t.value].sort())}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                          isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                        }`}>{t.label}</button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={2} placeholder="Optional notes" value={treatmentForm.notes}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowTreatmentModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!treatmentForm.treatment.trim() || !patientId || !treatmentForm.dosage.trim() || !treatmentForm.frequency.trim() || selectedTimes.length === 0) return
                const entered = treatmentForm.treatment.trim().toLowerCase()
                const existingTx = treatments.find((t: any) => {
                  const txName = t.treatment.toLowerCase()
                  if (txName === entered) return true
                  if (`${txName} ${treatmentForm.dosage}`.toLowerCase() === entered) return true
                  if (txName === `${entered} ${treatmentForm.dosage}`.toLowerCase()) return true
                  if (entered.length > 3 && txName.startsWith(entered + ' ')) return true
                  return false
                })
                if (existingTx && (sessionsMap[existingTx.id] || []).length > 0) {
                  setAddTxChoice({ treatment_id: existingTx.id, name: existingTx.treatment })
                  return
                }
                performAddTreatment()
              }} disabled={treatmentSubmitting || !treatmentForm.treatment.trim() || !treatmentForm.dosage.trim() || !treatmentForm.frequency.trim() || selectedTimes.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {treatmentSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Pill size={14} />} Save Treatment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Treatment Choice Modal */}
      {addTxChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAddTxChoice(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="text-center px-6 pt-6 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                <Pill size={32} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">{addTxChoice.name}</h2>
              <p className="text-sm text-slate-500 mt-1">This treatment already has existing courses. How would you like to proceed?</p>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <button onClick={async () => {
                setShowTreatmentModal(false)
                setAddTxChoice(null)
                const timesStr = selectedTimes.join(',')
                const routeStr = [...treatmentRoute, ...(treatmentOtherRoute.trim() ? [treatmentOtherRoute.trim()] : [])].join(', ')
                setTreatmentSubmitting(true)
                try {
                  // Reactivate parent treatment if it was ended/completed
                  await api.put(`/treatments/${addTxChoice.treatment_id}`, { status: 'active' }).catch(() => {})
                  setTreatments((prev) => prev.map((x: any) => x.id === addTxChoice.treatment_id ? { ...x, status: 'active' } : x))
                  await api.post('/treatment-sessions', {
                    treatment_id: addTxChoice.treatment_id,
                    staff_id: currentUser?.id,
                    dosage: treatmentForm.dosage || null,
                    route: routeStr || null,
                    frequency: treatmentForm.frequency || null,
                    times: timesStr || undefined,
                    notes: treatmentForm.notes || null,
                  })
                  setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
                  setSelectedTimes([]); setTreatmentRoute([]); setTreatmentOtherRoute('')
                  const sessRes = await api.get(`/treatment-sessions?treatment_id=${addTxChoice.treatment_id}`)
                  setSessionsMap((prev) => ({ ...prev, [addTxChoice.treatment_id]: sessRes.data || [] }))
                  const doseMapNew: Record<string, any[]> = { ...doseMap }
                  for (const s of (sessRes.data || [])) { try { const doseRes = await api.get(`/treatment-doses?session_id=${s.id}`); doseMapNew[s.id] = doseRes.data || [] } catch { doseMapNew[s.id] = [] } }
                  setDoseMap(doseMapNew)
                  const existingTxName = treatments.find((t: any) => t.id === addTxChoice.treatment_id)?.treatment || addTxChoice.name
                  if (!expandedTreatments[existingTxName]) setExpandedTreatments((prev) => ({ ...prev, [existingTxName]: true }))
                } catch {} finally { setTreatmentSubmitting(false) }
              }} disabled={treatmentSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-all">
                <Plus size={16} /> Add to Existing Courses
              </button>
              <button onClick={async () => {
                setAddTxChoice(null)
                await performAddTreatment()
              }} disabled={treatmentSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all">
                <Pill size={16} /> Start New Cycle
              </button>
              <button onClick={() => setAddTxChoice(null)}
                className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Drug End Choice Modal */}
      {drugEndChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDrugEndChoice(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const sessions = sessionsMap[drugEndChoice.treatmentId] || []
              const allChildrenComplete = sessions.length > 0 && sessions.every((s: any) => {
                const ds = doseMap[s.id] || []
                return ds.length > 0 && ds.every((d: any) => d.status === 'administered' || d.status === 'skipped')
              })
              return (
                <>
                  <div className="text-center px-6 pt-6 pb-4">
                    <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${allChildrenComplete ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      {allChildrenComplete ? <CheckCircle size={32} className="text-emerald-500" /> : <AlertTriangle size={32} className="text-amber-500" />}
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800">{drugEndChoice.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {allChildrenComplete
                        ? 'All courses are complete with all doses marked. You can mark this drug as completed.'
                        : 'Some courses still have unmarked doses. What would you like to do?'
                      }
                    </p>
                  </div>
                  <div className="px-6 pb-4 space-y-3">
                    {allChildrenComplete ? (
                      <button onClick={async () => {
                        const { treatmentId } = drugEndChoice
                        setDrugEndChoice(null)
                        await api.put(`/treatments/${treatmentId}`, { status: 'completed', end_date: new Date().toISOString(), ended_by: currentUser?.id })
                        setTreatments((prev) => prev.map((x: any) => x.id === treatmentId ? { ...x, status: 'completed', end_date: new Date().toISOString(), ended_by_name: currentUser?.name } : x))
                        const activeSess = Object.entries(sessionsMap).filter(([tid]) => tid === treatmentId).flatMap(([, v]) => v).filter((s: any) => s.status === 'active')
                        for (const s of activeSess) {
                          await api.put(`/treatment-sessions/${s.id}`, { status: 'completed', end_date: new Date().toISOString(), ended_by: currentUser?.id }).catch(() => {})
                        }
                        setSessionsMap((prev) => {
                          const next = { ...prev }
                          if (next[treatmentId]) {
                            next[treatmentId] = next[treatmentId].map((s: any) => s.status === 'active' ? { ...s, status: 'completed', end_date: new Date().toISOString(), ended_by_name: currentUser?.name } : s)
                          }
                          return next
                        })
                      }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all">
                        <CheckCircle size={16} /> Mark as Completed
                      </button>
                    ) : (
                      <button onClick={() => {
                        const { treatmentId, name } = drugEndChoice
                        setDrugEndChoice(null)
                        setEndTreatment({ treatmentId, treatmentName: name })
                        setEndIsDrug(true)
                        setEndReason('')
                      }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-all">
                        <AlertTriangle size={16} /> End Treatment
                      </button>
                    )}
                    <button onClick={() => setDrugEndChoice(null)}
                      className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Add Course Modal */}
      {showAddSessionModal && addSessionTreatment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!treatmentSubmitting) setShowAddSessionModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">New Course — {addSessionTreatment.name}</h2>
              <button onClick={() => setShowAddSessionModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Dosage</label>
                <input type="text" placeholder="e.g. 500mg" value={treatmentForm.dosage}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, dosage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Route(s)</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Oral', 'IV', 'IM', 'SC', 'Topical', 'Other'].map((r) => {
                    const isSelected = treatmentRoute.includes(r)
                    return (
                      <button key={r} type="button" onClick={() => setTreatmentRoute((prev) => prev.includes(r) ? prev.filter((v) => v !== r) : [...prev, r])}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${isSelected ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>{r}</button>
                    )
                  })}
                </div>
                {treatmentRoute.includes('Other') && (
                  <input type="text" placeholder="Specify other route..." value={treatmentOtherRoute}
                    onChange={(e) => setTreatmentOtherRoute(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Frequency <span className="text-rose-500">*</span></label>
                <input type="text" placeholder="e.g. 8 hourly" value={treatmentForm.frequency}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, frequency: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Administration Times <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {[
                    { label: '6 AM', value: '6:00' }, { label: '8 AM', value: '8:00' },
                    { label: '10 AM', value: '10:00' }, { label: '12 PM', value: '12:00' },
                    { label: '2 PM', value: '14:00' }, { label: '4 PM', value: '16:00' },
                    { label: '6 PM', value: '18:00' }, { label: '8 PM', value: '20:00' },
                    { label: '10 PM', value: '22:00' }, { label: '12 AM', value: '0:00' },
                    { label: '2 AM', value: '2:00' }, { label: '4 AM', value: '4:00' },
                  ].map((t) => {
                    const isSelected = selectedTimes.includes(t.value)
                    return (
                      <button key={t.value} type="button" onClick={() => setSelectedTimes((prev) => prev.includes(t.value) ? prev.filter((v) => v !== t.value) : [...prev, t.value].sort())}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                          isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                        }`}>{t.label}</button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={2} placeholder="Reason for change, observations..." value={treatmentForm.notes}
                  onChange={(e) => setTreatmentForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowAddSessionModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => {
                if (!patientId || !addSessionTreatment || !treatmentForm.dosage.trim() || !treatmentForm.frequency.trim() || selectedTimes.length === 0) return
                setTreatmentSubmitting(true)
                try {
                  const timesStr = selectedTimes.join(',')
                  const routeStr = [...treatmentRoute, ...(treatmentOtherRoute.trim() ? [treatmentOtherRoute.trim()] : [])].join(', ')
                  await api.post('/treatment-sessions', {
                    treatment_id: addSessionTreatment.treatment_id,
                    staff_id: currentUser?.id,
                    dosage: treatmentForm.dosage || null,
                    route: routeStr || null,
                    frequency: treatmentForm.frequency || null,
                    times: timesStr || undefined,
                    notes: treatmentForm.notes || null,
                  })
                  setShowAddSessionModal(false)
                  setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
                  setSelectedTimes([])
                  setTreatmentRoute([])
                  setTreatmentOtherRoute('')
                  const sessRes = await api.get(`/treatment-sessions?treatment_id=${addSessionTreatment.treatment_id}`)
                  setSessionsMap((prev) => ({ ...prev, [addSessionTreatment.treatment_id]: sessRes.data || [] }))
                  const doseMapNew: Record<string, any[]> = { ...doseMap }
                  for (const s of (sessRes.data || [])) {
                    try { const doseRes = await api.get(`/treatment-doses?session_id=${s.id}`); doseMapNew[s.id] = doseRes.data || [] } catch { doseMapNew[s.id] = [] }
                  }
                  setDoseMap(doseMapNew)
                  if (!expandedTreatments[addSessionTreatment.name]) {
                    setExpandedTreatments((prev) => ({ ...prev, [addSessionTreatment.name]: true }))
                  }
                } catch {} finally { setTreatmentSubmitting(false) }
              }} disabled={treatmentSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {treatmentSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vitals Entry Modal */}
      {showVitalsForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!vitalsSubmitting) setShowVitalsForm(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-primary" /> Record Vitals</h2>
              <button onClick={() => setShowVitalsForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
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
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    <input type="number" step="any" placeholder={f.placeholder} value={(vitalsForm as any)[f.key]}
                      onChange={(e) => setVitalsForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                ))}
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Triage Priority</label>
                  <div className="flex gap-2">
                    {(['red', 'yellow', 'green'] as const).map((p) => (
                      <button key={p} onClick={() => setVitalsForm((prev) => ({ ...prev, triage_priority: p }))}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                          vitalsForm.triage_priority === p
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
                  <VoiceInput value={vitalsForm.nursing_notes} onChange={(val) => setVitalsForm((p) => ({ ...p, nursing_notes: val }))} />
                </label>
                <textarea rows={3} placeholder="Observations, chief complaint..." value={vitalsForm.nursing_notes}
                  onChange={(e) => setVitalsForm((p) => ({ ...p, nursing_notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowVitalsForm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleVitalsSubmit} disabled={vitalsSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {vitalsSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                {vitalsSubmitting ? 'Saving...' : 'Save Vitals'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dose Confirmation Modal */}
      {confirmDose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDose(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="text-center px-6 pt-6 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                <Pill size={32} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">{confirmDose.treatmentName}</h2>
              <p className="text-sm text-slate-500 mt-1">Scheduled for <strong>{confirmDose.time}</strong></p>
            </div>
            <div className="px-6 pb-4 flex flex-col gap-2">
              <button onClick={() => {
                api.put(`/treatment-doses/${confirmDose.doseId}/administer`, { administered_by: currentUser?.id }).then((res) => {
                  const updated = doseMap[confirmDose.treatmentId]?.map((x: any) => x.id === confirmDose.doseId ? { ...x, ...res.data, status: 'administered' } : x)
                  setDoseMap((prev) => ({ ...prev, [confirmDose.treatmentId]: updated }))
                  autoCompleteTreatment(confirmDose.treatmentId, updated || [])
                }).catch(() => {})
                setConfirmDose(null)
              }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all">
                <CheckCircle size={16} /> Mark as Given
              </button>
              <button onClick={() => {
                setSkipReason({ doseId: confirmDose.doseId, treatmentId: confirmDose.treatmentId })
                setSkipReasonText('')
                setConfirmDose(null)
              }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-all">
                <XCircle size={16} /> Skip Dose — Patient Not Given
              </button>
              <button onClick={() => setConfirmDose(null)}
                className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* End Treatment Confirmation Modal */}
      {endTreatment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setEndTreatment(null); setEndIsDrug(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="text-center px-6 pt-6 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">{endIsDrug ? 'End Treatment' : 'End Course'}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {endIsDrug
                  ? <>Stop all courses of <strong className="text-slate-700">{endTreatment.treatmentName}</strong>? Active courses will be ended and <strong>+ New Course</strong> will be hidden.</>
                  : <>Stop this course of <strong className="text-slate-700">{endTreatment.treatmentName}</strong>?</>
                }
              </p>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reason for ending *</label>
                <textarea placeholder="Enter reason for ending this treatment..." value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
              <button onClick={async () => {
                if (!endReason.trim()) return
                if (endIsDrug) {
                  await api.put(`/treatments/${endTreatment.treatmentId}`, { status: 'ended', end_date: new Date().toISOString(), ended_by: currentUser?.id, end_reason: endReason.trim() })
                  setTreatments((prev) => prev.map((x: any) => x.id === endTreatment.treatmentId ? { ...x, status: 'ended', end_date: new Date().toISOString(), ended_by_name: currentUser?.name, end_reason: endReason.trim() } : x))
                  const allSess = Object.entries(sessionsMap).filter(([tid]) => tid === endTreatment.treatmentId).flatMap(([, v]) => v).filter((s: any) => s.status !== 'ended' && s.status !== 'completed')
                  for (const s of allSess) {
                    await api.put(`/treatment-sessions/${s.id}`, { status: 'ended', end_date: new Date().toISOString(), ended_by: currentUser?.id }).catch(() => {})
                  }
                  setSessionsMap((prev) => {
                    const next = { ...prev }
                    if (next[endTreatment.treatmentId]) {
                      next[endTreatment.treatmentId] = next[endTreatment.treatmentId].map((s: any) => s.status !== 'ended' && s.status !== 'completed' ? { ...s, status: 'ended', end_date: new Date().toISOString(), ended_by_name: currentUser?.name } : s)
                    }
                    return next
                  })
                } else {
                  await api.put(`/treatment-sessions/${endTreatment.treatmentId}`, { status: 'ended', end_date: new Date().toISOString(), ended_by: currentUser?.id, end_reason: endReason.trim() })
                  setSessionsMap((prev) => {
                    const next = { ...prev }
                    for (const key of Object.keys(next)) {
                      next[key] = next[key].map((s: any) => s.id === endTreatment.treatmentId ? { ...s, status: 'ended', end_date: new Date().toISOString(), ended_by_name: currentUser?.name, end_reason: endReason.trim() } : s)
                    }
                    return next
                  })
                }
                setEndTreatment(null)
                setEndIsDrug(false)
                setEndReason('')
              }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${endReason.trim() ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                <AlertTriangle size={16} /> Yes, {endIsDrug ? 'End Treatment' : 'End Course'}
              </button>
              <button onClick={() => setEndTreatment(null)}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Treatment Info Modal */}
      {parentInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setParentInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary" />
                <h2 className="text-base font-semibold text-slate-800">{parentInfoModal.treatment}</h2>
              </div>
              <button onClick={() => setParentInfoModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {(() => {
                const sessions = sessionsMap[parentInfoModal.id] || []
                const allDoses = getTreatmentDoses(parentInfoModal.id)
                const totalGiven = allDoses.filter((d: any) => d.status === 'administered').length
                const totalSkipped = allDoses.filter((d: any) => d.status === 'skipped').length
                const totalPending = allDoses.filter((d: any) => d.status !== 'administered' && d.status !== 'skipped').length
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Status</p>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${parentInfoModal.status === 'ended' ? 'bg-red-100 text-red-700' : parentInfoModal.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {parentInfoModal.status === 'ended' ? 'Ended' : parentInfoModal.status === 'completed' ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Courses</p>
                        <p className="text-xl font-bold text-slate-800">{sessions.length}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Created</p>
                        <p className="text-xs font-medium text-slate-700">{new Date(parentInfoModal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">by <strong>{parentInfoModal.staff_name || '—'}</strong></p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Doses</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-emerald-600 font-medium">{totalGiven} given</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-rose-600 font-medium">{totalSkipped} skipped</span>
                          {totalPending > 0 && <><span className="text-slate-300">|</span><span className="text-slate-500 font-medium">{totalPending} pending</span></>}
                        </div>
                      </div>
                    </div>

                    {parentInfoModal.status === 'ended' && (
                      <div className="bg-red-50 rounded-xl p-4 border border-red-100 space-y-1.5">
                        <p className="text-[10px] text-red-600 uppercase tracking-wider font-medium">Ended</p>
                        <p className="text-xs text-slate-700">
                          {parentInfoModal.end_date ? new Date(parentInfoModal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                          {parentInfoModal.ended_by_name ? <span> by <strong className="text-red-700">{parentInfoModal.ended_by_name}</strong></span> : ''}
                        </p>
                        {parentInfoModal.end_reason && (
                          <div className="bg-white rounded-lg p-2.5 border border-red-50">
                            <p className="text-[10px] text-slate-500 mb-0.5">Reason</p>
                            <p className="text-sm font-medium text-red-700">{parentInfoModal.end_reason}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {parentInfoModal.status === 'completed' && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-[10px] text-blue-600 uppercase tracking-wider font-medium">Completed</p>
                        <p className="text-xs text-slate-700">
                          {parentInfoModal.end_date ? new Date(parentInfoModal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                          {parentInfoModal.ended_by_name ? <span> by <strong className="text-blue-700">{parentInfoModal.ended_by_name}</strong></span> : ''}
                        </p>
                      </div>
                    )}

                    {sessions.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Course History</p>
                        <div className="space-y-2">
                          {[...sessions].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((s: any) => {
                            const ds = doseMap[s.id] || []
                            const given = ds.filter((d: any) => d.status === 'administered').length
                            const skipped = ds.filter((d: any) => d.status === 'skipped').length
                            const allDone = ds.length > 0 && ds.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                            const displaySessStatus = allDone ? 'completed' : s.status
                            return (
                              <div key={s.id} className={`rounded-xl border p-3 text-xs space-y-1 ${displaySessStatus === 'ended' ? 'bg-red-50/30 border-red-100' : displaySessStatus === 'completed' ? 'bg-blue-50/30 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${displaySessStatus === 'ended' ? 'bg-red-100 text-red-700' : displaySessStatus === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{displaySessStatus}</span>
                                    {s.dosage && <span className="text-slate-600">{s.dosage}</span>}
                                    {s.route && <span className="text-slate-400">{s.route}</span>}
                                  </div>
                                  <span className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })}</span>
                                </div>
                                <p className="text-[10px] text-slate-400">Started by <strong>{s.staff_name || '—'}</strong></p>
                                {s.ended_by_name && <p className="text-[10px] text-red-500">Ended by <strong>{s.ended_by_name}</strong>{s.end_reason ? ` — ${s.end_reason}` : ''}</p>}
                                <p className="text-[10px] text-slate-500">{given} given{skipped > 0 ? `, ${skipped} skipped` : ''}{ds.length > 0 ? ` / ${ds.length} doses` : ''}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Patient</p>
                      <p className="text-sm font-semibold text-slate-800">{patient?.full_name || '—'}</p>
                      {patient?.hospital_number && <p className="text-[10px] text-slate-400 font-mono">{patient.hospital_number}</p>}
                    </div>
                  </>
                )
              })()}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setParentInfoModal(null)} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Reason Modal */}
      {skipReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSkipReason(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="text-center px-6 pt-6 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mb-4">
                <XCircle size={32} className="text-rose-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Skip Dose</h2>
              <p className="text-sm text-slate-500 mt-1">Why was this dose not given?</p>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {['Patient refused', 'NPO', 'Vomited', 'Not due', 'Contraindicated', 'Other'].map((r) => (
                  <button key={r} onClick={() => setSkipReasonText(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      skipReasonText === r ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
                    }`}>{r}</button>
                ))}
              </div>
              <input type="text" placeholder="Or type custom reason..." value={skipReasonText}
                onChange={(e) => setSkipReasonText(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="px-6 pb-4 flex flex-col gap-2">
              <button onClick={() => {
                const reason = skipReasonText.trim() || 'Not given'
                api.put(`/treatment-doses/${skipReason.doseId}/skip`, { notes: reason, administered_by: currentUser?.id }).then((res) => {
                  const updated = doseMap[skipReason.treatmentId]?.map((x: any) => x.id === skipReason.doseId ? { ...x, ...res.data, status: 'skipped' } : x)
                  setDoseMap((prev) => ({ ...prev, [skipReason.treatmentId]: updated }))
                  autoCompleteTreatment(skipReason.treatmentId, updated || [])
                }).catch(() => {})
                setSkipReason(null)
              }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-all">
                <XCircle size={16} /> Confirm Skip
              </button>
              <button onClick={() => setSkipReason(null)}
                className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Child Course Detail Modal */}
      {childInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setChildInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary" />
                <h2 className="text-base font-semibold text-slate-800">{childInfoModal.treatmentName}</h2>
              </div>
              <button onClick={() => setChildInfoModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {(() => {
                const s = childInfoModal.session
                const doses = doseMap[s.id] || []
                const given = doses.filter((d: any) => d.status === 'administered')
                const skipped = doses.filter((d: any) => d.status === 'skipped')
                const pending = doses.filter((d: any) => d.status !== 'administered' && d.status !== 'skipped')
                const allDone = doses.length > 0 && doses.every((d: any) => d.status === 'administered' || d.status === 'skipped')
                const displayStatus = allDone ? 'completed' : s.status
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Status</p>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${displayStatus === 'ended' ? 'bg-red-100 text-red-700' : displayStatus === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {displayStatus === 'ended' ? 'Ended' : displayStatus === 'completed' ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Doses</p>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-emerald-600 font-medium">{given.length} ✓</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-rose-600 font-medium">{skipped.length} ✗</span>
                          {pending.length > 0 && <><span className="text-slate-300">|</span><span className="text-slate-500">{pending.length} pending</span></>}
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Dosage</p>
                        <p className="text-sm font-semibold text-slate-800">{s.dosage || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Route</p>
                        <p className="text-sm font-semibold text-slate-800">{s.route || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Frequency</p>
                        <p className="text-sm font-semibold text-slate-800">{s.frequency || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Times</p>
                        <p className="text-sm font-semibold text-slate-800">{s.times ? s.times.split(',').map((t: string) => to12Hour(t.trim())).join(', ') : '—'}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-1.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Timeline</p>
                      <p className="text-xs text-slate-700">Started <strong>{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong> by <strong>{s.staff_name || '—'}</strong></p>
                      {s.ended_by_name && (
                        <p className="text-xs text-slate-700">
                          {displayStatus === 'ended' ? 'Ended' : 'Completed'} <strong>{s.end_date ? new Date(s.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</strong> by <strong>{s.ended_by_name}</strong>
                        </p>
                      )}
                      {s.end_reason && (
                        <div className="mt-1 bg-red-50 rounded-lg p-2.5 border border-red-100">
                          <p className="text-[10px] text-slate-500 mb-0.5">Reason for ending</p>
                          <p className="text-xs font-medium text-red-700">{s.end_reason}</p>
                        </div>
                      )}
                    </div>
                    {doses.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Dose Details</p>
                        <div className="space-y-1.5">
                          {doses.map((d: any) => (
                            <div key={d.id} className={`rounded-xl border p-3 text-xs flex items-center justify-between ${d.status === 'administered' ? 'bg-emerald-50 border-emerald-200' : d.status === 'skipped' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-700">{to12Hour(d.scheduled_time?.slice(0, 5))}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${d.status === 'administered' ? 'bg-emerald-100 text-emerald-700' : d.status === 'skipped' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'}`}>
                                  {d.status === 'administered' ? 'Given ✓' : d.status === 'skipped' ? 'Skipped ✗' : 'Pending'}
                                </span>
                              </div>
                              <div className="text-right text-[10px] text-slate-400">
                                {d.administered_by_name && <p>by <strong>{d.administered_by_name}</strong></p>}
                                {d.administered_at && <p>{new Date(d.administered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setChildInfoModal(null)} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Dose / Treatment Detail Modal */}
      {doseDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDoseDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-y-auto flex-1">
              {doseDetail.type === 'treatment' ? (
                <>
                  <div className="text-center px-6 pt-6 pb-4">
                    <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${doseDetail.data.status === 'active' ? 'bg-emerald-100' : doseDetail.data.status === 'ended' ? 'bg-red-100' : 'bg-slate-100'}`}>
                      <Pill size={32} className={doseDetail.data.status === 'active' ? 'text-emerald-500' : doseDetail.data.status === 'ended' ? 'text-red-500' : 'text-slate-500'} />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800">{doseDetail.data.treatment}</h2>
                    <p className="text-sm text-slate-500 mt-1">{doseDetail.data.status === 'active' ? 'Active Treatment' : doseDetail.data.status === 'ended' ? 'Ended Treatment' : 'Expired Treatment'}</p>
                  </div>
                  <div className="px-6 pb-4 space-y-3">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium ${doseDetail.data.status === 'active' ? 'text-emerald-600' : doseDetail.data.status === 'ended' ? 'text-red-600' : 'text-slate-600'}`}>{doseDetail.data.status === 'active' ? 'Active' : doseDetail.data.status === 'ended' ? 'Ended' : 'Expired'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Dosage</span><span className="font-medium text-slate-700">{doseDetail.data.dosage || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Route</span><span className="font-medium text-slate-700">{doseDetail.data.route || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-medium text-slate-700">{doseDetail.data.frequency || '—'}</span></div>
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-500 text-xs">Started</span>
                        <p className="font-medium text-slate-700 mt-0.5">{new Date(doseDetail.data.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} by {doseDetail.data.staff_name || '—'}</p>
                      </div>
                      {(() => {
                        const sessDoses = doseMap[doseDetail.data.id] || []
                        const doses = sessDoses.length > 0 ? sessDoses : (doseDetail.data.treatment_id ? (doseMap[doseDetail.data.id] || []) : [])
                        if (doses.length === 0) return null
                        const givenDoses = doses.filter((d: any) => d.status === 'administered')
                        const skippedDoses = doses.filter((d: any) => d.status === 'skipped')
                        return (
                          <div className="pt-2 border-t border-slate-200 space-y-2">
                            <span className="text-slate-500 text-xs">Dose Times</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {doses.map((d: any) => (
                                d.status === 'administered' ? (
                                  <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                    {to12Hour(d.scheduled_time?.slice(0, 5))} ✓
                                  </span>
                                ) : d.status === 'skipped' ? (
                                  <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-50 text-rose-600 border border-rose-200 line-through decoration-rose-400">
                                    {to12Hour(d.scheduled_time?.slice(0, 5))} Skipped
                                  </span>
                                ) : (
                                  <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700">
                                    {to12Hour(d.scheduled_time?.slice(0, 5))} ✗
                                  </span>
                                )
                              ))}
                            </div>
                            {givenDoses.length > 0 && (
                              <p className="text-xs text-emerald-600">{givenDoses.length} given</p>
                            )}
                            {skippedDoses.length > 0 && (
                              <p className="text-xs text-rose-600">{skippedDoses.length} skipped</p>
                            )}
                          </div>
                        )
                      })()}
                      {(doseDetail.data.status === 'ended' || doseDetail.data.status === 'expired') && (
                        <div className="pt-2 border-t border-slate-200">
                          <span className="text-slate-500 text-xs">{doseDetail.data.status === 'ended' ? 'Ended' : 'Expired'}</span>
                          <p className="font-medium text-slate-700 mt-0.5">{doseDetail.data.end_date ? new Date(doseDetail.data.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'} by {doseDetail.data.ended_by_name || '—'}</p>
                          {doseDetail.data.end_reason && (
                            <div className="mt-2 bg-red-50 rounded-lg p-3 border border-red-100">
                              <span className="text-xs text-slate-500 block mb-0.5">Reason for ending</span>
                              <p className="text-sm font-medium text-red-700">{doseDetail.data.end_reason}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center px-6 pt-6 pb-4">
                    <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${doseDetail.status === 'administered' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                      {doseDetail.status === 'administered' ? <CheckCircle size={32} className="text-emerald-500" /> : <XCircle size={32} className="text-rose-500" />}
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800">{doseDetail.treatment_name}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {doseDetail.status === 'administered' ? 'Dose administered' : 'Dose skipped'} at <strong>{to12Hour(doseDetail.scheduled_time?.slice(0, 5))}</strong>
                    </p>
                  </div>
                  <div className="px-6 pb-4 space-y-3">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium ${doseDetail.status === 'administered' ? 'text-emerald-600' : 'text-rose-600'}`}>{doseDetail.status === 'administered' ? 'Given' : 'Skipped'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Scheduled Time</span><span className="font-medium text-slate-700">{to12Hour(doseDetail.scheduled_time?.slice(0, 5))}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Recorded At</span><span className="font-medium text-slate-700">{doseDetail.administered_at ? new Date(doseDetail.administered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Recorded By</span><span className="font-medium text-slate-700">{doseDetail.administered_by_name || '—'}</span></div>
                      {doseDetail.status === 'skipped' && doseDetail.notes && (
                        <div className="pt-2 border-t border-slate-200">
                          <span className="text-slate-500 text-xs">Reason</span>
                          <p className="font-medium text-slate-700 mt-0.5">{doseDetail.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 pb-4 flex-shrink-0">
              <button onClick={() => setDoseDetail(null)} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Fluid Entry Detail Modal */}
      {showEntryModal && selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEntryModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                {Number(selectedEntry.intake_ml) > 0 ? (
                  <><Droplets size={18} className="text-blue-500" /> Intake Detail</>
                ) : (
                  <><Droplets size={18} className="text-amber-500" /> Output Detail</>
                )}
              </h2>
              <button onClick={() => setShowEntryModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {(() => {
                const e = selectedEntry
                const isIntake = Number(e.intake_ml) > 0
                const details = e.details ? (typeof e.details === 'string' ? JSON.parse(e.details) : e.details) : null
                const intakeRoutes = details?.intake || {}
                const outputTypes = details?.output || {}
                return (
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Type</span>
                        <span className={`font-semibold ${isIntake ? 'text-blue-600' : 'text-amber-600'}`}>{isIntake ? 'Intake' : 'Output'}</span>
                      </div>
                      {isIntake && e.fluid_type && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Fluid Type</span>
                          <span className="font-medium text-slate-700 text-right max-w-[60%]">{e.fluid_type}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Amount</span>
                        <span className="font-bold text-slate-800">{Number(isIntake ? e.intake_ml : e.output_ml).toFixed(0)} mL</span>
                      </div>
                      {isIntake && Object.keys(intakeRoutes).length > 0 && (
                        <div>
                          <span className="text-slate-500 text-xs block mb-1">Routes</span>
                          <div className="space-y-1">
                            {Object.entries(intakeRoutes).map(([r, ml]) => (
                              <div key={r} className="flex justify-between text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                                <span className="font-medium capitalize">{r}</span>
                                <span className="font-semibold">{String(ml)} mL</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isIntake && Object.keys(intakeRoutes).length === 0 && e.route && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Route</span>
                          <span className="font-medium text-slate-700 capitalize">{e.route}</span>
                        </div>
                      )}
                      {!isIntake && Object.keys(outputTypes).length > 0 && (
                        <div>
                          <span className="text-slate-500 text-xs block mb-1">Output Types</span>
                          <div className="space-y-1">
                            {Object.entries(outputTypes).map(([t, ml]) => (
                              <div key={t} className="flex justify-between text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                                <span className="font-medium capitalize">{String(t).replace('_', ' ')}</span>
                                <span className="font-semibold">{String(ml)} mL</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {e.notes && (
                        <div className="pt-2 border-t border-slate-200">
                          <span className="text-slate-500 text-xs block mb-1">Notes</span>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.notes}</p>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-500 text-xs">Recorded</span>
                        <p className="font-medium text-slate-700 mt-0.5">
                          {new Date(e.recorded_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          {e.staff_name ? ` by ${e.staff_name}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
              <button onClick={() => setShowEntryModal(false)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
