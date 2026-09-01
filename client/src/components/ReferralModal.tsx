import { useState, useEffect, useMemo, useRef } from 'react'
import {
  X, Search, Building2, AlertTriangle, CheckCircle, XCircle,
  Stethoscope, Loader2, Clock, Zap, Send, ArrowRight, ChevronDown, User, Users,
} from 'lucide-react'
import api from '../hooks/useAxios'
import ConsultantTag from './ConsultantTag'

interface DepartmentOption {
  id: string
  name: string
  code?: string
  description?: string
  modules?: string[]
  consultant_count?: number
  doctor_count?: number
  staff_count?: number
  consultants?: { id: string; name: string; email?: string; role?: string; department_id?: string }[]
}

interface ReferralModalProps {
  patientId: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

interface ToastState { show: boolean; message: string; type: 'success' | 'error' }

interface PatientOption {
  id: string
  full_name: string
  hospital_number: string
  sex?: string
  phone?: string
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => { if (toast.show) { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) } }, [toast.show, onClose])
  if (!toast.show) return null
  return (
    <div className={`fixed top-6 right-6 z-[70] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm transition-all duration-300 ${
      toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="ml-2 p-0.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" /></button>
    </div>
  )
}

const PRIORITIES = [
  { value: 'routine', label: 'Routine', icon: Clock, color: 'bg-sky-50 text-sky-600 border-sky-200', active: 'bg-sky-500 text-white border-sky-500' },
  { value: 'urgent', label: 'Urgent', icon: Zap, color: 'bg-amber-50 text-amber-600 border-amber-200', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'emergency', label: 'Emergency', icon: AlertTriangle, color: 'bg-rose-50 text-rose-600 border-rose-200', active: 'bg-rose-600 text-white border-rose-600' },
]

// Avoid "Dr. Dr. Name": only add the prefix when the name doesn't already carry it.
function displayStaffName(name: string, role?: string): string {
  const trimmed = (name || '').trim()
  if (role === 'Doctor') {
    return /^(dr\.?\s+)/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`
  }
  if (role === 'Consultant') {
    return /^(dr\.?\s+)/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`
  }
  return trimmed
}

export default function ReferralModal({ patientId, patientName, onClose, onSuccess }: ReferralModalProps) {
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDept, setSelectedDept] = useState<DepartmentOption | null>(null)
  const [reason, setReason] = useState('')
  const [priority, setPriority] = useState('routine')
  const [consultantId, setConsultantId] = useState('')
  const [staffListOpen, setStaffListOpen] = useState(false)
  const [referralNotes, setReferralNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })

  const [recentDepts, setRecentDepts] = useState<DepartmentOption[]>([])

  const [resolvedPatientId, setResolvedPatientId] = useState(patientId)
  const [resolvedPatientName, setResolvedPatientName] = useState(patientName || '')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState<PatientOption[]>([])
  const [patientSearching, setPatientSearching] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the Referral Reason box as the user types
  useEffect(() => {
    const el = reasonRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 76) + 'px'
  }, [reason])

  // Auto-grow the Additional Notes box past 3 lines as the user types
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 76) + 'px'
  }, [referralNotes])

  const showToast = (message: string, type: 'success' | 'error') => setToast({ show: true, message, type })
  const dismissToast = () => setToast((p) => ({ ...p, show: false }))

  const currentStaff: { id: string | null; email: string | null } = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) { const p = JSON.parse(u); return { id: p.id || null, email: (p.email || '').toLowerCase() || null } } } catch {}
    return { id: null, email: null }
  })()
  const currentStaffId = currentStaff.id
  // Exclude the current user by id AND by email (handles any residual duplicate accounts)
  const notSelf = (c: { id: string; email?: string }) =>
    c.id !== currentStaffId && (!currentStaff.email || !c.email || c.email.toLowerCase() !== currentStaff.email)

  // Per-doctor, per-patient referral-reason draft (persists until submit)
  const draftKey = `sretan_referral_draft_${currentStaffId || 'anon'}_${resolvedPatientId || 'nopatient'}`
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) setReason(saved)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPatientId])
  useEffect(() => {
    try {
      if (reason.trim()) localStorage.setItem(draftKey, reason)
      else localStorage.removeItem(draftKey)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason])

  useEffect(() => {
    if (!patientSearch.trim()) { setPatientResults([]); return }
    const q = patientSearch.trim()
    setPatientSearching(true)
    const t = setTimeout(() => {
      api.get('/patients/search', { params: { q } })
        .then((res) => setPatientResults(res.data || []))
        .catch(() => setPatientResults([]))
        .finally(() => setPatientSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [patientSearch])

  useEffect(() => {
    let mounted = true
    api.get<DepartmentOption[]>('/departments/with-consultants')
      .then((res) => {
        if (!mounted) return
        setDepartments(res.data || [])
        // Quick picks from localStorage
        try {
          const recent = JSON.parse(localStorage.getItem('recent_referral_departments') || '[]') as string[]
          const picked = (res.data || []).filter((d) => recent.includes(d.id)).slice(0, 4)
          setRecentDepts(picked)
        } catch {}
      })
      .catch(() => showToast('Failed to load departments', 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return departments
    const q = search.toLowerCase()
    return departments.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.code || '').toLowerCase().includes(q)
    )
  }, [departments, search])

  // Show the top 5 departments (by most staff) by default; searching shows all matches.
  const displayDepts = useMemo(() => {
    if (search.trim()) return filtered
    return [...departments]
      .sort((a, b) => ((b.doctor_count || 0) + (b.consultant_count || 0)) - ((a.doctor_count || 0) + (a.consultant_count || 0)))
      .slice(0, 5)
  }, [departments, filtered, search])

  // Eligible staff for the "refer to specific doctor / consultant" picker (self excluded)
  const eligibleStaff = useMemo(() => {
    if (!selectedDept?.consultants) return []
    return selectedDept.consultants.filter(notSelf)
  }, [selectedDept, notSelf])

  const selectedStaff = eligibleStaff.find((c) => c.id === consultantId) || null

  async function submitReferral() {
    if (!selectedDept) return
    if (!resolvedPatientId) {
      showToast('Please select a patient first', 'error')
      return
    }
    if (!reason.trim()) {
      showToast('Please enter a referral reason', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/referrals', {
        patient_id: resolvedPatientId,
        referred_by: currentStaffId,
        to_department_id: selectedDept.id,
        to_consultant_id: consultantId || null,
        reason: reason.trim(),
        priority,
        referral_notes: referralNotes.trim() || null,
      })
      // Persist recent departments
      try {
        const recent = JSON.parse(localStorage.getItem('recent_referral_departments') || '[]') as string[]
        const updated = [selectedDept.id, ...recent.filter((x) => x !== selectedDept.id)].slice(0, 8)
        localStorage.setItem('recent_referral_departments', JSON.stringify(updated))
      } catch {}
      showToast(`Referred successfully — ${res.data?.referral_number || ''}`, 'success')
      try { localStorage.removeItem(draftKey) } catch {}
      setTimeout(() => { onClose(); onSuccess?.() }, 1200)
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to create referral', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function quickRefer(dept: DepartmentOption) {
    setSelectedDept(dept)
    setSearch('')
    setConsultantId('')
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl max-h-[88vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Building2 size={18} className="text-indigo-500" /> Refer / Transfer Patient
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="p-6 overflow-y-auto space-y-5">
              {resolvedPatientName && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                  <Stethoscope className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <span className="font-medium text-slate-800">{resolvedPatientName}</span>
                  <span className="text-slate-400">— select a department with an active consultant</span>
                </div>
              )}

              {/* Patient picker (when opened from referral management page) */}
              {!resolvedPatientId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Patient <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Search patient name, hospital #, or phone..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  {patientSearching && <div className="flex items-center gap-2 py-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...</div>}
                  {!patientSearching && patientResults.length > 0 && (
                    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                      {patientResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setResolvedPatientId(p.id)
                            setResolvedPatientName(p.full_name)
                            setPatientSearch('')
                            setPatientResults([])
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{p.hospital_number}{p.sex ? ` · ${p.sex}` : ''}</p>
                          </div>
                          <span className="text-xs text-indigo-600 flex-shrink-0">Select</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!patientSearching && patientSearch.trim() && patientResults.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No patients found.</p>
                  )}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search departments with consultants..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Quick picks — only shown on the department-selection screen, hidden when empty */}
              {!selectedDept && recentDepts.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Quick picks</p>
                  <div className="flex flex-wrap gap-2">
                    {recentDepts.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => quickRefer(d)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 text-xs font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <Zap className="w-3 h-3" /> {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Departments list */}
              {!selectedDept ? (
                <div className="space-y-2">
                  {displayDepts.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-8">No departments with registered doctors or consultants found.</p>
                  )}
                  {displayDepts.map((d) => {
                    const dc = d.doctor_count || 0
                    const cc = d.consultant_count || 0
                    return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                          {cc} consultant{cc !== 1 ? 's' : ''} / {dc} doctor{dc !== 1 ? 's' : ''}
                          {d.consultants && d.consultants.length > 0 && (
                            <span className="text-slate-400 truncate">— {d.consultants.map((c) => c.name).join(', ')}</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => quickRefer(d)}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" /> Refer
                      </button>
                    </div>
                    )
                  })}
                </div>
              ) : (
                /* Referral form */
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{selectedDept.name}</p>
                      <p className="text-xs text-slate-500">{selectedDept.consultant_count || 0} consultant{(selectedDept.consultant_count || 0) !== 1 ? 's' : ''} / {selectedDept.doctor_count || 0} doctor{(selectedDept.doctor_count || 0) !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => setSelectedDept(null)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-800"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" /> Change
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-slate-700">Referral Reason / Clinical Summary <span className="text-rose-500">*</span></label>
                      {reason.trim() && (
                        <button
                          type="button"
                          onClick={() => setReason('')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <X size={13} /> Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      ref={reasonRef}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. Persistent lower abdominal pain for 3 weeks — please evaluate for gynaecological causes."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-hidden"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        'Please evaluate for specialist management.',
                        'Needs specialist review of persistent symptoms.',
                        'Pre-operative assessment requested.',
                        'Second opinion requested on diagnosis.',
                        'Requires further investigation not available here.',
                      ].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setReason(reason.trim() ? `${reason.trim()} ${t}` : t)}
                          className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 text-xs font-medium border border-transparent hover:border-indigo-100 transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
                    <div className="flex flex-wrap gap-2">
                      {PRIORITIES.map((p) => {
                        const Icon = p.icon
                        const active = priority === p.value
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPriority(p.value)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${active ? p.active : `${p.color} hover:opacity-80`}`}
                          >
                            <Icon className="w-3.5 h-3.5" /> {p.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {eligibleStaff.length > 0 && (
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Refer to specific doctor / consultant (optional)</label>
                      <button
                        type="button"
                        onClick={() => setStaffListOpen((o) => !o)}
                        onBlur={() => setTimeout(() => setStaffListOpen(false), 150)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {selectedStaff ? (
                            <>
                              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="truncate text-slate-700">{displayStaffName(selectedStaff.name, selectedStaff.role)}</span>
                              {selectedStaff.role === 'Consultant' && <ConsultantTag size="sm" />}
                            </>
                          ) : (
                            <>
                              <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="truncate text-slate-700">Consultant / Any doctor in {selectedDept.name}</span>
                            </>
                          )}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${staffListOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {staffListOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg max-h-56 overflow-y-auto">
                          <button
                            type="button"
                            onMouseDown={() => { setConsultantId(''); setStaffListOpen(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="truncate">Consultant / Any doctor in {selectedDept.name}</span>
                          </button>
                          {eligibleStaff.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => { setConsultantId(c.id); setStaffListOpen(false) }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${consultantId === c.id ? 'bg-indigo-50' : ''}`}
                            >
                              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="truncate text-slate-700">{displayStaffName(c.name, c.role)}</span>
                              {c.role === 'Consultant' && <ConsultantTag size="sm" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Notes (optional)</label>
                    <textarea
                      ref={notesRef}
                      value={referralNotes}
                      onChange={(e) => setReferralNotes(e.target.value)}
                      rows={3}
                      placeholder="Any extra instructions for the consultant..."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-hidden"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setSelectedDept(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitReferral}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submitting ? 'Submitting...' : 'Submit Referral'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Toast toast={toast} onClose={dismissToast} />
    </>
  )
}
