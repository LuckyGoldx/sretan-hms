import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Users, Loader2, UserCheck, ClipboardList, AlertTriangle, RefreshCw, X } from 'lucide-react'
import api from '../hooks/useAxios'

function visitTypeLabel(t?: string): string {
  return t === 'follow_up' ? 'Follow-up' : t === 'review' ? 'Review' : 'New'
}

function consultBadge(s?: string): { label: string; cls: string } {
  switch (s) {
    case 'paid': return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' }
    case 'insurance_authorized': return { label: 'Insurer Authorized', cls: 'bg-indigo-100 text-indigo-700' }
    case 'settled': return { label: 'Settled', cls: 'bg-teal-100 text-teal-700' }
    case 'waived': return { label: 'Fee Waived', cls: 'bg-slate-100 text-slate-500' }
    case 'unpaid': return { label: 'Unpaid', cls: 'bg-rose-100 text-rose-700' }
    default: return { label: 'Fee Pending', cls: 'bg-amber-100 text-amber-700' }
  }
}

const EMPTY = { active: null, waiting: [], history: [] }

export default function DoctorConsultations() {
  const navigate = useNavigate()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [data, setData] = useState<any>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consultModal, setConsultModal] = useState<any | null>(null)
  const [consulting, setConsulting] = useState(false)
  const [consultBlock, setConsultBlock] = useState<any | null>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setStaffId(JSON.parse(u).id) } catch {}
  }, [])

  const load = async () => {
    if (!staffId) return
    setLoading(true); setError('')
    try {
      const r = await api.get(`/doctors/${staffId}/consultations`)
      setData(r.data || EMPTY)
    } catch { setError('Failed to load consultations') } finally { setLoading(false) }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [staffId])

  async function handleConfirmConsult() {
    if (!consultModal) return
    setConsulting(true); setError('')
    try {
      if (consultModal.visit_id) {
        await api.put(`/visits/${consultModal.visit_id}/start`, { performed_by: staffId })
      }
      navigate(`/consultation/${consultModal.patient_id}`)
    } catch (err: any) {
      const active = err?.response?.data?.activeConsultation
      if (active) { setConsultBlock(active); setConsulting(false); return }
      setError(err?.response?.data?.message || 'Failed to start consultation'); setConsulting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Consultations</h1>
            <p className="text-sm text-slate-400">Your active consultation and visit history</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Active consultation */}
          {data.active ? (
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl shadow-md p-6 text-white">
              <div className="flex items-center gap-2 text-amber-100 text-xs font-semibold uppercase tracking-wide mb-3">
                <AlertTriangle size={14} /> Active Consultation
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {(data.active.full_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold truncate">{data.active.full_name}</p>
                  <p className="text-amber-100 text-xs font-mono">{data.active.hospital_number}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-medium">{visitTypeLabel(data.active.visit_type)} visit</span>
                    {data.active.department_name && <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-medium">{data.active.department_name}</span>}
                    {data.active.started_at && <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-medium">Started {new Date(data.active.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
                <button onClick={() => navigate(`/consultation/${data.active.patient_id}`)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-amber-700 text-sm font-semibold hover:bg-amber-50 transition-colors flex-shrink-0">
                  <Stethoscope size={16} /> Continue Consultation
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400">
              <Stethoscope size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium">No active consultation</p>
              <p className="text-xs mt-1">Start a consultation from your patient queue or the Assign / Queue tab.</p>
            </div>
          )}

          {/* Waiting (assigned, not started) */}
          {data.waiting.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Users size={16} className="text-primary" /> Waiting for You</h2>
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{data.waiting.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.waiting.map((w: any) => (
                  <div key={w.visit_id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    <p className="text-sm font-semibold text-slate-800 truncate">{w.full_name}</p>
                    <p className="text-xs font-mono text-slate-400">{w.hospital_number}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(w.visit_type)} visit</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${consultBadge(w.consultation_status).cls}`}>{consultBadge(w.consultation_status).label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <button onClick={() => setConsultModal(w)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-blue-600">
                        <UserCheck size={13} /> Consult
                      </button>
                      <button onClick={() => navigate(`/patient/${w.patient_id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
                        <ClipboardList size={13} /> Chart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Completed Consultations</h2>
            {data.history.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No completed consultations yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Completed</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.history.map((h: any) => (
                      <tr key={h.visit_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{h.full_name}</p>
                          <p className="text-xs font-mono text-slate-400">{h.hospital_number}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 capitalize">{visitTypeLabel(h.visit_type)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${consultBadge(h.consultation_status).cls}`}>{consultBadge(h.consultation_status).label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{h.completed_at ? new Date(h.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => navigate(`/patient/${h.patient_id}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-medium hover:bg-slate-50">
                            <ClipboardList size={12} /> Chart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
                  <h2 className="text-base font-semibold">Start Consultation</h2>
                  <p className="text-emerald-100 text-xs font-mono truncate">{consultModal.hospital_number}</p>
                </div>
                <button onClick={() => setConsultModal(null)} disabled={consulting} className="ml-auto p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Begin consultation for <strong className="text-slate-800">{consultModal.full_name}</strong>?
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{visitTypeLabel(consultModal.visit_type)} visit</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${consultBadge(consultModal.consultation_status).cls}`}>{consultBadge(consultModal.consultation_status).label}</span>
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
                <button onClick={() => setConsultBlock(null)} className="ml-auto p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
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
    </div>
  )
}
