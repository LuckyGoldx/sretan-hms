import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import type { Patient, Encounter } from '../types'
import {
  User, Clock, Pill, Beaker, Scan, Activity, Loader2, Home,
  AlertTriangle, ChevronRight, ArrowLeft, Stethoscope, FlaskConical, Droplets, XCircle,
  FileText, X, Info, Plus, CheckCircle
} from 'lucide-react'

const PER_PAGE = 15

function usePagination<T>(items: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PER_PAGE
  return { items: items.slice(start, start + PER_PAGE), totalPages }
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
  const [showVitalsForm, setShowVitalsForm] = useState(false)
  const [vitalsForm, setVitalsForm] = useState({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', triage_priority: 'green', nursing_notes: '', fluid_intake: '', fluid_output: '' })
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false)
  const [rxPage, setRxPage] = useState(1)
  const [encPage, setEncPage] = useState(1)
  const [labPage, setLabPage] = useState(1)
  const [radPage, setRadPage] = useState(1)
  const [vitPage, setVitPage] = useState(1)
  const [nurseNotes, setNurseNotes] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [fluidBalance, setFluidBalance] = useState<any[]>([])
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
  const [treatmentSubmitting, setTreatmentSubmitting] = useState(false)
  const [showFluidModal, setShowFluidModal] = useState(false)
  const [confirmDose, setConfirmDose] = useState<{ doseId: string; treatmentName: string; time: string; treatmentId: string } | null>(null)
  const [endTreatment, setEndTreatment] = useState<{ treatmentId: string; treatmentName: string } | null>(null)
  const [skipReason, setSkipReason] = useState<{ doseId: string; treatmentId: string } | null>(null)
  const [skipReasonText, setSkipReasonText] = useState('')
  const [doseDetail, setDoseDetail] = useState<any | null>(null)
  const [fluidForm, setFluidForm] = useState({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' })
  const [fluidRoutes, setFluidRoutes] = useState<string[]>([])
  const [fluidOtherRoute, setFluidOtherRoute] = useState('')
  const [fluidSubmitting, setFluidSubmitting] = useState(false)
  const [showFluidDetailModal, setShowFluidDetailModal] = useState(false)
  const [fluidDetail, setFluidDetail] = useState<'intake' | 'output'>('intake')
  const [fluidSearch, setFluidSearch] = useState('')
  const [showFluidDropdown, setShowFluidDropdown] = useState(false)
  const [isFluidOther, setIsFluidOther] = useState(false)

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
        fluid_intake: vitalsForm.fluid_intake ? parseFloat(vitalsForm.fluid_intake) : null,
        fluid_output: vitalsForm.fluid_output ? parseFloat(vitalsForm.fluid_output) : null,
      })
      setShowVitalsForm(false)
      setVitalsForm({ systolic_bp: '', diastolic_bp: '', pulse: '', temperature: '', respiration_rate: '', weight: '', spo2: '', triage_priority: 'green', nursing_notes: '', fluid_intake: '', fluid_output: '' })
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
        try { const r = await api.get(`/lab-results/${lo.id}`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
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
            try { const r = await api.get(`/lab-results/${lo.id}`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
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
          const [notesRes, txRes, fbRes] = await Promise.all([
            api.get(`/nurse-notes?patient_id=${patientId}`).catch(() => ({ data: [] })),
            api.get(`/treatments?patient_id=${patientId}`).catch(() => ({ data: [] })),
            api.get(`/fluid-balance?patient_id=${patientId}`).catch(() => ({ data: [] })),
          ])
          setNurseNotes(notesRes.data || [])
          setTreatments(txRes.data || [])
          setFluidBalance(fbRes.data || [])
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
    if (treatments.length === 0) return
    async function loadDoses() {
      const map: Record<string, any[]> = {}
      for (const t of treatments) {
        try {
          const res = await api.get(`/treatment-doses?treatment_id=${t.id}`)
          map[t.id] = res.data || []
        } catch { map[t.id] = [] }
      }
      setDoseMap(map)
    }
    loadDoses()
  }, [treatments.length])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!patient) return <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400"><AlertTriangle size={32} /><p className="text-sm mt-2">Patient not found</p></div>

  const doctorNotes = nurseNotes.filter((n: any) => n.note_type === 'doctor')
  const nurseOnlyNotes = nurseNotes.filter((n: any) => n.note_type !== 'doctor')
  const soapEncounters = encounters.filter((e: any) => e.soap_notes && (e.soap_notes.subjective || e.soap_notes.objective || e.soap_notes.assessment || e.soap_notes.plan))

  const sections = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'vitals', label: `Vitals (${vitalsList.length})`, icon: Activity },
    { id: 'encounters', label: `Encounters (${encounters.filter((e: any) => e.soap_notes && (e.soap_notes.subjective || e.soap_notes.objective || e.soap_notes.assessment || e.soap_notes.plan)).length})`, icon: Clock },
    { id: 'prescriptions', label: `Rx (${rxList.length})`, icon: Pill },
    { id: 'lab', label: `Lab (${labOrders.length})`, icon: FlaskConical },
    { id: 'radiology', label: `Radiology (${radOrders.length})`, icon: Scan },
    { id: 'admissions', label: `Admissions (${admissions.length})`, icon: Home },
    { id: 'treatment_sheet', label: `Treatments (${treatments.length})`, icon: Pill },
    { id: 'fluid_balance', label: `Fluid (${fluidBalance.length})`, icon: Droplets },
    { id: 'nurse_clinical_notes', label: `Nurses Clin. Notes (${nurseOnlyNotes.length})`, icon: FileText },
    { id: 'doctor_clinical_notes', label: `Doctors Cli. Notes (${doctorNotes.length + soapEncounters.length})`, icon: Stethoscope },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patient Chart</h1>
          <p className="text-sm text-slate-400">{patient.full_name} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; {patient.blood_type || 'N/A'}</p>
        </div>
        {isNurse || isDoctor ? (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setShowVitalsForm(true); setActiveSection('vitals') }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
              <Activity size={15} /> Record Vitals
            </button>
            {isDoctor && (
              <button onClick={() => navigate(`/consultation/${patientId}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                <Stethoscope size={15} /> Consult
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeSection === s.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon size={15} /> {s.label}
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
                { label: 'Insurance', value: patient.insurance || '—' },
                { label: 'Next of Kin', value: patient.next_of_kin || '—' },
                { label: 'Status', value: patient.status?.replace('_', ' ') || '—' },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs text-slate-400">{f.label}</p>
                  <p className="font-medium text-slate-800 mt-0.5">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Pill size={16} className="text-violet-500" /><h3 className="text-sm font-semibold">Recent Prescriptions</h3></div>
              {rxList.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {rxList.slice(0, 5).map((rx: any) => (
                    <button key={rx.id} onClick={() => setModalRx(rx)}
                      className="w-full flex justify-between text-xs p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-700 font-medium">{rx.drug_name}</span>
                      <span className="text-slate-400">{rx.quantity} × {rx.dosage}</span>
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
                    <div key={l.id} className="flex justify-between text-xs"><span className="text-slate-700">{l.test_name}</span><span className={`px-1.5 py-0.5 rounded text-[10px] ${l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span></div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Activity size={16} className="text-primary" /><h3 className="text-sm font-semibold">Encounters</h3></div>
              <p className="text-2xl font-bold text-slate-900">{encounters.length}</p>
              <p className="text-xs text-slate-400">Total visits</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Home size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold">Admissions</h3></div>
              <p className="text-2xl font-bold text-slate-900">{admissions.length}</p>
              <p className="text-xs text-slate-400">Total admissions</p>
              {(() => {
                const active = admissions.find((a: any) => a.status === 'active')
                return active ? (
                  <div className="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700 font-medium">Currently admitted</span>
                    <span className="text-emerald-400">·</span>
                    <span className="text-emerald-600">{active.ward_name}</span>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                      <td className="px-5 py-3 font-medium text-slate-800">{rx.drug_name}</td>
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
                <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">{lab.test_name}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyle}`}>
                      {lab.status.charAt(0).toUpperCase() + lab.status.slice(1)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(lab.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="px-5 py-3">
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                    {lab.doctor_name && <span>Ordered by: <strong>{lab.doctor_name}</strong></span>}
                    {lab.lab_number && <span className="font-mono">#{lab.lab_number}</span>}
                  </div>
                  {results.length > 0 ? (
                    <div className="space-y-1.5">
                      {results.map((r: any) => (
                        <div key={r.id} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-xl ${r.is_abnormal ? 'bg-rose-50' : 'bg-slate-50'}`}>
                          <span className="font-medium flex-1 text-slate-700">{r.analyte_name}</span>
                          <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                          <span className="text-slate-400">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                          {r.is_abnormal && <AlertTriangle size={12} className="text-rose-500" />}
                          {r.result_number && <span className="text-xs text-slate-300 font-mono">#{r.result_number}</span>}
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
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setViewLabModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{viewLabModal.test_name}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(viewLabModal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div><span className="text-slate-500">Doctor:</span> <span className="font-medium">{viewLabModal.doctor_name || '—'}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{viewLabModal.status}</span></div>
                {viewLabModal.lab_number && <div className="col-span-2"><span className="text-slate-500">Lab #:</span> <span className="font-mono text-xs">{viewLabModal.lab_number}</span></div>}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                {(labResults[viewLabModal.id] || []).length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {(labResults[viewLabModal.id] || []).map((r: any) => (
                      <div key={r.id} className={`px-4 py-3 flex items-center justify-between text-sm ${r.is_abnormal ? 'bg-rose-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-medium text-slate-700">{r.analyte_name}</span>
                          <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-slate-400">Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}</span>
                          {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No result details available</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end">
              <button onClick={() => setViewLabModal(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-800">{rad.imaging_type}</p>
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {rad.doctor_name && <span>Ordered by: <strong>{rad.doctor_name}</strong></span>}
                    <span>{new Date(rad.created_at).toLocaleString()}</span>
                  </div>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{admissions.length}</p>
                    <p className="text-sm text-slate-500">Total admissions</p>
                  </div>
                  {(() => {
                    const active = admissions.find((a: any) => a.status === 'active')
                    if (!active) return <div className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-2">Not currently admitted</div>
                    return (
                      <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-emerald-700 font-medium">Active — {active.ward_name}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
              {usePagination(admissions, admPage).items.map((a: any, idx: number) => (
                <div key={a.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-5 py-3 border-b flex items-center justify-between ${a.status === 'active' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-2">
                      <Home size={15} className={a.status === 'active' ? 'text-emerald-600' : 'text-slate-500'} />
                      <span className="text-sm font-semibold text-slate-700">{a.ward_name}</span>
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold ${
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
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                          <p className="text-sm text-slate-700">{soap[f]}</p>
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
                          <div key={rx.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm">
                            <div><span className="font-medium text-slate-800">{rx.drug_name}</span> <span className="text-slate-400">{rx.dosage}</span></div>
                            <span className="text-slate-500">Qty: {rx.quantity}</span>
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
                              {results.length > 0 && results.map((r: any) => (
                                <div key={r.id} className={`flex items-center gap-3 text-xs px-2.5 py-1 rounded-lg mt-1 ${r.is_abnormal ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-600'}`}>
                                  <span className="font-medium flex-1">{r.analyte_name}</span>
                                  <span className="font-bold">{r.value}</span>
                                  <span className="text-slate-400">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                                  {r.is_abnormal && <AlertTriangle size={10} className="text-rose-500" />}
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
                          <div key={rad.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm">
                            <span className="font-medium text-slate-800">{rad.imaging_type}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status}</span>
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
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <Activity size={15} className="text-primary" />
                  <span className="text-xs font-semibold text-slate-700 uppercase">
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
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 text-center">
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
                  <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
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
                      <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
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
                  {soapEncounters.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15).map((enc: any) => {
                    const soap = enc.soap_notes ? (typeof enc.soap_notes === 'string' ? JSON.parse(enc.soap_notes) : enc.soap_notes) : null
                    const doctorName = enc.staff_id ? staffCache[enc.staff_id] : null
                    const diagnoses = enc.diagnoses ? (Array.isArray(enc.diagnoses) ? enc.diagnoses : typeof enc.diagnoses === 'string' ? JSON.parse(enc.diagnoses) : []) : []
                    return (
                      <div key={enc.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                          <div className="flex items-center gap-2">
                            <Stethoscope size={13} className="text-primary" />
                            <span className="font-semibold text-slate-700 uppercase text-[10px]">{enc.encounter_type}</span>
                          </div>
                          <div className="flex items-center gap-2">
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
                            {['subjective', 'objective', 'assessment', 'plan', 'notes'].filter((f: string) => soap[f]).map((f: string) => (
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

          {/* Detailed Fluid Breakdown Modal */}
          {showFluidDetailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!fluidSubmitting) setShowFluidDetailModal(false) }}>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                  <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Droplets size={18} className="text-blue-500" /> {fluidDetail === 'intake' ? 'Intake' : 'Output'} Breakdown</h2>
                  <button onClick={() => setShowFluidDetailModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                  {fluidDetail === 'intake' ? (
                    <div>
                      <p className="text-xs font-semibold text-blue-600 mb-3 flex items-center gap-1"><Droplets size={14} /> Intake Routes</p>
                      <div className="space-y-3">
                        {['Oral', 'IV', 'Foley', 'Parenteral', 'Other'].map((route) => (
                          <div key={route}>
                            <label className="block text-xs font-medium text-slate-500 mb-1">{route} (mL)</label>
                            <input type="number" min={0} placeholder="0" value={(fluidForm as any)[`intake_${route.toLowerCase()}`] || ''}
                              onChange={(e) => setFluidForm((p: any) => ({ ...p, [`intake_${route.toLowerCase()}`]: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                          </div>
                        ))}
                        <div className="p-3 bg-blue-50 rounded-xl text-center">
                          <span className="text-sm text-blue-700 font-semibold">
                            Total: {(
                              Number((fluidForm as any).intake_oral || 0) + Number((fluidForm as any).intake_iv || 0) +
                              Number((fluidForm as any).intake_foley || 0) + Number((fluidForm as any).intake_parenteral || 0) +
                              Number((fluidForm as any).intake_other || 0)
                            ).toFixed(0)} mL
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-amber-600 mb-3 flex items-center gap-1"><Droplets size={14} /> Output Types</p>
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
                          <span className="text-sm text-amber-700 font-semibold">
                            Total: {(
                              Number((fluidForm as any).output_urine || 0) + Number((fluidForm as any).output_vomit || 0) +
                              Number((fluidForm as any).output_aspirate || 0) + Number((fluidForm as any).output_bowels || 0) +
                              Number((fluidForm as any).output_blood_loss || 0)
                            ).toFixed(0)} mL
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                  <button onClick={() => setShowFluidDetailModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
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
                      const payload: any = {
                        patient_id: patientId, staff_id: currentUser?.id,
                        intake_ml: totalIntake, output_ml: totalOutput,
                        notes: null, details,
                      }
                      await api.post('/fluid-balance', payload)
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
                </div>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}

      {/* Treatment Sheet Tab */}
      {activeSection === 'treatment_sheet' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Treatment Sheet</h2>
            {!isDoctor && (
              <button onClick={() => { setShowTreatmentModal(true); setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' }); setSelectedTimes([]) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Plus size={14} /> Add Treatment</button>
            )}
          </div>
          {treatments.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No treatments recorded. Click Add Treatment to start.</p> : (
            <div className="space-y-4">
              {usePagination(treatments, treatmentPage).items.map((t: any) => {
                const doses = doseMap[t.id] || []
                const allDone = doses.length > 0 && doses.every((d: any) => d.status === 'administered')
                return (
                  <div key={t.id} className="rounded-2xl border overflow-hidden">
                    <div className={`px-5 py-3 border-b flex items-center justify-between ${t.status === 'active' ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">{t.treatment}</span>
                        <button onClick={() => setDoseDetail({ type: 'treatment', data: t })} className={`px-2 py-0.5 rounded-lg text-[10px] font-medium cursor-pointer hover:opacity-80 ${t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {t.status === 'active' ? 'Active' : 'Expired'}
                        </button>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[11px] text-slate-400">
                          Started {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} by {t.staff_name || '—'}
                        </span>
                        {t.status === 'expired' && (
                          <span className="text-[11px] text-slate-400">
                            Ended {t.end_date ? new Date(t.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'} by {t.ended_by_name || '—'}
                          </span>
                        )}
                        {t.status === 'active' && (
                          <button onClick={() => setEndTreatment({ treatmentId: t.id, treatmentName: t.treatment })} className="px-3 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors">End</button>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2 mb-3 text-xs">
                        {t.dosage && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">{t.dosage}</span>}
                        {t.route && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{t.route}</span>}
                        {t.frequency && <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">{t.frequency}</span>}
                        {t.times && <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">{t.times}</span>}
                        {t.staff_name && <span className="text-xs text-slate-400 ml-auto">{t.staff_name}</span>}
                      </div>
                      {t.notes && <p className="text-xs text-slate-500 mb-3">{t.notes}</p>}
                      {doses.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {doses.map((d: any) => {
                            const isAdministered = d.status === 'administered'
                            const isSkipped = d.status === 'skipped'
                            return (
                              <div key={d.id} className={`rounded-xl border p-2.5 text-center transition-all ${
                                isAdministered ? 'bg-emerald-50 border-emerald-200' :
                                isSkipped ? 'bg-rose-50 border-rose-200' :
                                'bg-white border-slate-200 hover:border-blue-300 cursor-pointer'
                              }`} onClick={() => {
                                if (isAdministered || isSkipped) {
                                  setDoseDetail({ ...d, treatment_name: t.treatment })
                                  return
                                }
                                if (t.status !== 'active') return
                                setConfirmDose({ doseId: d.id, treatmentName: t.treatment, time: d.scheduled_time?.slice(0, 5), treatmentId: t.id })
                              }}>
                                <p className="text-xs font-bold text-slate-700">{d.scheduled_time?.slice(0, 5)}</p>
                                {isAdministered ? (
                                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Done {new Date(d.administered_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                                ) : isSkipped ? (
                                  <p className="text-[10px] text-rose-600 font-medium mt-1">Skipped</p>
                                ) : (
                                  <p className="text-[10px] text-slate-400 font-medium mt-1">Pending</p>
                                )}
                                {d.administered_by_name && <p className="text-[9px] text-slate-400 mt-0.5">{d.administered_by_name}</p>}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No dose schedule set</p>
                      )}
                    </div>
                  </div>
                )
              })}
              <Pagination page={treatmentPage} totalPages={usePagination(treatments, treatmentPage).totalPages} onChange={setTreatmentPage} />
            </div>
          )}
        </div>
      )}

      {/* Fluid Balance Tab */}
      {activeSection === 'fluid_balance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Fluid Balance</h2>
              {!isDoctor && (
                <button onClick={() => { setFluidForm({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' }); setFluidRoutes([]); setFluidOtherRoute(''); setFluidSearch(''); setIsFluidOther(false); setShowFluidModal(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Plus size={14} /> Add Entry</button>
              )}
            </div>
            {fluidBalance.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No fluid balance records</p> : (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'Total Intake', value: fluidBalance.reduce((s, f) => s + Number(f.intake_ml), 0), color: 'text-blue-600', bg: 'bg-blue-100', key: 'intake' },
                    { label: 'Total Output', value: fluidBalance.reduce((s, f) => s + Number(f.output_ml), 0), color: 'text-amber-600', bg: 'bg-amber-100', key: 'output' },
                    { label: 'Net Balance', value: fluidBalance.reduce((s, f) => s + Number(f.intake_ml) - Number(f.output_ml), 0), color: 'text-emerald-600', bg: 'bg-emerald-100', key: null },
                  ].map((s) => (
                    s.key ? (
                      <button key={s.label} onClick={() => { setFluidDetail(s.key as 'intake' | 'output'); setShowFluidDetailModal(true) }}
                        className="bg-white rounded-xl border border-slate-100 p-4 text-center hover:shadow-md hover:border-slate-200 transition-all cursor-pointer w-full">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value} mL</p>
                        <p className="text-xs text-slate-500">{s.label}</p>
                      </button>
                    ) : (
                      <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value} mL</p>
                        <p className="text-xs text-slate-500">{s.label}</p>
                      </div>
                    )
                  ))}
                </div>
                <div className="space-y-3">
                  {usePagination(fluidBalance, fluidPage).items.map((f: any) => {
                    const details = f.details ? (typeof f.details === 'string' ? JSON.parse(f.details) : f.details) : null
                    const intakeRoutes = details?.intake || {}
                    const outputTypes = details?.output || {}
                    return (
                      <div key={f.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                          <span>{new Date(f.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          {f.staff_name && <span>by <strong>{f.staff_name}</strong></span>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-blue-50 rounded-xl p-3">
                            <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1"><Droplets size={13} /> Intake — {Number(f.intake_ml).toFixed(0)} mL</p>
                            {Object.keys(intakeRoutes).length > 0 ? (
                              <div className="space-y-1">
                                {Object.entries(intakeRoutes).map(([route, ml]) => (
                                  <div key={route} className="flex justify-between text-xs text-blue-600"><span className="capitalize">{route}</span><span className="font-medium">{String(ml)} mL</span></div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-blue-400 italic">{f.fluid_type || 'General'} ({f.route || '—'})</p>
                            )}
                          </div>
                          <div className="bg-amber-50 rounded-xl p-3">
                            <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1"><Droplets size={13} /> Output — {Number(f.output_ml).toFixed(0)} mL</p>
                            {Object.keys(outputTypes).length > 0 ? (
                              <div className="space-y-1">
                                {Object.entries(outputTypes).map(([type, ml]) => (
                                  <div key={type} className="flex justify-between text-xs text-amber-600"><span className="capitalize">{type.replace('_', ' ')}</span><span className="font-medium">{String(ml)} mL</span></div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-amber-400 italic">No output recorded</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-slate-400">Net: <strong className={`${Number(f.intake_ml) - Number(f.output_ml) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(Number(f.intake_ml) - Number(f.output_ml)).toFixed(0)} mL</strong></p>
                          {f.notes && <p className="text-xs text-slate-400">{f.notes}</p>}
                        </div>
                      </div>
                    )
                  })}
                  <Pagination page={fluidPage} totalPages={usePagination(fluidBalance, fluidPage).totalPages} onChange={setFluidPage} />
                </div>
              </>
            )}
          </div>

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
                              <button key={fluid} type="button" onMouseDown={() => {
                                setFluidForm((p) => ({ ...p, fluid_type: fluid }))
                                setFluidSearch(''); setShowFluidDropdown(false)
                              }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{fluid}</button>
                            ))}
                            {COMMON_FLUIDS.filter((f) => f !== 'Other' && f.toLowerCase().includes((fluidSearch || '').toLowerCase())).length === 0 && (
                              <button type="button" onMouseDown={() => { setIsFluidOther(true); setFluidForm((p) => ({ ...p, fluid_type: '' })); setShowFluidDropdown(false) }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-100">
                                + Other — type custom fluid name
                              </button>
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
                      {['Oral', 'IV', 'Foley', 'Parenteral'].map((r) => {
                        const isSelected = fluidRoutes.includes(r)
                        return (
                          <button key={r} type="button" onClick={() => setFluidRoutes((prev) => prev.includes(r) ? prev.filter((v) => v !== r) : [...prev, r])}
                            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                              isSelected ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}>{r}</button>
                        )
                      })}
                      {(() => {
                        const isOther = fluidRoutes.includes('Other')
                        return (
                          <button type="button" onClick={() => {
                            if (isOther) { setFluidRoutes((prev) => prev.filter((v) => v !== 'Other')); setFluidOtherRoute('') }
                            else setFluidRoutes((prev) => [...prev, 'Other'])
                          }}
                            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                              isOther ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}>Other</button>
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
                    if (!patientId) return
                    setFluidSubmitting(true)
                    try {
                      const routeStr = [...fluidRoutes, ...(fluidOtherRoute.trim() ? [fluidOtherRoute.trim()] : [])].join(', ')
                      await api.post('/fluid-balance', {
                        patient_id: patientId, staff_id: currentUser?.id,
                        intake_ml: Number(fluidForm.intake_ml) || 0, output_ml: 0, notes: fluidForm.notes || null,
                        route: routeStr || null, fluid_type: fluidForm.fluid_type || null,
                      })
                      setShowFluidModal(false)
                      setFluidForm({ fluid_type: '', intake_ml: '', output_ml: '', route: '', notes: '' })
                      setFluidRoutes([]); setFluidOtherRoute(''); setFluidSearch(''); setIsFluidOther(false)
                      const res = await api.get(`/fluid-balance?patient_id=${patientId}`)
                      setFluidBalance(res.data || [])
                    } catch {} finally { setFluidSubmitting(false) }
                  }} disabled={fluidSubmitting}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                    {fluidSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />} Save Entry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}

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
              {[{ key: 'treatment', label: 'Treatment *', placeholder: 'e.g. Paracetamol 500mg' },
                { key: 'dosage', label: 'Dosage', placeholder: 'e.g. 500mg' },
                { key: 'route', label: 'Route', placeholder: 'e.g. Oral, IV, IM' },
                { key: 'frequency', label: 'Frequency', placeholder: 'e.g. 8 hourly, PRN' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                  <input type="text" placeholder={f.placeholder} value={(treatmentForm as any)[f.key]}
                    onChange={(e) => setTreatmentForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              ))}
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
                if (!treatmentForm.treatment.trim() || !patientId) return
                setTreatmentSubmitting(true)
                try {
                  const timesStr = selectedTimes.join(',')
                  await api.post('/treatments', { patient_id: patientId, staff_id: currentUser?.id, ...treatmentForm, times: timesStr || undefined })
                  setShowTreatmentModal(false)
                  setTreatmentForm({ treatment: '', dosage: '', route: '', frequency: '', notes: '' })
                  setSelectedTimes([])
                  const res = await api.get(`/treatments?patient_id=${patientId}`)
                  setTreatments(res.data || [])
                } catch {} finally { setTreatmentSubmitting(false) }
              }} disabled={treatmentSubmitting || !treatmentForm.treatment.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {treatmentSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Pill size={14} />} Save Treatment
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Nursing Notes</label>
                <textarea rows={3} placeholder="Observations, chief complaint..." value={vitalsForm.nursing_notes}
                  onChange={(e) => setVitalsForm((p) => ({ ...p, nursing_notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fluid Intake (mL)</label>
                  <input type="number" placeholder="0" value={vitalsForm.fluid_intake}
                    onChange={(e) => setVitalsForm((p) => ({ ...p, fluid_intake: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fluid Output (mL)</label>
                  <input type="number" placeholder="0" value={vitalsForm.fluid_output}
                    onChange={(e) => setVitalsForm((p) => ({ ...p, fluid_output: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
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
                api.put(`/treatment-doses/${confirmDose.doseId}/administer`, { administered_by: currentUser?.id }).then(() => {
                  const updated = doseMap[confirmDose.treatmentId]?.map((x: any) => x.id === confirmDose.doseId ? { ...x, status: 'administered', administered_at: new Date().toISOString(), administered_by_name: currentUser?.name } : x)
                  setDoseMap((prev) => ({ ...prev, [confirmDose.treatmentId]: updated }))
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEndTreatment(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="text-center px-6 pt-6 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">End Treatment</h2>
              <p className="text-sm text-slate-500 mt-1">
                Stop <strong className="text-slate-700">{endTreatment.treatmentName}</strong>? Remaining doses will be marked as expired.
              </p>
            </div>
            <div className="px-6 pb-4 flex flex-col gap-2">
              <button onClick={async () => {
                const endRes = await api.put(`/treatments/${endTreatment.treatmentId}`, { status: 'expired', end_date: new Date().toISOString(), ended_by: currentUser?.id })
                setTreatments((prev) => prev.map((x: any) => x.id === endTreatment.treatmentId ? { ...x, status: 'expired', end_date: endRes.data?.end_date || new Date().toISOString(), ended_by_name: currentUser?.name } : x))
                setEndTreatment(null)
              }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-all">
                <AlertTriangle size={16} /> Yes, End Treatment
              </button>
              <button onClick={() => setEndTreatment(null)}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
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
                api.put(`/treatment-doses/${skipReason.doseId}/skip`, { notes: reason, administered_by: currentUser?.id }).then(() => {
                  const updated = doseMap[skipReason.treatmentId]?.map((x: any) => x.id === skipReason.doseId ? { ...x, status: 'skipped', notes: reason, administered_at: new Date().toISOString(), administered_by_name: currentUser?.name } : x)
                  setDoseMap((prev) => ({ ...prev, [skipReason.treatmentId]: updated }))
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

      {/* Dose / Treatment Detail Modal */}
      {doseDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDoseDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {doseDetail.type === 'treatment' ? (
              <>
                <div className="text-center px-6 pt-6 pb-4">
                  <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${doseDetail.data.status === 'active' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <Pill size={32} className={doseDetail.data.status === 'active' ? 'text-emerald-500' : 'text-slate-500'} />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-800">{doseDetail.data.treatment}</h2>
                  <p className="text-sm text-slate-500 mt-1">{doseDetail.data.status === 'active' ? 'Active Treatment' : 'Expired Treatment'}</p>
                </div>
                <div className="px-6 pb-4 space-y-3">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium ${doseDetail.data.status === 'active' ? 'text-emerald-600' : 'text-slate-600'}`}>{doseDetail.data.status === 'active' ? 'Active' : 'Expired'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Dosage</span><span className="font-medium text-slate-700">{doseDetail.data.dosage || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Route</span><span className="font-medium text-slate-700">{doseDetail.data.route || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-medium text-slate-700">{doseDetail.data.frequency || '—'}</span></div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 text-xs">Started</span>
                      <p className="font-medium text-slate-700 mt-0.5">{new Date(doseDetail.data.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} by {doseDetail.data.staff_name || '—'}</p>
                    </div>
                    {doseDetail.data.status === 'expired' && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-500 text-xs">Ended</span>
                        <p className="font-medium text-slate-700 mt-0.5">{doseDetail.data.end_date ? new Date(doseDetail.data.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'} by {doseDetail.data.ended_by_name || '—'}</p>
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
                    {doseDetail.status === 'administered' ? 'Dose administered' : 'Dose skipped'} at <strong>{doseDetail.scheduled_time?.slice(0, 5)}</strong>
                  </p>
                </div>
                <div className="px-6 pb-4 space-y-3">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium ${doseDetail.status === 'administered' ? 'text-emerald-600' : 'text-rose-600'}`}>{doseDetail.status === 'administered' ? 'Given' : 'Skipped'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Scheduled Time</span><span className="font-medium text-slate-700">{doseDetail.scheduled_time?.slice(0, 5)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Recorded At</span><span className="font-medium text-slate-700">{doseDetail.administered_at ? new Date(doseDetail.administered_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}</span></div>
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
            <div className="px-6 pb-4">
              <button onClick={() => setDoseDetail(null)} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
