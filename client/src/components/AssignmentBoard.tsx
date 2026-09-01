import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Users, UserCheck, Stethoscope, RefreshCw, X, Loader2, CheckCircle, Shield, UserPlus,
  Building2, ClipboardList, AlertTriangle,
} from 'lucide-react'
import api from '../hooks/useAxios'

function statusBadge(status?: string): { label: string; cls: string } {
  switch (status) {
    case 'with_doctor': return { label: 'With Doctor', cls: 'bg-violet-100 text-violet-700' }
    case 'in_consultation': return { label: 'In Consultation', cls: 'bg-emerald-100 text-emerald-700' }
    case 'waiting': return { label: 'Waiting', cls: 'bg-purple-100 text-purple-700' }
    case 'in_triage': return { label: 'In Triage', cls: 'bg-amber-100 text-amber-700' }
    case 'checked_in': return { label: 'Checked In', cls: 'bg-blue-100 text-blue-700' }
    default: return { label: status || '—', cls: 'bg-slate-100 text-slate-600' }
  }
}

function consultationBadge(status?: string): { label: string; cls: string } {
  switch (status) {
    case 'paid': return { label: 'Consultation Paid', cls: 'bg-emerald-100 text-emerald-700' }
    case 'insurance_authorized': return { label: 'Insurer Authorized', cls: 'bg-indigo-100 text-indigo-700' }
    case 'settled': return { label: 'Settled', cls: 'bg-teal-100 text-teal-700' }
    case 'waived': return { label: 'Fee Waived', cls: 'bg-slate-100 text-slate-500' }
    case 'unpaid': return { label: 'Unpaid', cls: 'bg-rose-100 text-rose-700' }
    default: return { label: 'Fee Pending', cls: 'bg-amber-100 text-amber-700' }
  }
}

function visitTypeLabel(t?: string): string {
  return t === 'follow_up' ? 'Follow-up' : t === 'review' ? 'Review' : 'New'
}

export default function AssignmentBoard({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [role, setRole] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)

  // Two-panel queue (same logic for doctors, nurses, records and admins).
  const [queue, setQueue] = useState<any>({ assigned: [], claimable: [], counts: { assigned: 0, claimable: 0 } })
  const [queueLoading, setQueueLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [includeUnpaid, setIncludeUnpaid] = useState(false)
  const [error, setError] = useState('')
  const PAGE = 30
  const [assignedVisible, setAssignedVisible] = useState(PAGE)
  const [claimableVisible, setClaimableVisible] = useState(PAGE)

  // Doctor actions
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimModal, setClaimModal] = useState<any | null>(null)
  const [consultModal, setConsultModal] = useState<any | null>(null)
  const [consulting, setConsulting] = useState(false)
  const [consultBlock, setConsultBlock] = useState<any | null>(null)
  const [emergencyModal, setEmergencyModal] = useState<any | null>(null)
  const [emergencyType, setEmergencyType] = useState<'new' | 'follow_up'>('new')

  // Assign modal
  const [assignModal, setAssignModal] = useState<any | null>(null)
  const [assignDoctorId, setAssignDoctorId] = useState('')
  const [assignDepartmentId, setAssignDepartmentId] = useState('')
  const [assignVisitType, setAssignVisitType] = useState<'new' | 'follow_up'>('new')
  const [assignFee, setAssignFee] = useState('')
  const [assigning, setAssigning] = useState(false)

  const [doctors, setDoctors] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [defaultFees, setDefaultFees] = useState<{ new_visit: number; follow_up: number } | null>(null)
  const [doctorLoad, setDoctorLoad] = useState<Record<string, { active: number; waiting: number }>>({})

  const isDoctorQueue = role === 'Doctor' || role === 'Consultant'
  const canAssign = role === 'Records' || role === 'Admin' || role === 'Nurse'
  const canSeeFee = role === 'Records' || role === 'Admin'
  // Nurses, records and admins focus on assigning first, so Unassigned sits on the left.
  const swapPanels = role === 'Nurse' || role === 'Records' || role === 'Admin'
  // Records open the records profile; everyone else opens the clinical chart.
  const showProfile = embedded || role === 'Records'

  useEffect(() => {
    try {
      const u = localStorage.getItem('sretan_user')
      if (u) {
        const parsed = JSON.parse(u)
        setRole(parsed.role || null)
        setDoctorId(parsed.id || null)
      }
    } catch {}
  }, [])

  useEffect(() => {
    api.get('/staff').then((r) => setDoctors((r.data || []).filter((s: any) => (s.role === 'Doctor' || s.role === 'Consultant') && s.status === 'active'))).catch(() => {})
    api.get('/departments').then((r) => setDepartments((r.data || []).filter((d: any) => d.status !== 'inactive'))).catch(() => {})
    api.get('/visits/consultation-fees').then((r) => setDefaultFees(r.data || null)).catch(() => {})
    api.get('/doctors/load').then((r) => {
      const m: Record<string, { active: number; waiting: number }> = {}
      ;(r.data || []).forEach((d: any) => { m[d.staff_id] = { active: d.active, waiting: d.waiting } })
      setDoctorLoad(m)
    }).catch(() => {})
  }, [])

  // Doctor queue: my assigned + claimable (paid, or all triage when emergency is on).
  const fetchQueue = useCallback(async (silent = false) => {
    if (!doctorId) return
    if (!silent) setQueueLoading(true)
    setError('')
    try {
      const res = await api.get(`/doctor-queue?staff_id=${doctorId}&include_unpaid=${includeUnpaid}`)
      setQueue(res.data || { assigned: [], claimable: [], counts: { assigned: 0, claimable: 0 } })
    } catch { setError('Failed to load queue') } finally { if (!silent) setQueueLoading(false) }
  }, [doctorId, includeUnpaid])

  // Staff queue (Nurse/Records/Admin): all assigned patients + all unassigned,
  // then split unassigned into paid (ready) vs emergency (unpaid triage) client-side.
  const fetchStaffQueue = useCallback(async (silent = false) => {
    if (!silent) setQueueLoading(true)
    setError('')
    try {
      const [aRes, uRes] = await Promise.all([
        api.get('/assignments?assigned=yes'),
        api.get('/assignments?assigned=no'),
      ])
      const assigned = aRes.data || []
      const allUnassigned = uRes.data || []
      const claimable = includeUnpaid
        ? allUnassigned.filter((p: any) => p.has_paid || p.status === 'in_triage')
        : allUnassigned.filter((p: any) => p.has_paid)
      setQueue({ assigned, claimable, counts: { assigned: assigned.length, claimable: claimable.length } })
    } catch { setError('Failed to load queue') } finally { if (!silent) setQueueLoading(false) }
  }, [includeUnpaid])

  useEffect(() => {
    if (role === null) return
    if (isDoctorQueue) fetchQueue()
    else fetchStaffQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, doctorId, isDoctorQueue, fetchQueue, fetchStaffQueue])

  // Auto-refresh so everyone sees claims, assignments and status changes live.
  const silentFetchRef = useRef<() => void>(() => {})
  useEffect(() => {
    silentFetchRef.current = isDoctorQueue ? () => fetchQueue(true) : () => fetchStaffQueue(true)
  }, [isDoctorQueue, fetchQueue, fetchStaffQueue])
  useEffect(() => {
    const interval = setInterval(() => silentFetchRef.current(), 10000)
    return () => clearInterval(interval)
  }, [])

  // Reset pagination whenever the visible set changes (new search / emergency toggle).
  useEffect(() => { setAssignedVisible(PAGE); setClaimableVisible(PAGE) }, [search, includeUnpaid])

  async function handleClaim(patientId: string, emergency = false, visitType?: 'new' | 'follow_up') {
    if (!doctorId) return
    setClaimingId(patientId)
    setError('')
    try {
      await api.post(`/patients/${patientId}/claim`, {
        staff_id: doctorId,
        performed_by: doctorId,
        emergency,
        ...(visitType ? { visit_type: visitType } : {}),
      })
      await fetchQueue()
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to claim patient') } finally { setClaimingId(null) }
  }

  async function handleEmergencyClaimConfirm() {
    if (!emergencyModal) return
    await handleClaim(emergencyModal.id, true, emergencyType)
    setEmergencyModal(null); setEmergencyType('new')
  }

  async function handleClaimConfirm() {
    if (!claimModal) return
    setClaimingId(claimModal.id)
    setError('')
    try {
      await api.post(`/patients/${claimModal.id}/claim`, { staff_id: doctorId, performed_by: doctorId })
      await fetchQueue()
      setClaimModal(null)
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to claim patient') } finally { setClaimingId(null) }
  }

  async function handleConfirmConsult() {
    if (!consultModal) return
    setConsulting(true)
    setError('')
    try {
      if (consultModal.visit_id) {
        await api.put(`/visits/${consultModal.visit_id}/start`, { performed_by: doctorId })
      }
      navigate(`/consultation/${consultModal.id}`)
    } catch (err: any) {
      const active = err?.response?.data?.activeConsultation
      if (active) { setConsultBlock(active); setConsulting(false); return }
      setError(err?.response?.data?.message || 'Failed to start consultation'); setConsulting(false)
    }
  }

  async function handleAssignSubmit() {
    if (!assignModal) return
    const pid = assignModal.patient_id || assignModal.id || assignModal.patientId
    if (!pid) { setError('Patient is required. Please try again.'); return }
    setAssigning(true)
    setError('')
    try {
      await api.post('/visits', {
        patient_id: pid,
        assigned_doctor_id: assignDoctorId || null,
        department_id: assignDepartmentId || null,
        visit_type: assignVisitType,
        consultation_fee: assignFee ? parseFloat(assignFee) : undefined,
        performed_by: doctorId,
      })
      setAssignModal(null); setAssignDoctorId(''); setAssignDepartmentId(''); setAssignVisitType('new'); setAssignFee('')
      if (isDoctorQueue) await fetchQueue(); else await fetchStaffQueue()
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to assign patient') } finally { setAssigning(false) }
  }

  async function handleRelease(patientId: string) {
    if (!window.confirm('Release this patient back to the unassigned queue?')) return
    setAssigning(true)
    setError('')
    try {
      await api.post('/visits', { patient_id: patientId, assigned_doctor_id: null, performed_by: doctorId })
      if (isDoctorQueue) await fetchQueue(); else await fetchStaffQueue()
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to release patient') } finally { setAssigning(false) }
  }

  function openAssign(patient: any) {
    const type: 'new' | 'follow_up' = patient.visit_type === 'follow_up' || patient.visit_type === 'review' ? 'follow_up' : 'new'
    setAssignVisitType(type)
    const existingFee = patient.consultation_fee ? String(patient.consultation_fee) : ''
    const prefill = existingFee || (defaultFees ? String(type === 'follow_up' ? defaultFees.follow_up : defaultFees.new_visit) : '')
    setAssignModal({
      patient_id: patient.patient_id || patient.id || patient.patientId,
      full_name: patient.full_name,
      hospital_number: patient.hospital_number,
      assigned_doctor_id: patient.assigned_doctor_id || '',
      department_id: patient.department_id || '',
      consultation_fee: existingFee,
      has_paid: !!patient.has_paid,
    })
    setAssignDoctorId(patient.assigned_doctor_id || '')
    setAssignDepartmentId(patient.department_id || '')
    setAssignFee(prefill)
  }

  function changeVisitType(t: 'new' | 'follow_up') {
    setAssignVisitType(t)
    if (!defaultFees) return
    const oldDefault = assignVisitType === 'follow_up' ? defaultFees.follow_up : defaultFees.new_visit
    const newDefault = t === 'follow_up' ? defaultFees.follow_up : defaultFees.new_visit
    if (!assignFee || Number(assignFee) === oldDefault) {
      setAssignFee(String(newDefault))
    }
  }

  function closeAssignModal() {
    setAssignModal(null); setAssignDoctorId(''); setAssignDepartmentId(''); setAssignVisitType('new'); setAssignFee('')
  }

  function refresh() {
    if (isDoctorQueue) fetchQueue(); else fetchStaffQueue()
  }

  const q = search.trim().toLowerCase()
  const match = (p: any) =>
    !q || (p.full_name || '').toLowerCase().includes(q) || (p.hospital_number || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q)
  const shownAssigned = queue.assigned.filter(match)
  const shownClaimable = queue.claimable.filter(match)
  const assignedPage = shownAssigned.slice(0, assignedVisible)
  const claimablePage = shownClaimable.slice(0, claimableVisible)

  if (role === null) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><UserCheck className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Patient Assignment</h2>
              <p className="text-sm text-slate-400">{isDoctorQueue ? 'Your queue — claim unassigned patients or manage your assigned list.' : 'Assign patients to doctors, departments and consultation fees.'}</p>
            </div>
          </div>
          <button onClick={refresh} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {!isDoctorQueue && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, hospital number, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-1 rounded hover:bg-rose-100"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Assigned patients */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${swapPanels ? 'order-2' : 'order-1'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><UserCheck size={16} className="text-primary" /> {isDoctorQueue ? 'My Assigned Patients' : 'Assigned Patients'}</h3>
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{shownAssigned.length}</span>
          </div>
          {queueLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-primary" /></div>
          ) : shownAssigned.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Users size={30} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium">{isDoctorQueue ? 'No patients assigned to you' : 'No assigned patients yet'}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {assignedPage.map((p: any) => (
                <div key={p.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs font-mono text-slate-400">{p.hospital_number}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(p.visit_status || p.status).cls}`}>{statusBadge(p.visit_status || p.status).label}</span>
                  </div>
                  {p.assigned_doctor_name && (
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
                      <UserCheck size={11} className="text-indigo-500" /> Assigned to <strong className="text-slate-700">{p.assigned_doctor_name}</strong>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(p.visit_type)} visit</span>
                    {canSeeFee && Number(p.consultation_fee) > 0 && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">₦{Number(p.consultation_fee).toLocaleString()}</span>}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${consultationBadge(p.consultation_status).cls}`}>{consultationBadge(p.consultation_status).label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {isDoctorQueue && (
                      p.visit_status === 'with_doctor' ? (
                        <button onClick={() => navigate(`/consultation/${p.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                          <Stethoscope size={13} /> Continue
                        </button>
                      ) : (
                        <button onClick={() => setConsultModal(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-blue-600">
                          <Stethoscope size={13} /> Consult
                        </button>
                      )
                    )}
                    {!isDoctorQueue && p.visit_status === 'with_doctor' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold">
                        <Stethoscope size={13} /> In Consultation
                      </span>
                    )}
                    <button onClick={() => navigate(showProfile ? `/records/patients/${p.id}` : `/patient/${p.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                      <ClipboardList size={13} /> {showProfile ? 'Profile' : 'Chart'}
                    </button>
                    {isDoctorQueue && p.visit_status !== 'with_doctor' && (
                      <button onClick={() => handleRelease(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200">
                        <X size={13} /> Unclaim
                      </button>
                    )}
                    {canAssign && p.visit_status !== 'with_doctor' && (
                      <button onClick={() => openAssign(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                        <UserPlus size={13} /> Reassign
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {shownAssigned.length > assignedVisible && (
            <button onClick={() => setAssignedVisible((v) => v + PAGE)}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              View More ({shownAssigned.length - assignedVisible} more)
            </button>
          )}
        </div>

        {/* Unassigned / claimable queue */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${swapPanels ? 'order-1' : 'order-2'}`}>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Users size={16} className="text-emerald-600" /> {isDoctorQueue ? 'Claimable (Unassigned)' : 'Unassigned (Queue)'}</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setIncludeUnpaid((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${includeUnpaid ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                <AlertTriangle size={12} /> Include unpaid (Emergency)
              </button>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{shownClaimable.length}</span>
            </div>
          </div>
          {queueLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-primary" /></div>
          ) : shownClaimable.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle size={30} className="mx-auto mb-2 text-emerald-300" />
              <p className="text-xs font-medium">No unassigned patients in the queue</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {claimablePage.map((p: any) => (
                <div key={p.id} className="p-4 rounded-xl border border-slate-100 bg-emerald-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs font-mono text-slate-400">{p.hospital_number}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(p.status).cls}`}>{statusBadge(p.status).label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {p.visit_type && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(p.visit_type)} visit</span>}
                    {canSeeFee && Number(p.consultation_fee) > 0 && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">₦{Number(p.consultation_fee).toLocaleString()}</span>}
                    {p.consultation_status === 'insurance_authorized' ? (
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">Insurer Authorized</span>
                    ) : p.has_paid ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Consultation Paid</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold"><AlertTriangle size={9} /> Unpaid — Emergency</span>
                    )}
                    {p.department_name && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium"><Building2 size={10} /> {p.department_name}</span>}
                    {p.primary_provider && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium"><Shield size={10} /> {p.primary_provider}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {isDoctorQueue ? (
                      <button onClick={() => p.has_paid ? setClaimModal(p) : setEmergencyModal(p)} disabled={claimingId === p.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${p.has_paid ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                        {claimingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                        {p.has_paid ? 'Claim' : 'Emergency Claim'}
                      </button>
                    ) : (
                      <button onClick={() => openAssign(p)} disabled={assigning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50">
                        <UserPlus size={13} /> Assign
                      </button>
                    )}
                    <button onClick={() => navigate(showProfile ? `/records/patients/${p.id}` : `/patient/${p.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                      <ClipboardList size={13} /> {showProfile ? 'Profile' : 'Chart'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {shownClaimable.length > claimableVisible && (
            <button onClick={() => setClaimableVisible((v) => v + PAGE)}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              View More ({shownClaimable.length - claimableVisible} more)
            </button>
          )}
        </div>
      </div>

      {/* Claim Confirm Modal */}
      {claimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!claimingId) setClaimModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-lg font-bold">
                  {(claimModal.full_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Confirm Claim</h2>
                  <p className="text-emerald-100 text-xs font-mono truncate">{claimModal.hospital_number}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Claim <strong className="text-slate-800">{claimModal.full_name}</strong> into your queue?
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(claimModal.visit_type)} visit</span>
                {canSeeFee && Number(claimModal.consultation_fee) > 0 && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">₦{Number(claimModal.consultation_fee).toLocaleString()}</span>}
                {claimModal.consultation_status === 'insurance_authorized' ? (
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">Insurer Authorized</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Consultation Paid</span>
                )}
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800">
                The patient will be moved to <strong>My Assigned Patients</strong>. You can <strong>unclaim</strong> them while they are still waiting, but you can only have <strong>one active consultation</strong> at a time once started.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setClaimModal(null)} disabled={!!claimingId}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleClaimConfirm} disabled={!!claimingId}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50">
                {claimingId ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                Confirm Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Claim Modal */}
      {emergencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!claimingId) setEmergencyModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"><AlertTriangle size={20} /></div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Emergency Claim</h2>
                  <p className="text-amber-100 text-xs">Consultation fee not yet paid</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Claim <strong className="text-slate-800">{emergencyModal.full_name}</strong> as an emergency case?
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Consultation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEmergencyType('new')}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${emergencyType === 'new' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    New
                  </button>
                  <button type="button" onClick={() => setEmergencyType('follow_up')}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${emergencyType === 'follow_up' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    Follow-up
                  </button>
                </div>
                {canSeeFee && defaultFees && (
                  <p className="text-[11px] text-slate-400 mt-1.5">Billed at paypoint after treatment: ₦{Number(emergencyType === 'follow_up' ? defaultFees.follow_up : defaultFees.new_visit).toLocaleString()} ({emergencyType === 'follow_up' ? 'follow-up' : 'new'})</p>
                )}
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800">
                This patient has not paid the consultation fee. The consultation charge will be raised and billed at paypoint after treatment. Treating an emergency patient now does not waive the fee.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => { setEmergencyModal(null); setEmergencyType('new') }} disabled={!!claimingId}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleEmergencyClaimConfirm} disabled={!!claimingId}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-all disabled:opacity-50">
                {claimingId ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                Claim (Emergency)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Consultation Confirm Modal */}
      {consultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!consulting) setConsultModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-lg font-bold">
                  {(consultModal.full_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold truncate">Start Consultation</h2>
                  <p className="text-emerald-100 text-xs font-mono truncate">{consultModal.hospital_number}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Begin consultation for <strong className="text-slate-800">{consultModal.full_name}</strong>?
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(consultModal.visit_type)} visit</span>
                {canSeeFee && consultModal.consultation_fee > 0 && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">₦{Number(consultModal.consultation_fee).toLocaleString()}</span>}
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${consultationBadge(consultModal.consultation_status).cls}`}>{consultationBadge(consultModal.consultation_status).label}</span>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800">
                Starting marks the patient as <strong>With Doctor</strong> and locks the assignment — they cannot be reassigned or released until you complete the consultation. You can only have one active consultation at a time.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setConsultModal(null)} disabled={consulting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleConfirmConsult} disabled={consulting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50">
                {consulting ? <Loader2 size={14} className="animate-spin" /> : <Stethoscope size={14} />}
                Start Consultation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Consultation Block Modal */}
      {consultBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConsultBlock(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"><AlertTriangle size={20} /></div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Active Consultation</h2>
                  <p className="text-amber-100 text-xs">Complete it before starting a new one</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">You are currently consulting:</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold flex-shrink-0">
                  {(consultBlock.full_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{consultBlock.full_name}</p>
                  <p className="text-xs font-mono text-slate-400">{consultBlock.hospital_number}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(consultBlock.visit_type)} visit</span>
                    {consultBlock.department_name && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-medium">{consultBlock.department_name}</span>}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">Complete this consultation before starting a new one. The patient stays locked until then.</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setConsultBlock(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Dismiss</button>
              <button onClick={() => { const p = consultBlock.patient_id; setConsultBlock(null); if (p) navigate(`/consultation/${p}`) }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-all">
                <Stethoscope size={14} /> Go to Active Consultation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!assigning) closeAssignModal() }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <UserPlus size={18} className="text-sky-500" />
                Assign Patient
              </h2>
              <button onClick={closeAssignModal} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Patient: <strong>{assignModal.full_name}</strong>
                {assignModal.hospital_number && <span className="text-xs text-slate-400"> · {assignModal.hospital_number}</span>}
              </p>
              {!assignModal.has_paid && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800">
                  This patient has <strong>not paid</strong> the consultation fee. The consultation charge (by the selected type) will be raised and billed at paypoint after treatment — treat as an emergency case.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Doctor</label>
                <select value={assignDoctorId} onChange={(e) => setAssignDoctorId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">-- Leave unassigned (queue) --</option>
                  {doctors.map((d) => {
                    const load = doctorLoad[d.id]
                    const busy = load && load.active > 0
                    return (
                      <option key={d.id} value={d.id}>{d.name} ({d.role}){busy ? ' — in consultation' : ''}{load && load.waiting > 0 ? ` (${load.waiting} waiting)` : ''}</option>
                    )
                  })}
                </select>
                {assignDoctorId && doctorLoad[assignDoctorId] && doctorLoad[assignDoctorId].active > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    This doctor is currently in an active consultation. The patient will be queued as <strong>waiting</strong> and attended after it is completed.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Department</label>
                <select value={assignDepartmentId} onChange={(e) => setAssignDepartmentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">-- Select department --</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Consultation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => changeVisitType('new')}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${assignVisitType === 'new' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>New</button>
                  <button type="button" onClick={() => changeVisitType('follow_up')}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${assignVisitType === 'follow_up' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Follow-up</button>
                </div>
              </div>
              {canSeeFee && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Consultation Fee (₦)</label>
                  <input type="number" min={0} step="any" placeholder="Leave blank to use default" value={assignFee}
                    onChange={(e) => setAssignFee(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  {defaultFees && (
                    <p className="text-[11px] text-slate-400 mt-1">Default: ₦{Number(assignVisitType === 'follow_up' ? defaultFees.follow_up : defaultFees.new_visit).toLocaleString()} ({assignVisitType === 'follow_up' ? 'follow-up' : 'new'})</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={closeAssignModal} disabled={assigning}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleAssignSubmit} disabled={assigning}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all disabled:opacity-50">
                {assigning ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
