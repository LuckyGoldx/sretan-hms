import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import ReferralModal from './ReferralModal'
import ReferralDetailModal from './ReferralDetailModal'
import Pagination from './Pagination'
import {
  Building2, Search, Loader2, Plus, Eye, XCircle, Clock, Zap, AlertTriangle,
  CheckCircle, FileText, Send,
} from 'lucide-react'

interface Referral {
  id: string
  referral_number: string
  patient_id: string
  patient_name: string
  hospital_number: string
  status: string
  priority: string
  reason: string
  referral_notes: string
  outcome_note: string
  referred_by_name: string
  accepted_by_name: string
  accepted_at: string
  completed_by_name: string
  completed_at: string
  from_department_name: string
  to_department_name: string
  to_consultant_name: string
  created_at: string
}

interface Stats { pending: number; accepted: number; in_consultation: number; completed: number; rejected: number; cancelled: number; total: number }

const PER_PAGE = 25

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-blue-100 text-blue-700',
  in_consultation: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_consultation', label: 'In Consultation' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
]

function PriorityBadge({ priority }: { priority?: string }) {
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

export default function ReferralManagement() {
  const navigate = useNavigate()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [stats, setStats] = useState<Stats>({ pending: 0, accepted: 0, in_consultation: 0, completed: 0, rejected: 0, cancelled: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showNewModal, setShowNewModal] = useState(false)
  const [detail, setDetail] = useState<Referral | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [pendingPatientId, setPendingPatientId] = useState('')

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  const showToast = useCallback((message: string, type: 'success' | 'error') => setToast({ show: true, message, type }), [])
  const dismissToast = useCallback(() => setToast((p) => ({ ...p, show: false })), [])
  useEffect(() => { if (toast.show) { const t = setTimeout(dismissToast, 3500); return () => clearTimeout(t) } }, [toast.show, dismissToast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/referrals/dashboard', { params: { referred_by: currentStaffId || '' } }).catch(() => ({ data: [] })),
        api.get('/referrals/stats', { params: { referred_by: currentStaffId || '' } }).catch(() => ({ data: {} })),
      ])
      setReferrals(listRes.data || [])
      setStats({ ...{ pending: 0, accepted: 0, in_consultation: 0, completed: 0, rejected: 0, cancelled: 0, total: 0 }, ...(statsRes.data || {}) })
    } catch {} finally { setLoading(false) }
  }, [currentStaffId])

  useEffect(() => { load() }, [load])

  const filtered = referrals.filter((r) => {
    const matchTab = !tab || r.status === tab
    if (!matchTab) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.patient_name?.toLowerCase().includes(q) ||
      (r.hospital_number || '').toLowerCase().includes(q) ||
      (r.referral_number || '').toLowerCase().includes(q) ||
      (r.to_department_name || '').toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const statCards = [
    { label: 'Total', value: stats.total, color: 'text-slate-600', bg: 'bg-slate-100' },
    { label: 'Pending', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Accepted', value: stats.accepted, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'In Consultation', value: stats.in_consultation, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Rejected', value: stats.rejected, color: 'text-rose-600', bg: 'bg-rose-100' },
  ]

  async function cancelReferral(r: Referral) {
    if (!window.confirm(`Cancel referral ${r.referral_number}?`)) return
    try {
      await api.put(`/referrals/${r.id}/cancel`, { performed_by: currentStaffId })
      showToast('Referral cancelled', 'success')
      load()
      setDetail(null)
    } catch (err: any) { showToast(err?.response?.data?.message || 'Failed to cancel referral', 'error') }
  }

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[70] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-sm ${
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
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Send size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Referrals & Transfers</h1>
            <p className="text-sm text-slate-500">Track patients you referred to specialist departments</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Referral
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1) }}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search patient, hospital #, referral #, department..."
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No referrals found</p>
          <p className="text-xs text-slate-400 mt-1">Use "New Referral" to refer a patient to a consultant department.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">Referral</th>
                <th className="px-5 py-3 font-medium">To Department</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Accepted By</th>
                <th className="px-5 py-3 font-medium">Referred At</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pageRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{r.patient_name}</p>
                    <p className="text-xs text-slate-400">{r.hospital_number}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-xs font-mono text-slate-600">{r.referral_number}</p>
                    {r.reason && <p className="text-[10px] text-slate-400 truncate max-w-[140px]" title={r.reason}>{r.reason}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-medium">
                      <Building2 className="w-3 h-3" /> {r.to_department_name || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">
                    {r.accepted_by_name ? (
                      <div>
                        <p className="font-medium text-emerald-600">{r.accepted_by_name}</p>
                        {r.accepted_at && <p className="text-[10px] text-slate-400">{new Date(r.accepted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>}
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => setDetail(r)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      <button
                        onClick={() => navigate(`/patient/${r.patient_id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100"
                      >
                        <FileText className="w-3 h-3" /> Chart
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

      {showNewModal && (
        <ReferralModal
          patientId={pendingPatientId}
          patientName={undefined}
          onClose={() => setShowNewModal(false)}
          onSuccess={() => { setShowNewModal(false); load() }}
        />
      )}

      {detail && (
        <ReferralDetailModal
          referral={detail}
          onClose={() => setDetail(null)}
          onCancel={() => cancelReferral(detail)}
        />
      )}
    </div>
  )
}
