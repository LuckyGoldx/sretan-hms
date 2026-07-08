import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Baby, ArrowLeft, Loader2, Activity, Calendar, Stethoscope, Heart, FileText, X, CheckCircle, Plus, PenLine, FlaskConical, ScanLine, Pill, Search, Clock, ChevronDown, ClipboardList } from 'lucide-react'
import { ICD11_CODES, Icd11Code } from '../data/icd11Codes'
const icd11Codes = ICD11_CODES

export default function MaternityPatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [delivery, setDelivery] = useState<any>(null)
  const [newborns, setNewborns] = useState<any[]>([])
  const [postnatalVisits, setPostnatalVisits] = useState<any[]>([])
  const [previousPregnancies, setPreviousPregnancies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')
  const [role, setRole] = useState('')
  const [staffId, setStaffId] = useState('')
  const [staffName, setStaffName] = useState('')

  // Consultation state
  const [maternityEncounters, setMaternityEncounters] = useState<any[]>([])
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '', notes: '' })
  const [labForm, setLabForm] = useState({ test_name: '', doctor_comment: '' })
  const [radiologyForm, setRadiologyForm] = useState({ imaging_type: '', doctor_comment: '' })
  const [rxForm, setRxForm] = useState({ drug_name: '', dosage: '', quantity: '', instructions: '' })
  const [labCatalog, setLabCatalog] = useState<any[]>([])
  const [radiologyInventory, setRadiologyInventory] = useState<any[]>([])
  const [pharmacyInventory, setPharmacyInventory] = useState<any[]>([])
  const [consultSubmitting, setConsultSubmitting] = useState(false)
  const activeEncounterRef = useRef<string | null>(null)
  const [selectedEncounter, setSelectedEncounter] = useState<any>(null)
  const [encounterOrders, setEncounterOrders] = useState<{ lab: any[]; radiology: any[]; prescriptions: any[] }>({ lab: [], radiology: [], prescriptions: [] })
  const [activeConsultTab, setActiveConsultTab] = useState('soap')
  const [activeConsultModal, setActiveConsultModal] = useState<'lab' | 'radiology' | null>(null)
  const [showDrugSuggestions, setShowDrugSuggestions] = useState(false)
  const [pendingDiagnoses, setPendingDiagnoses] = useState<{ code: string; label: string }[]>([])
  const [soapIcdSearch, setSoapIcdSearch] = useState('')
  const [soapIcdOpen, setSoapIcdOpen] = useState(false)
  const diagnosesRef = useRef<HTMLDivElement>(null)
  const ancPromptedRef = useRef(false)
  const ancEncounterIdRef = useRef<string | null>(null)
  const [showAncModal, setShowAncModal] = useState(false)
  const [icdSearch, setIcdSearch] = useState('')
  const [selectedIcd, setSelectedIcd] = useState('')
  const [selectedIcdLabel, setSelectedIcdLabel] = useState('')
  const [icdOpen, setIcdOpen] = useState(false)
  const [icdConfirmModal, setIcdConfirmModal] = useState<{ code: string; label: string; chapter: string } | null>(null)

  const [showANCModal, setShowANCModal] = useState(false)
  const [ancForm, setAncForm] = useState<any>({})
  const [ancSubmitting, setAncSubmitting] = useState(false)
  const [showAdmitModal, setShowAdmitModal] = useState(false)
  const [admitForm, setAdmitForm] = useState<any>({})
  const [admitSubmitting, setAdmitSubmitting] = useState(false)

  useEffect(() => {
    try {
      const u = localStorage.getItem('sretan_user')
      if (u) { const p = JSON.parse(u); setRole(p.role || ''); setStaffId(p.id || ''); setStaffName(p.name || '') }
    } catch {}
  }, [])

  async function loadData() {
    if (!id) return
    setLoading(true)
    try {
      const [recRes, visitsRes, delRes] = await Promise.all([
        fetch(`/api/maternity-patients/${id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
        fetch(`/api/antenatal-visits?maternity_patient_id=${id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
        fetch(`/api/maternity-deliveries?maternity_patient_id=${id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
      ])
      const rec = await recRes.json()
      setRecord(rec)
      // Load pregnancy history for this patient
      if (rec?.patient_id) {
        fetch(`/api/maternity-patients/history/${rec.patient_id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
          .then((r) => r.json()).then((pregs) => setPreviousPregnancies(Array.isArray(pregs) ? pregs : [])).catch(() => {})
      }
      const v = await visitsRes.json()
      setVisits(Array.isArray(v) ? v : [])
      const d = await delRes.json()
      if (Array.isArray(d) && d.length > 0) {
        setDelivery(d[0])
        const delDetail = await fetch(`/api/maternity-deliveries/${d[0].id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
        const dd = await delDetail.json()
        setNewborns(dd.newborns || [])
        const pnRes = await fetch(`/api/postnatal-visits?delivery_id=${d[0].id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
        const pn = await pnRes.json()
        setPostnatalVisits(Array.isArray(pn) ? pn : [])
      }
      // Load maternity encounters tied to this pregnancy
      if (rec?.id) {
        fetch(`/api/encounters?maternity_patient_id=${rec.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
          .then((r) => r.json()).then((encs) => setMaternityEncounters(Array.isArray(encs) ? encs : [])).catch(() => {})
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [id])

  const canEdit = role === 'Doctor' || role === 'Nurse' || role === 'Admin'
  const isRecords = role === 'Records'
  const isDoctor = role === 'Doctor'

  // Load catalog data for consultation
  useEffect(() => {
    if (!isDoctor) return
    fetch('/api/lab-test-catalog', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
      .then((r) => r.json()).then((d) => setLabCatalog(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/inventory?category=radiology', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
      .then((r) => r.json()).then((d) => setRadiologyInventory(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/inventory?category=pharmacy', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
      .then((r) => r.json()).then((d) => setPharmacyInventory(Array.isArray(d) ? d : [])).catch(() => {})
  }, [isDoctor])

  async function ensureEncounter(): Promise<string | null> {
    if (activeEncounterRef.current) return activeEncounterRef.current
    if (!record?.patient_id) return null
    const res = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
      body: JSON.stringify({ patient_id: record.patient_id, encounter_type: 'maternity', staff_id: staffId, maternity_patient_id: id }),
    })
    if (!res.ok) return null
    const enc = await res.json()
    if (!enc?.id) return null
    activeEncounterRef.current = enc.id
    return enc.id
  }

  function maybePromptAnc(encId: string) {
    if (id && !ancPromptedRef.current) {
      ancEncounterIdRef.current = encId
      setShowAncModal(true)
    }
  }

  async function handleSOAPSubmit() {
    if (!record?.patient_id) return
    setConsultSubmitting(true)
    try {
      const encId = await ensureEncounter()
      if (!encId) { setConsultSubmitting(false); return }
      const allDiagnoses = pendingDiagnoses.map((d) => ({ code: d.code, label: d.label, diagnosed_at: new Date().toISOString() }))
      await fetch(`/api/encounters/${encId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({
          chief_complaint: soap.subjective.slice(0, 200),
          soap_notes: soap,
          diagnoses: allDiagnoses.length > 0 ? allDiagnoses : undefined,
        }),
      })
      maybePromptAnc(encId)
      fetch(`/api/encounters?patient_id=${record.patient_id}&encounter_type=maternity`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
        .then((r) => r.json()).then((encs) => setMaternityEncounters(Array.isArray(encs) ? encs : [])).catch(() => {})
      setSoap({ subjective: '', objective: '', assessment: '', plan: '', notes: '' })
      setPendingDiagnoses([])
    } catch {} finally { setConsultSubmitting(false) }
  }

  async function handleLabOrder() {
    if (!record?.patient_id || !labForm.test_name.trim()) return
    setConsultSubmitting(true)
    try {
      const encId = await ensureEncounter()
      if (!encId) { setConsultSubmitting(false); return }
      await fetch('/api/lab-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ encounter_id: encId, test_name: labForm.test_name.trim(), doctor_comment: labForm.doctor_comment.trim() || undefined }),
      })
      maybePromptAnc(encId)
      setLabForm({ test_name: '', doctor_comment: '' })
      loadData()
    } catch {} finally { setConsultSubmitting(false) }
  }

  async function handleRadiologyOrder() {
    if (!record?.patient_id || !radiologyForm.imaging_type.trim()) return
    setConsultSubmitting(true)
    try {
      const encId = await ensureEncounter()
      if (!encId) { setConsultSubmitting(false); return }
      await fetch('/api/radiology-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ encounter_id: encId, imaging_type: radiologyForm.imaging_type.trim(), doctor_name: staffName, patient_name: record.full_name, doctor_comment: radiologyForm.doctor_comment.trim() || undefined }),
      })
      maybePromptAnc(encId)
      setRadiologyForm({ imaging_type: '', doctor_comment: '' })
      loadData()
    } catch {} finally { setConsultSubmitting(false) }
  }

  async function handleRxSubmit() {
    if (!record?.patient_id || !rxForm.drug_name.trim()) return
    setConsultSubmitting(true)
    try {
      const encId = await ensureEncounter()
      if (!encId) { setConsultSubmitting(false); return }
      await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ encounter_id: encId, drug_name: rxForm.drug_name.trim(), dosage: rxForm.dosage, quantity: Number(rxForm.quantity) || 0, instructions: rxForm.instructions }),
      })
      maybePromptAnc(encId)
      setRxForm({ drug_name: '', dosage: '', quantity: '', instructions: '' })
      loadData()
    } catch {} finally { setConsultSubmitting(false) }
  }

  async function handleANCSubmit() {
    if (!id) return
    setAncSubmitting(true)
    try {
      const { subjective, objective, assessment, plan, ...rest } = ancForm
      const body: any = { ...rest, maternity_patient_id: id, staff_id: staffId }
      if (subjective || objective || assessment || plan) {
        body.soap_notes = { subjective: subjective || '', objective: objective || '', assessment: assessment || '', plan: plan || '' }
      }
      await fetch('/api/antenatal-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify(body),
      })
      setShowANCModal(false)
      setAncForm({})
      loadData()
    } catch {} finally { setAncSubmitting(false) }
  }

  function formatDate(d: string) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function calcGestAge(edd: string): number {
    if (!edd) return 0
    const diff = new Date(edd).getTime() - Date.now()
    return Math.max(0, 40 - Math.floor(diff / (7 * 24 * 60 * 60 * 1000)))
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!record) return <div className="flex justify-center py-20 text-slate-400">Record not found</div>

  const tabs = [
    { id: 'profile', label: 'Profile', icon: Baby },
    { id: 'visits', label: `ANC Visits (${visits.length})`, icon: Calendar },
    { id: 'consultation', label: `Consultation`, icon: PenLine },
    { id: 'encounters', label: `Encounters (${maternityEncounters.length})`, icon: ClipboardList },
    { id: 'delivery', label: delivery ? 'Delivery' : 'Delivery', icon: Stethoscope },
    { id: 'postnatal', label: `Postnatal (${postnatalVisits.length})`, icon: Heart },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/maternity/patients')} className="p-2 rounded-xl hover:bg-slate-100 mt-0.5"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center mt-0.5"><Baby size={22} className="text-pink-600" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-800 truncate">{record.full_name}</h1>
          <p className="text-sm text-slate-400 truncate">{record.hospital_number} &middot; DOB: {record.dob?.slice(0, 10)}</p>
        </div>
        <div className="flex gap-2">
          {isDoctor && (
            <button onClick={() => setActiveTab('consultation')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium">
              <PenLine size={15} /> Consult
            </button>
          )}
          {record.status === 'active' && canEdit && (
            <button onClick={() => setShowAdmitModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium">
              <Stethoscope size={15} /> Admit for Labour
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === t.id ? 'bg-pink-500 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon size={12} className="hidden sm:inline" /> {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Pregnancy Profile</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-slate-400">EDD</p><p className="text-sm font-medium text-slate-800">{formatDate(record.edd)}</p></div>
              <div><p className="text-xs text-slate-400">Gestational Age (from LMP)</p><p className="text-sm font-bold text-purple-700">
                {record.lmp ? (() => { const ms = Date.now() - new Date(record.lmp).getTime(); const w = Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000))); const d = Math.max(0, Math.floor((ms % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000))); return `${w}w ${d}d` })() : '—'}
              </p></div>
              <div><p className="text-xs text-slate-400">LMP</p><p className="text-sm font-medium text-slate-800">{formatDate(record.lmp)}</p></div>
              <div><p className="text-xs text-slate-400">Booking GA</p><p className="text-sm font-medium text-slate-800">{record.booking_gestational_age ? `${record.booking_gestational_age}w` : '—'}</p></div>
              <div><p className="text-xs text-slate-400">Gravida / Para</p><p className="text-sm font-medium text-slate-800">G{record.gravida} P{record.para}</p></div>
              <div><p className="text-xs text-slate-400">Living Children</p><p className="text-sm font-medium text-slate-800">{record.living_children}</p></div>
              <div><p className="text-xs text-slate-400">Miscarriages</p><p className="text-sm font-medium text-slate-800">{record.miscarriages ?? 0}</p></div>
              <div><p className="text-xs text-slate-400">Babies Alive</p><p className="text-sm font-medium text-slate-800">{record.baby_alive ?? 0}</p></div>
              <div><p className="text-xs text-slate-400">Blood Group</p><p className="text-sm font-medium text-slate-800">{record.blood_group || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Genotype</p><p className="text-sm font-medium text-slate-800">{record.genotype || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Rh Factor</p><p className="text-sm font-medium text-slate-800">{record.rh_factor || '—'}</p></div>
              <div><p className="text-xs text-slate-400">HIV Status</p><p className="text-sm font-medium text-slate-800">{record.hiv_status || '—'}</p></div>
              <div><p className="text-xs text-slate-400">HBV Status</p><p className="text-sm font-medium text-slate-800">{record.hbv_status || '—'}</p></div>
              <div>
                <p className="text-xs text-slate-400">Risk Level</p>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                  record.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>{record.risk_level}</span>
              </div>
            </div>
            {record.risk_factors && (
              <div><p className="text-xs text-slate-400 mb-1">Risk Factors</p><p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{record.risk_factors}</p></div>
            )}
            <div className="text-xs text-slate-400 pt-2 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1">
              <span>Pregnancy #{record.pregnancy_number || 1}</span>
              {record.booking_code && <span className="font-mono text-primary font-medium">{record.booking_code}</span>}
              <span>Booked: {formatDate(record.booked_at)}</span>
              <span>Status: <span className="font-medium">{record.status}</span></span>
            </div>
          </div>

          {/* Previous Pregnancies */}
          {previousPregnancies.filter((p) => p.id !== record.id).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Baby size={16} className="text-slate-500" /> Previous Pregnancies ({previousPregnancies.filter((p) => p.id !== record.id).length})</h2>
              <div className="space-y-3">
                {previousPregnancies.filter((p) => p.id !== record.id).map((preg) => (
                  <div key={preg.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-700">Pregnancy #{preg.pregnancy_number || '—'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        preg.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        preg.status === 'anc_lost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>{preg.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-slate-400">Delivery:</span> <span className="font-medium">{preg.delivery_date?.slice(0, 10) || '—'}</span></div>
                      {preg.interpregnancy_interval_months !== undefined && (
                        <div><span className="text-slate-400">Interval:</span> <span className="font-medium">{preg.interpregnancy_interval_months} months</span></div>
                      )}
                      <div><span className="text-slate-400">Outcome:</span> <span className="font-medium">{preg.outcome || '—'}</span></div>
                      <div><span className="text-slate-400">G/P:</span> <span className="font-medium">G{preg.gravida} P{preg.para}</span></div>
                    </div>
                    <button onClick={() => navigate(`/maternity/patients/${preg.id}`)}
                      className="mt-2 text-xs text-primary font-medium hover:underline">View this pregnancy →</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'visits' && (
        <div className="space-y-4">
          {canEdit && (
            <button onClick={() => setShowANCModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium">
              <Plus size={15} /> Record ANC Visit
            </button>
          )}
          {visits.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Calendar size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No ANC visits recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((v) => (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-800">Visit #{v.visit_number}</h3>
                    <span className="text-xs text-slate-400">{formatDate(v.visit_date)} &middot; GA: {v.gestational_age_weeks}w</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {v.weight && <div><span className="text-slate-400">Weight:</span> <span className="font-medium">{v.weight} kg</span></div>}
                    {v.systolic_bp && <div><span className="text-slate-400">BP:</span> <span className="font-medium">{v.systolic_bp}/{v.diastolic_bp}</span></div>}
                    {v.fundal_height && <div><span className="text-slate-400">FH:</span> <span className="font-medium">{v.fundal_height} cm</span></div>}
                    {v.fetal_presentation && <div><span className="text-slate-400">Presentation:</span> <span className="font-medium">{v.fetal_presentation}</span></div>}
                    {v.fetal_heart_rate && <div><span className="text-slate-400">FHR:</span> <span className="font-medium">{v.fetal_heart_rate} bpm</span></div>}
                    {v.fetal_heart_sound && <div><span className="text-slate-400">FH Sound:</span> <span className="font-medium">{v.fetal_heart_sound}</span></div>}
                    {v.urine_protein && <div><span className="text-slate-400">Urine Protein:</span> <span className="font-medium">{v.urine_protein}</span></div>}
                    {v.urine_glucose && <div><span className="text-slate-400">Urine Glucose:</span> <span className="font-medium">{v.urine_glucose}</span></div>}
                    {v.hemoglobin && <div><span className="text-slate-400">Hb:</span> <span className="font-medium">{v.hemoglobin} g/dL</span></div>}
                    {v.pcv && <div><span className="text-slate-400">PCV:</span> <span className="font-medium">{v.pcv}%</span></div>}
                    {v.tt_dose && <div><span className="text-slate-400">TT Dose:</span> <span className="font-medium">{v.tt_dose}</span></div>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                    {v.iycf_given && <span className="text-green-600">Iron/Folate given</span>}
                    {v.next_appointment_date && <span>Next: {formatDate(v.next_appointment_date)}</span>}
                    {v.staff_name && <span>By: {v.staff_name}</span>}
                  </div>
                  {(() => {
                    const sn = typeof v.soap_notes === 'string' ? (() => { try { return JSON.parse(v.soap_notes) } catch { return null } })() : v.soap_notes
                    return sn && (sn.subjective || sn.objective || sn.assessment || sn.plan) ? (
                      <div className="mt-2 bg-purple-50 rounded-xl p-3 border border-purple-100 space-y-1">
                        <p className="text-[10px] font-semibold text-purple-600 uppercase">Doctor's SOAP Notes</p>
                        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((f) => sn[f] ? <p key={f} className="text-xs text-slate-600"><span className="text-purple-500 font-medium uppercase text-[10px]">{f}:</span> {sn[f]}</p> : null)}
                      </div>
                    ) : null
                  })()}
                  {v.notes && <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-2 mt-2">{v.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'consultation' && isDoctor && (
        <div className="space-y-6">
          {/* Pregnancy Banner */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><Baby size={16} className="text-purple-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-800">Antenatal Patient</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-purple-700">
                  <span>EDD: {record.edd?.slice(0, 10) || '—'}</span>
                  {record.edd && <span>Gest. Age: {calcGestAge(record.edd)} weeks</span>}
                  <span>G{record.gravida} P{record.para}</span>
                  <span>Living: {record.living_children ?? 0}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${record.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{record.risk_level} risk</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'soap', label: 'SOAP Note', icon: PenLine },
              { id: 'orders', label: 'Orders', icon: FlaskConical },
              { id: 'prescribe', label: 'Prescribe', icon: Pill },
              { id: 'icd', label: 'ICD-11', icon: Search },
            ].map((st) => {
              const Icon = st.icon
              const isActive = (activeConsultTab || 'soap') === st.id
              return (
                <button key={st.id} onClick={() => setActiveConsultTab(st.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    isActive ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}>
                  <Icon size={15} /> {st.label}
                </button>
              )
            })}
          </div>

          {/* SOAP Tab */}
          {(activeConsultTab || 'soap') === 'soap' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['subjective', 'objective', 'assessment', 'plan'] as const).map((f) => (
                  <div key={f}>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 capitalize flex items-center gap-1">{f}</label>
                    <textarea rows={3} value={soap[f]} onChange={(e) => setSoap((p) => ({ ...p, [f]: e.target.value }))}
                      placeholder={f === 'subjective' ? "Patient's reported symptoms, history..." : f === 'objective' ? "Exam findings, vitals..." : f === 'assessment' ? "Diagnosis, clinical reasoning..." : "Treatment plan, follow-up..."}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-shadow resize-none" />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Notes</label>
                <textarea rows={2} value={soap.notes} onChange={(e) => setSoap((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-shadow resize-none" />
              </div>
              {/* Inline ICD-11 Search (same dropdown as ICD-11 tab) */}
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1"><Search size={12} /> Add ICD-11 Diagnosis</label>
                <div className="relative">
                  <button onClick={() => setSoapIcdOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-400 bg-white hover:border-slate-300 transition-colors">
                    <span>Select ICD-11 code...</span>
                    <ChevronDown size={15} className={`text-slate-400 transition-transform ${soapIcdOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {soapIcdOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSoapIcdOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                            <input type="text" placeholder="Search codes..." value={soapIcdSearch}
                              onChange={(e) => setSoapIcdSearch(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-44">
                          {(soapIcdSearch ? icd11Codes.filter((c) => c.code.toLowerCase().includes(soapIcdSearch.toLowerCase()) || c.label.toLowerCase().includes(soapIcdSearch.toLowerCase())) : icd11Codes).map((item) => (
                            <button key={item.code} type="button" onClick={() => {
                              if (!pendingDiagnoses.some((d) => d.code === item.code)) {
                                setPendingDiagnoses((prev) => [...prev, { code: item.code, label: item.label }])
                              }
                              setSoapIcdSearch(''); setSoapIcdOpen(false)
                            }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition-colors flex items-center gap-2">
                              <span className="font-mono text-xs text-purple-600">{item.code}</span>
                              <span className="text-slate-600">{item.label}</span>
                            </button>
                          ))}
                          {(soapIcdSearch ? icd11Codes.filter((c) => c.code.toLowerCase().includes(soapIcdSearch.toLowerCase()) || c.label.toLowerCase().includes(soapIcdSearch.toLowerCase())).length === 0 : false) && (
                            <p className="px-4 py-3 text-sm text-slate-400">No matching codes found</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {pendingDiagnoses.length > 0 && (
                <div ref={diagnosesRef} className="mt-3">
                  <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Search size={12} /> Pending Diagnoses ({pendingDiagnoses.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingDiagnoses.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        <span className="font-mono text-[10px]">{d.code}</span>
                        {d.label}
                        <button type="button" onClick={() => setPendingDiagnoses((prev) => prev.filter((_, j) => j !== i))}
                          className="p-0.5 rounded-full hover:bg-purple-200 transition-colors"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={handleSOAPSubmit} disabled={consultSubmitting || (!soap.subjective && !soap.objective && !soap.assessment && !soap.plan && pendingDiagnoses.length === 0)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 px-6 rounded-xl shadow-sm hover:scale-[1.01] transition-all disabled:opacity-50">
                {consultSubmitting ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : <><PenLine size={15} /> Save SOAP Note{pendingDiagnoses.length > 0 ? ` + ${pendingDiagnoses.length} Diagnosis` : ''}</>}
              </button>

              {/* Encounter Timeline */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Maternity Consultation History ({maternityEncounters.length})</h2>
                {maternityEncounters.length === 0 ? (
                  <p className="text-sm text-slate-400">No prior maternity encounters.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {maternityEncounters.slice(0, 15).map((enc, idx) => (
                      <button key={enc.id} onClick={async () => {
                        setSelectedEncounter(enc)
                        setEncounterOrders({ lab: [], radiology: [], prescriptions: [] })
                        try {
                          const [labRes, radRes, rxRes] = await Promise.all([
                            fetch(`/api/lab-orders?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                            fetch(`/api/radiology-orders?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                            fetch(`/api/prescriptions?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                          ])
                          const labData = await labRes.json()
                          const radData = await radRes.json()
                          const rxData = await rxRes.json()
                          setEncounterOrders({
                            lab: Array.isArray(labData) ? labData : labData?.rows || [],
                            radiology: Array.isArray(radData) ? radData : radData?.rows || [],
                            prescriptions: Array.isArray(rxData) ? rxData : rxData?.rows || [],
                          })
                        } catch { setEncounterOrders({ lab: [], radiology: [], prescriptions: [] }) }
                      }}
                        className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all hover:shadow-md ${
                          idx === 0 ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/40'
                        }`}>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock size={14} className="text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{enc.encounter_type}</span>
                            <span className="text-xs text-slate-400">{new Date(enc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {idx === 0 && <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Current</span>}
                          </div>
                          {enc.soap_notes?.subjective && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{enc.soap_notes.subjective}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                            {enc.staff_name ? <span>By: <strong>{enc.staff_name}</strong></span> : null}
                          </div>
                        </div>
                        <ChevronDown size={14} className="text-slate-300 flex-shrink-0 mt-2" />
                      </button>
                    ))}
                  </div>
                )}</div></div>)}

          {/* Orders Tab */}
          {(activeConsultTab || 'soap') === 'orders' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex gap-3 mb-4">
                <button onClick={() => setActiveConsultModal('lab')}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 hover:scale-[1.01] transition-all">
                  <FlaskConical size={18} /> Order Lab Test
                </button>
                <button onClick={() => setActiveConsultModal('radiology')}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 hover:scale-[1.01] transition-all">
                  <ScanLine size={18} /> Order Radiology
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">Orders are created under a new maternity encounter</p>
            </div>
          )}

          {/* Prescribe Tab */}
          {(activeConsultTab || 'soap') === 'prescribe' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Drug Name</label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    <input type="text" placeholder="Type drug name or search inventory..." value={rxForm.drug_name}
                      onChange={(e) => { setRxForm((p) => ({ ...p, drug_name: e.target.value })); setShowDrugSuggestions(true) }}
                      onFocus={() => setShowDrugSuggestions(true)} onBlur={() => setTimeout(() => setShowDrugSuggestions(false), 200)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  {showDrugSuggestions && rxForm.drug_name.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                      {pharmacyInventory.filter((d: any) => d.drug_name?.toLowerCase().includes(rxForm.drug_name.toLowerCase())).slice(0, 10).map((drug: any) => (
                        <button key={drug.id || drug.drug_name} type="button" onMouseDown={() => { setRxForm((p) => ({ ...p, drug_name: drug.drug_name })); setShowDrugSuggestions(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center gap-2"><Pill size={13} className="text-blue-500" /> {drug.drug_name}</button>
                      ))}
                      <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">Type any custom drug name — it will be sent to pharmacy</div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Dosage</label>
                    <input type="text" placeholder="e.g. 500mg" value={rxForm.dosage}
                      onChange={(e) => setRxForm((p) => ({ ...p, dosage: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Quantity</label>
                    <input type="number" placeholder="30" value={rxForm.quantity}
                      onChange={(e) => setRxForm((p) => ({ ...p, quantity: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Instructions</label>
                  <textarea rows={2} placeholder="e.g. Take one capsule three times daily after meals" value={rxForm.instructions}
                    onChange={(e) => setRxForm((p) => ({ ...p, instructions: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
                </div>
                <button onClick={handleRxSubmit} disabled={consultSubmitting || !rxForm.drug_name.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:scale-[1.01] transition-all disabled:opacity-50">
                  {consultSubmitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : <><Pill size={15} /> Issue Prescription</>}
                </button>
              </div>
            </div>
          )}

          {/* ICD-11 Tab */}
          {(activeConsultTab || 'soap') === 'icd' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="relative">
                <button onClick={() => setIcdOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 bg-white hover:border-slate-300 transition-colors">
                  <span className={selectedIcd ? 'text-slate-700' : 'text-slate-400'}>{selectedIcd || 'Select ICD-11 code...'}</span>
                  <ChevronDown size={15} className={`text-slate-400 transition-transform ${icdOpen ? 'rotate-180' : ''}`} />
                </button>
                {icdOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIcdOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-hidden">
                      <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                          <input type="text" placeholder="Search codes..." value={icdSearch} onChange={(e) => setIcdSearch(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-44">
                        {((icdSearch ? icd11Codes.filter((c) => c.code.toLowerCase().includes(icdSearch.toLowerCase()) || c.label.toLowerCase().includes(icdSearch.toLowerCase())) : icd11Codes) as Icd11Code[]).map((item) => (
                          <button key={item.code} onClick={() => { setIcdOpen(false); setIcdSearch(''); setIcdConfirmModal({ code: item.code, label: item.label, chapter: item.chapter }) }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${selectedIcd === item.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}>
                            <span className="font-mono text-xs text-primary">{item.code}</span><span className="ml-2">{item.label}</span>
                          </button>
                        ))}
                        {icdSearch && icd11Codes.filter((c) => c.code.toLowerCase().includes(icdSearch.toLowerCase()) || c.label.toLowerCase().includes(icdSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-sm text-slate-400">No matching codes found</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">Selected codes appear in the SOAP tab — save them together with your notes.</p>
            </div>
          )}
        </div>
      )}

      {/* Encounter Detail Modal */}
      {selectedEncounter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedEncounter(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Consultation Details</h2>
              <button onClick={() => setSelectedEncounter(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <p className="text-xs text-slate-400">{new Date(selectedEncounter.created_at).toLocaleString()} {selectedEncounter.staff_name ? `by ${selectedEncounter.staff_name}` : ''}</p>

              {(() => {
                const diagnoses = typeof selectedEncounter.diagnoses === 'string' ? (() => { try { return JSON.parse(selectedEncounter.diagnoses) } catch { return [] } })() : selectedEncounter.diagnoses
                const soapNotes = typeof selectedEncounter.soap_notes === 'string' ? (() => { try { return JSON.parse(selectedEncounter.soap_notes) } catch { return null } })() : selectedEncounter.soap_notes
                const hasDiagnoses = Array.isArray(diagnoses) && diagnoses.length > 0
                const hasSOAP = soapNotes && (soapNotes.subjective || soapNotes.objective || soapNotes.assessment || soapNotes.plan)

                return (
                  <>
                    {/* ICD-11 Diagnoses */}
                    {hasDiagnoses && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">ICD-11 Diagnoses</p>
                        <div className="flex flex-wrap gap-1.5">
                          {diagnoses.map((d: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                              <span className="font-mono text-[10px]">{d.code}</span>
                              {d.label || d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SOAP Notes */}
                    {hasSOAP && (
                      <div className="space-y-2">
                        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((f) => (
                          soapNotes[f] ? (
                            <div key={f}>
                              <p className="text-xs font-semibold text-slate-500 uppercase">{f}</p>
                              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-2.5 mt-0.5">{soapNotes[f]}</p>
                            </div>
                          ) : null
                        ))}
                      </div>
                    )}

                    {selectedEncounter.notes && (
                      <div className="mt-2"><p className="text-xs font-semibold text-slate-500 uppercase">Notes</p><p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-2.5 mt-0.5">{selectedEncounter.notes}</p></div>
                    )}

                    {/* No content fallback */}
                    {!hasDiagnoses && !hasSOAP && !selectedEncounter.notes && (
                      <p className="text-sm text-slate-400 text-center py-4">No SOAP notes or diagnoses recorded for this encounter.</p>
                    )}
                  </>
                )
              })()}

              {/* Lab Orders */}
              {encounterOrders.lab.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Lab Orders ({encounterOrders.lab.length})</p>
                  {encounterOrders.lab.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 mb-1.5">
                      <div>
                        <span className="text-sm font-medium text-slate-800">{o.test_name}</span>
                        {o.doctor_comment && <p className="text-xs text-slate-400 mt-0.5">{o.doctor_comment}</p>}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Radiology Orders */}
              {encounterOrders.radiology.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Radiology Orders ({encounterOrders.radiology.length})</p>
                  {encounterOrders.radiology.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 mb-1.5">
                      <div>
                        <span className="text-sm font-medium text-slate-800">{o.imaging_type}</span>
                        {o.doctor_comment && <p className="text-xs text-slate-400 mt-0.5">{o.doctor_comment}</p>}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Prescriptions */}
              {encounterOrders.prescriptions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Prescriptions ({encounterOrders.prescriptions.length})</p>
                  {encounterOrders.prescriptions.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 mb-1.5">
                      <div>
                        <span className="text-sm font-medium text-slate-800">{o.drug_name}</span>
                        <div className="flex gap-2 text-xs text-slate-400 mt-0.5">
                          {o.dosage && <span>{o.dosage}</span>}
                          {o.quantity ? <span>Qty: {o.quantity}</span> : null}
                        </div>
                        {o.instructions && <p className="text-xs text-slate-400 italic">"{o.instructions}"</p>}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${o.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status || 'prescribed'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setSelectedEncounter(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'consultation' && !isDoctor && (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <PenLine size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">Doctor access required</p>
          <p className="text-xs mt-1">Only doctors can perform maternity consultations</p>
        </div>
      )}

      {/* ICD-11 Confirmation Modal */}
      {icdConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIcdConfirmModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Search size={16} className="text-white" /></div>
                <div>
                  <p className="text-sm font-semibold text-white">Confirm ICD-11 Diagnosis</p>
                  <p className="text-[11px] text-white/70">Review the diagnosis before saving</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-mono text-xs font-bold">{icdConfirmModal.code}</span>
                  {icdConfirmModal.chapter && <span className="text-[10px] text-purple-500 font-medium">{icdConfirmModal.chapter}</span>}
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
                if (!pendingDiagnoses.some((d) => d.code === item.code)) {
                  setPendingDiagnoses((prev) => [...prev, { code: item.code, label: item.label }])
                }
                setActiveConsultTab('soap')
                setTimeout(() => {
                  diagnosesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 100)
              }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                <CheckCircle size={14} /> Confirm Diagnosis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lab Order Modal */}
      {activeConsultModal === 'lab' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setActiveConsultModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FlaskConical size={16} className="text-blue-500" /> Order Lab Test</h2>
              <button onClick={() => setActiveConsultModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Test Name</label>
                <input type="text" list="labTestOptions" value={labForm.test_name} onChange={(e) => setLabForm((p) => ({ ...p, test_name: e.target.value }))}
                  placeholder="Start typing test name..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                <datalist id="labTestOptions">
                  {labCatalog.map((t: any) => <option key={t.id || t.test_name || t.name} value={t.test_name || t.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Doctor's Comment</label>
                <textarea rows={2} value={labForm.doctor_comment} onChange={(e) => setLabForm((p) => ({ ...p, doctor_comment: e.target.value }))}
                  placeholder="Optional..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setActiveConsultModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={async () => { await handleLabOrder(); setActiveConsultModal(null) }} disabled={consultSubmitting || !labForm.test_name.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
                {consultSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                Submit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Radiology Order Modal */}
      {activeConsultModal === 'radiology' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setActiveConsultModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ScanLine size={16} className="text-indigo-500" /> Order Radiology</h2>
              <button onClick={() => setActiveConsultModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Imaging Type</label>
                <input type="text" list="radiologyOptions" value={radiologyForm.imaging_type} onChange={(e) => setRadiologyForm((p) => ({ ...p, imaging_type: e.target.value }))}
                  placeholder="Start typing imaging type..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                <datalist id="radiologyOptions">
                  {radiologyInventory.map((t: any) => <option key={t.id || t.drug_name} value={t.drug_name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Doctor's Comment</label>
                <textarea rows={2} value={radiologyForm.doctor_comment} onChange={(e) => setRadiologyForm((p) => ({ ...p, doctor_comment: e.target.value }))}
                  placeholder="Optional..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setActiveConsultModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={async () => { await handleRadiologyOrder(); setActiveConsultModal(null) }} disabled={consultSubmitting || !radiologyForm.imaging_type.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium disabled:opacity-50">
                {consultSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                Submit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'encounters' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><ClipboardList size={16} className="text-slate-500" /> All Maternity Encounters ({maternityEncounters.length})</h2>
          {maternityEncounters.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No maternity encounters recorded yet</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {maternityEncounters.map((enc) => {
                const diagnoses = typeof enc.diagnoses === 'string' ? (() => { try { return JSON.parse(enc.diagnoses) } catch { return [] } })() : enc.diagnoses
                const soapNotes = typeof enc.soap_notes === 'string' ? (() => { try { return JSON.parse(enc.soap_notes) } catch { return null } })() : enc.soap_notes
                return (
                  <div key={enc.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-600">
                        {new Date(enc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {enc.staff_name && <span className="text-[10px] text-slate-400">by {enc.staff_name}</span>}
                    </div>
                    {soapNotes && (
                      <div className="text-xs text-slate-600 space-y-1 mb-2">
                        {soapNotes.subjective && <p><span className="text-slate-400 font-medium">S:</span> {soapNotes.subjective}</p>}
                        {soapNotes.objective && <p><span className="text-slate-400 font-medium">O:</span> {soapNotes.objective}</p>}
                        {soapNotes.assessment && <p><span className="text-slate-400 font-medium">A:</span> {soapNotes.assessment}</p>}
                        {soapNotes.plan && <p><span className="text-slate-400 font-medium">P:</span> {soapNotes.plan}</p>}
                      </div>
                    )}
                    {Array.isArray(diagnoses) && diagnoses.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {diagnoses.map((d: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">
                            {d.code && <span className="font-mono">{d.code} </span>}{d.label || d}
                          </span>
                        ))}
                      </div>
                    )}
                    <button onClick={async () => {
                      setSelectedEncounter(enc)
                      setEncounterOrders({ lab: [], radiology: [], prescriptions: [] })
                      try {
                        const [labRes, radRes, rxRes] = await Promise.all([
                          fetch(`/api/lab-orders?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                          fetch(`/api/radiology-orders?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                          fetch(`/api/prescriptions?encounter_id=${enc.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
                        ])
                        const labData = await labRes.json()
                        const radData = await radRes.json()
                        const rxData = await rxRes.json()
                        setEncounterOrders({
                          lab: Array.isArray(labData) ? labData : labData?.rows || [],
                          radiology: Array.isArray(radData) ? radData : radData?.rows || [],
                          prescriptions: Array.isArray(rxData) ? rxData : rxData?.rows || [],
                        })
                      } catch { setEncounterOrders({ lab: [], radiology: [], prescriptions: [] }) }
                    }}
                      className="text-xs text-primary font-medium hover:underline">View details →</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ANC Visit Confirmation Modal */}
      {showAncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAncModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Baby size={16} className="text-white" /></div>
                <div>
                  <p className="text-sm font-semibold text-white">Record as ANC Visit?</p>
                  <p className="text-[11px] text-white/70">This patient has an active pregnancy</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Would you like to record this consultation as an <strong>Antenatal Care (ANC) visit</strong> for this pregnancy?</p>
              <div className="bg-purple-50 rounded-xl p-3 text-xs text-purple-700">
                <p className="font-medium mb-1">If YES:</p>
                <ul className="list-disc list-inside space-y-0.5 text-purple-600">
                  <li>An ANC visit record will be created for today</li>
                  <li>Your SOAP notes will be attached to the visit</li>
                  <li>All lab, radiology, and prescriptions will be grouped under this visit</li>
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setShowAncModal(false); ancPromptedRef.current = true }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100">No, skip</button>
              <button onClick={async () => {
                setShowAncModal(false); ancPromptedRef.current = true
                const encId = ancEncounterIdRef.current
                if (!encId || !id) return
                try {
                  const existingRes = await fetch(`/api/antenatal-visits?maternity_patient_id=${id}&date_to=${new Date().toISOString().slice(0, 10)}&date_from=${new Date().toISOString().slice(0, 10)}`, {
                    headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
                  })
                  const existing = await existingRes.json()
                  if (Array.isArray(existing) && existing.length > 0) {
                    await fetch(`/api/antenatal-visits/${existing[0].id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
                      body: JSON.stringify({ encounter_id: encId }),
                    })
                  } else {
                    await fetch('/api/antenatal-visits', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
                      body: JSON.stringify({ maternity_patient_id: id, encounter_id: encId, visit_date: new Date().toISOString().slice(0, 10), staff_id: staffId }),
                    })
                  }
                } catch {}
              }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                <CheckCircle size={14} /> Yes, record ANC visit
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'delivery' && (
        <div className="space-y-4">
          {!delivery ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Stethoscope size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No delivery record yet</p>
              {canEdit && (
                <button onClick={() => navigate('/maternity/labour')}
                  className="mt-3 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium">Admit for Labour</button>
              )}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-base font-semibold text-slate-800">Delivery Record</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-slate-400">Date</p><p className="font-medium">{formatDate(delivery.delivery_date)}</p></div>
                  <div><p className="text-xs text-slate-400">Time</p><p className="font-medium">{delivery.delivery_time || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Type</p><p className="font-medium">{delivery.delivery_type || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Place</p><p className="font-medium">{delivery.delivery_place || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Perineum</p><p className="font-medium">{delivery.perineum_status || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Placenta</p><p className="font-medium">{delivery.placenta_delivery || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Blood Loss</p><p className="font-medium">{delivery.blood_loss_ml ? `${delivery.blood_loss_ml} mL` : '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Outcome</p><p className="font-medium">{delivery.outcome}</p></div>
                </div>
                {delivery.complication && delivery.complication !== 'none' && (
                  <div><p className="text-xs text-slate-400 mb-1">Complication</p><p className="text-sm text-rose-600 bg-rose-50 rounded-xl p-3">{delivery.complication}{delivery.complication_notes ? ` — ${delivery.complication_notes}` : ''}</p></div>
                )}
                {delivery.delivered_by_name && <p className="text-xs text-slate-400">Delivered by: {delivery.delivered_by_name}</p>}
              </div>

              {newborns.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-800">Newborn{newborns.length > 1 ? 's' : ''}</h2>
                  {newborns.map((nb) => (
                    <div key={nb.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Baby size={16} className="text-pink-500" />
                        <span className="text-sm font-semibold text-slate-800">{nb.baby_name || `Baby #${nb.baby_number}`}</span>
                        <span className="text-xs text-slate-400">{nb.baby_sex || ''}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-slate-400">Weight:</span> {nb.birth_weight ? `${nb.birth_weight} kg` : '—'}</div>
                        <div><span className="text-slate-400">Length:</span> {nb.birth_length ? `${nb.birth_length} cm` : '—'}</div>
                        <div><span className="text-slate-400">Head Circ:</span> {nb.head_circumference ? `${nb.head_circumference} cm` : '—'}</div>
                        <div><span className="text-slate-400">APGAR:</span> {nb.apgar_1min != null ? `${nb.apgar_1min}/${nb.apgar_5min || '?'}/${nb.apgar_10min || '?'}` : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'postnatal' && (
        <div className="space-y-4">
          {!delivery ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Heart size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No delivery record — postnatal care starts after delivery</p>
            </div>
          ) : (
            <>
              {canEdit && (
                <button onClick={() => navigate('/maternity/postnatal')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium">
                  <Plus size={15} /> Record Postnatal Visit
                </button>
              )}
              {postnatalVisits.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <Heart size={40} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No postnatal visits recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {postnatalVisits.map((pv) => (
                    <div key={pv.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-800">Visit #{pv.visit_number}</span>
                        <span className="text-xs text-slate-400">{formatDate(pv.visit_date)}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        {pv.fundal_height_cm != null && <div><span className="text-slate-400">Fundus:</span> {pv.fundal_height_cm} cm</div>}
                        {pv.lochia && <div><span className="text-slate-400">Lochia:</span> {pv.lochia}</div>}
                        {pv.systolic_bp && <div><span className="text-slate-400">BP:</span> {pv.systolic_bp}/{pv.diastolic_bp}</div>}
                        {pv.breastfeeding_status && <div><span className="text-slate-400">BF:</span> {pv.breastfeeding_status}</div>}
                        {pv.family_planning_discussed && <div><span className="text-slate-400">FP:</span> Discussed{pv.family_planning_method ? ` (${pv.family_planning_method})` : ''}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showANCModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!ancSubmitting) setShowANCModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Calendar size={18} className="text-primary" /> Record ANC Visit</h2>
              <button onClick={() => setShowANCModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Weight (kg)', key: 'weight', type: 'number' },
                  { label: 'Systolic BP', key: 'systolic_bp', type: 'number' },
                  { label: 'Diastolic BP', key: 'diastolic_bp', type: 'number' },
                  { label: 'Fundal Height (cm)', key: 'fundal_height', type: 'number' },
                  { label: 'Fetal Presentation', key: 'fetal_presentation', type: 'select', options: ['', 'cephalic', 'breech', 'transverse'] },
                  { label: 'Fetal Heart Rate', key: 'fetal_heart_rate', type: 'number' },
                  { label: 'FH Sound', key: 'fetal_heart_sound', type: 'text' },
                  { label: 'Urine Protein', key: 'urine_protein', type: 'select', options: ['', 'negative', 'trace', '+1', '+2', '+3'] },
                  { label: 'Urine Glucose', key: 'urine_glucose', type: 'select', options: ['', 'negative', 'trace', '+1', '+2', '+3'] },
                  { label: 'Hemoglobin (g/dL)', key: 'hemoglobin', type: 'number' },
                  { label: 'PCV (%)', key: 'pcv', type: 'number' },
                  { label: 'TT Dose', key: 'tt_dose', type: 'select', options: ['', '1', '2', '3', '4', '5', 'completed'] },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    {f.type === 'select' ? (
                      <select value={ancForm[f.key] || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
                        {(f.options || []).map((o) => <option key={o} value={o}>{o || 'Select'}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} step="any" value={ancForm[f.key] || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={ancForm.iycf_given || false}
                    onChange={(e) => setAncForm((p: any) => ({ ...p, iycf_given: e.target.checked }))}
                    className="rounded border-slate-300" />
                  Iron/Folate Given
                </label>
              </div>
              {isDoctor && (
                <div className="col-span-2 bg-purple-50 rounded-xl p-4 border border-purple-100 space-y-3">
                  <p className="text-xs font-semibold text-purple-700 flex items-center gap-1"><PenLine size={12} /> SOAP Notes (Doctor's Assessment)</p>
                  {(['subjective', 'objective', 'assessment', 'plan'] as const).map((f) => (
                    <div key={f}>
                      <label className="block text-xs font-medium text-purple-600 mb-0.5 capitalize">{f}</label>
                      <textarea rows={2} value={ancForm[f] || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, [f]: e.target.value }))}
                        className="w-full rounded-xl border border-purple-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white" />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Next Appointment Date</label>
                <input type="date" value={ancForm.next_appointment_date || ''}
                  onChange={(e) => setAncForm((p: any) => ({ ...p, next_appointment_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} value={ancForm.notes || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowANCModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={handleANCSubmit} disabled={ancSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50">
                {ancSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {ancSubmitting ? 'Saving...' : 'Save Visit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Labour Admission Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!admitSubmitting) setShowAdmitModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Admit for Labour — {record?.full_name}</h2>
              <button onClick={() => setShowAdmitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">This will admit the patient to the Maternity Ward and create a labour/delivery record.</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Admission Time</label>
                <input type="datetime-local" value={admitForm.admitted_at || ''}
                  onChange={(e) => setAdmitForm((p: any) => ({ ...p, admitted_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Labour Onset Time</label>
                <input type="datetime-local" value={admitForm.labour_onset_at || ''}
                  onChange={(e) => setAdmitForm((p: any) => ({ ...p, labour_onset_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Membranes</label>
                <select value={admitForm.rupture_of_membranes || ''} onChange={(e) => setAdmitForm((p: any) => ({ ...p, rupture_of_membranes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                  <option value="">Not specified</option>
                  <option value="intact">Intact</option>
                  <option value="ruptured">Ruptured (Spontaneous)</option>
                  <option value="artificial">Artificially Ruptured (ARM)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} value={admitForm.notes || ''}
                  onChange={(e) => setAdmitForm((p: any) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowAdmitModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={async () => {
                if (!id || !record) return
                setAdmitSubmitting(true)
                try {
                  const res = await fetch('/api/maternity-admit-labour', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
                    body: JSON.stringify({
                      maternity_patient_id: id,
                      admitted_at: admitForm.admitted_at || new Date().toISOString(),
                      labour_onset_at: admitForm.labour_onset_at || null,
                      rupture_of_membranes_at: admitForm.rupture_of_membranes || null,
                      admitted_by: staffId,
                      notes: admitForm.notes || null,
                    }),
                  })
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}))
                    alert(errData.message || 'Failed to admit for labour')
                    return
                  }
                  setShowAdmitModal(false)
                  await new Promise(r => setTimeout(r, 500))
                  navigate('/maternity/labour')
                } catch (err: any) { alert('Failed to admit for labour: ' + (err.message || '')) } finally { setAdmitSubmitting(false) }
              }} disabled={admitSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50">
                {admitSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {admitSubmitting ? 'Admitting...' : 'Confirm Admission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
