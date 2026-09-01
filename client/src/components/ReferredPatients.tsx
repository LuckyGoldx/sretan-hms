import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import ReferralDetailModal from './ReferralDetailModal'
import ConsultationReport from './ConsultationReport'
import Pagination from './Pagination'
import {
  Users, Search, Stethoscope, Loader2, Eye, Building2, Clock, Zap, AlertTriangle,
  CheckCircle, XCircle, ArrowRight, FileText,
} from 'lucide-react'

interface ReferredPatient {
  patient_id: string
  hospital_number: string
  full_name: string
  phone: string
  sex: string
  dob: string
  patient_status: string
  referral_id: string
  referral_number: string
  priority: string
  referral_status: string
  reason: string
  referral_notes: string
  outcome_note: string
  referred_by_name: string
  referred_at: string
  accepted_by_name?: string | null
  accepted_at?: string | null
  completed_by_name?: string | null
  completed_at?: string | null
  to_consultant_name?: string | null
  consultant_fee?: number
  consultant_fee_status?: string
  has_paid_fee?: boolean
}

interface Stats { pending: number; accepted: number; in_consultation: number; completed: number; total: number }

function ConsultantFeeBadge({ p }: { p: ReferredPatient }) {
  if (!p.consultant_fee && Number(p.consultant_fee || 0) <= 0) return null
  if (p.has_paid_fee) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
        {p.consultant_fee_status === 'insurance_authorized' ? 'Insurer Authorized' : 'Fee Paid'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
      Fee Unpaid
    </span>
  )
}

const PER_PAGE = 25

const TABS = [
  { key: 'active', label: 'Active', statuses: ['pending', 'accepted', 'in_consultation'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'closed', label: 'Rejected / Cancelled', statuses: ['rejected', 'cancelled'] },
]

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    accepted: 'bg-blue-100 text-blue-700',
    in_consultation: 'bg-violet-100 text-violet-700',
    completed: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function ReferredPatients() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState<ReferredPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [includeUnpaid, setIncludeUnpaid] = useState(false)
  const [stats, setStats] = useState<Stats>({ pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 })
  const [page, setPage] = useState(1)
  const [actingId, setActingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ReferredPatient | null>(null)
  const [reportReferralId, setReportReferralId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<ReferredPatient | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
  const currentDept: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).department_name || null } catch {} return null })()

  const showToast = useCallback((message: string, type: 'success' | 'error') => setToast({ show: true, message, type }), [])
  const dismissToast = useCallback(() => setToast((p) => ({ ...p, show: false })), [])
  useEffect(() => { if (toast.show) { const t = setTimeout(dismissToast, 3500); return () => clearTimeout(t) } }, [toast.show, dismissToast])

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const [queueRes, statsRes] = await Promise.all([
        api.get('/consultants/referred-patients', { params: { staff_id: currentStaffId, include_unpaid: includeUnpaid } }).catch(() => ({ data: [] })),
        api.get('/consultants/stats', { params: { staff_id: currentStaffId } }).catch(() => ({ data: { pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 } })),
      ])
      setQueue(queueRes.data || [])
      setStats(statsRes.data || { pending: 0, accepted: 0, in_consultation: 0, completed: 0, total: 0 })
    } catch {} finally { setLoading(false) }
  }, [currentStaffId, includeUnpaid])

  useEffect(() => {
    setPage(1)
    loadQueue()
  }, [loadQueue, tab])

  // Completed/rejected/cancelled are loaded via the referrals endpoint (they leave the active queue)
  const [history, setHistory] = useState<ReferredPatient[]>([])
  useEffect(() => {
    if (tab === 'active') { setHistory([]); return }
    // Visiting the completed tab marks all completed referrals in the department as viewed
    if (tab === 'completed') {
      try {
        const u = localStorage.getItem('sretan_user')
        if (u) { const p = JSON.parse(u); if (p.id) api.put('/referrals/mark-all-viewed', { user_id: p.id }).catch(() => {}) }
      } catch {}
    }
    api.get('/referrals', { params: { to_department_id: (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).department_id } catch {} return '' })(), status: tab === 'completed' ? 'completed' : '' } })
      .then((res) => {
        const rows: any[] = res.data || []
        const mapped: ReferredPatient[] = rows.filter((r: any) => tab === 'completed' ? r.status === 'completed' : (r.status === 'rejected' || r.status === 'cancelled')).map((r: any) => ({
          patient_id: r.patient_id,
          hospital_number: r.hospital_number,
          full_name: r.patient_name,
          phone: r.phone,
          sex: r.sex,
          dob: r.dob,
          patient_status: r.patient_status,
          referral_id: r.id,
          referral_number: r.referral_number,
          priority: r.priority,
          referral_status: r.status,
          reason: r.reason,
          referral_notes: r.referral_notes,
          outcome_note: r.outcome_note,
          referred_by_name: r.referred_by_name,
          referred_at: r.created_at,
          accepted_by_name: r.accepted_by_name,
          accepted_at: r.accepted_at,
          completed_by_name: r.completed_by_name,
          completed_at: r.completed_at,
          to_consultant_name: r.to_consultant_name,
        }))
        setHistory(mapped)
      })
      .catch(() => setHistory([]))
  }, [tab])

  const rows = tab === 'active' ? queue : history

  const filtered = rows.filter((p) => {
    if (priorityFilter && p.priority !== priorityFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.full_name.toLowerCase().includes(q) ||
      p.hospital_number.toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.referral_number || '').toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  async function acceptReferral(r: ReferredPatient) {
    setActingId(r.referral_id)
    try {
      await api.put(`/referrals/${r.referral_id}/accept`, { performed_by: currentStaffId })
      showToast('Referral accepted', 'success')
      loadQueue()
    } catch (err: any) { showToast(err?.response?.data?.message || 'Failed to accept referral', 'error') }
    finally { setActingId(null) }
  }

  async function confirmReject() {
    if (!rejectModal) return
    setActingId(rejectModal.referral_id)
    try {
      await api.put(`/referrals/${rejectModal.referral_id}/reject`, { performed_by: currentStaffId, referral_notes: rejectReason.trim() || null })
      showToast('Referral rejected', 'success')
      setRejectModal(null); setRejectReason('')
      loadQueue()
    } catch (err: any) { showToast(err?.response?.data?.message || 'Failed to reject referral', 'error') }
    finally { setActingId(null) }
  }

  function openConsultation(p: ReferredPatient) {
    const params = new URLSearchParams({ consultant: '1', referral_id: p.referral_id })
    const userDept = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).department_id } catch {} return '' })()
    if (userDept) params.set('department_id', userDept)
    navigate(`/consultant/consultation/${p.patient_id}?${params.toString()}`)
  }

  const statCards = [
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Accepted', value: stats.accepted, icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'In Consultation', value: stats.in_consultation, icon: Stethoscope, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  ]

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[70] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={dismissToast} className="ml-2 p-0.5 rounded-lg hover:bg-black/5"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Users size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Referred Patients</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 flex-wrap">
              Comprehensive view of referrals to your department
              {currentDept && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-medium">
                  <Building2 className="w-3 h-3" /> {currentDept}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.label}
              onClick={() => { setTab('active'); setPriorityFilter('') }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}><Icon size={17} className={s.color} /></div>
                <div>
                  <p className="text-xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <button onClick={() => setIncludeUnpaid((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${includeUnpaid ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <AlertTriangle size={12} /> Include unpaid (Emergency)
          </button>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All priorities</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, hospital #, referral #..."
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No {tab !== 'active' ? 'historical' : 'referred'} patients found</p>
          <p className="text-xs text-slate-400 mt-1">Patients referred to your department will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">Referral</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Reason</th>
                <th className="px-5 py-3 font-medium">Referred By</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pageRows.map((p) => (
                <tr key={p.referral_id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{p.full_name}</p>
                    <p className="text-xs text-slate-400">{p.hospital_number} · {p.sex}</p>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setDetail(p)} className="text-left">
                      <p className="text-xs font-mono text-indigo-600 hover:underline">{p.referral_number}</p>
                      <p className="text-[10px] text-slate-400">{new Date(p.referred_at).toLocaleString()}</p>
                    </button>
                  </td>
                  <td className="px-5 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-5 py-3">
                    <StatusBadge status={p.referral_status} />
                    {tab === 'active' && <div className="mt-1.5"><ConsultantFeeBadge p={p} /></div>}
                  </td>
                  <td className="px-5 py-3 max-w-[200px]">
                    <p className="text-xs text-slate-600 truncate" title={p.reason || ''}>{p.reason || '—'}</p>
                    {p.outcome_note && <p className="text-[10px] text-emerald-600 truncate mt-0.5" title={p.outcome_note}>Outcome: {p.outcome_note}</p>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">
                    <p>{p.referred_by_name || '—'}</p>
                    {p.accepted_by_name && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">
                        Accepted by {p.accepted_by_name}
                        {p.accepted_at ? ` · ${new Date(p.accepted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                    )}
                    {p.to_consultant_name && <p className="text-[10px] text-indigo-600 mt-0.5">For: {p.to_consultant_name}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {p.referral_status === 'pending' && (
                        <>
                          <button
                            onClick={() => acceptReferral(p)}
                            disabled={actingId === p.referral_id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
                          >
                            {actingId === p.referral_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Accept
                          </button>
                          <button
                            onClick={() => setRejectModal(p)}
                            disabled={actingId === p.referral_id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                      {(p.referral_status === 'accepted' || p.referral_status === 'in_consultation') && (
                        <button
                          onClick={() => openConsultation(p)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100"
                        >
                          <Eye className="w-3 h-3" /> Consult <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      {p.referral_status === 'completed' && (
                        <button
                          onClick={() => {
                            setReportReferralId(p.referral_id)
                            try {
                              const u = localStorage.getItem('sretan_user')
                              if (u) { const usr = JSON.parse(u); if (usr.id) api.put(`/referrals/${p.referral_id}/view`, { user_id: usr.id }).catch(() => {}) }
                            } catch {}
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100"
                        >
                          <FileText className="w-3 h-3" /> View Outcome
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/patient/${p.patient_id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100"
                      >
                        <Eye className="w-3 h-3" /> Chart
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filtered.length} />
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!actingId) setRejectModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-500 to-red-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"><XCircle size={20} /></div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Reject Referral</h2>
                  <p className="text-rose-100 text-xs font-mono truncate">{rejectModal.referral_number}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Reject the referral for <strong className="text-slate-800">{rejectModal.full_name}</strong> ({rejectModal.hospital_number})?
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Reason for rejection</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. Wrong department, patient needs a different specialist..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                />
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-800">
                The referring doctor will be notified of the rejection and your reason.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} disabled={!!actingId}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmReject} disabled={!!actingId}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all disabled:opacity-50">
                {actingId ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject Referral
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && <ReferralDetailModal referral={detail} onClose={() => setDetail(null)} />}

      {reportReferralId && (
        <ConsultationReport referralId={reportReferralId} onClose={() => setReportReferralId(null)} />
      )}
    </div>
  )
}
