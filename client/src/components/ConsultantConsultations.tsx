import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import ConsultantTag from './ConsultantTag'
import CollapsibleReason from './CollapsibleReason'
import {
  Stethoscope, Loader2, Eye, Clock, Zap, AlertTriangle, ChevronLeft, ChevronRight,
  ScrollText, Building2, Beaker, Pill, Scan, Search, X, CheckCircle,
} from 'lucide-react'

interface ConsultationRecord {
  id: string
  patient_id: string
  patient_name: string
  hospital_number: string
  sex?: string
  dob?: string
  phone?: string
  department_name?: string | null
  staff_name?: string | null
  staff_role?: string | null
  referral_number?: string | null
  referral_priority?: string | null
  referral_status?: string | null
  referral_reason?: string | null
  outcome_note?: string | null
  encounter_type: string
  chief_complaint: string
  soap_notes: any
  diagnoses: any
  notes?: any[]
  created_at: string
}

const PER_PAGE = 30

function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

function ReferralStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null
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

function soapSummary(s: any): string {
  if (!s || typeof s !== 'object') return ''
  const parts: string[] = []
  if (s.subjective) parts.push(s.subjective)
  if (s.assessment) parts.push(s.assessment)
  if (s.plan) parts.push(s.plan)
  if (s.notes) parts.push(s.notes)
  return parts.join(' ')
}

export default function ConsultantConsultations() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<ConsultationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<ConsultationRecord | null>(null)
  const [detailOrders, setDetailOrders] = useState<{ lab: any[]; rad: any[]; rx: any[] }>({ lab: [], rad: [], rx: [] })
  const [ordersLoading, setOrdersLoading] = useState(false)

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/consultants/encounters', { params: { staff_id: currentStaffId } }).catch(() => ({ data: [] }))
      setRecords(res.data || [])
    } catch {} finally { setLoading(false) }
  }, [currentStaffId])

  useEffect(() => { load() }, [load])

  async function openDetail(r: ConsultationRecord) {
    setDetail(r)
    setOrdersLoading(true)
    setDetailOrders({ lab: [], rad: [], rx: [] })
    try {
      const [labRes, radRes, rxRes] = await Promise.all([
        api.get('/lab-orders', { params: { encounter_id: r.id } }).catch(() => ({ data: [] })),
        api.get('/radiology-orders', { params: { encounter_id: r.id } }).catch(() => ({ data: [] })),
        api.get('/prescriptions', { params: { encounter_id: r.id } }).catch(() => ({ data: [] })),
      ])
      setDetailOrders({ lab: labRes.data || [], rad: radRes.data || [], rx: rxRes.data || [] })
    } catch {}
    finally { setOrdersLoading(false) }
  }

  const filtered = records.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.patient_name?.toLowerCase().includes(q) ||
      (r.hospital_number || '').toLowerCase().includes(q) ||
      (r.referral_number || '').toLowerCase().includes(q) ||
      (r.department_name || '').toLowerCase().includes(q) ||
      soapSummary(r.soap_notes).toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  const d = detail
  const soap = d?.soap_notes && typeof d.soap_notes === 'object' ? d.soap_notes : {}
  const diagnoses = Array.isArray(d?.diagnoses) ? d.diagnoses : (typeof d?.diagnoses === 'string' && d.diagnoses ? JSON.parse(d.diagnoses) : [])
  const notesArr = Array.isArray(d?.notes) ? d.notes : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><ScrollText size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">My Consultations</h1>
            <p className="text-sm text-slate-500">All consultations you have recorded as a consultant</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, SOAP, referral #, department..."
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full sm:w-72"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Stethoscope className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No consultations yet</p>
            <p className="text-xs text-slate-400 mt-1">Consultant encounters will be recorded here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Patient</th>
                  <th className="px-5 py-3 font-medium">Referral</th>
                  <th className="px-5 py-3 font-medium">Department</th>
                  <th className="px-5 py-3 font-medium">Clinical Notes</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((r) => {
                  const rSoap = r.soap_notes && typeof r.soap_notes === 'object' ? r.soap_notes : {}
                  const diags = Array.isArray(r.diagnoses) ? r.diagnoses : (typeof r.diagnoses === 'string' && r.diagnoses ? JSON.parse(r.diagnoses) : [])
                  const summary = soapSummary(rSoap) || r.chief_complaint || ''
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.patient_name}</p>
                        <p className="text-xs text-slate-400">{r.hospital_number}{r.sex ? ` · ${r.sex}` : ''}</p>
                      </td>
                      <td className="px-5 py-3">
                        {r.referral_number ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-mono text-slate-600">{r.referral_number}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <PriorityBadge priority={r.referral_priority} />
                              <ReferralStatusBadge status={r.referral_status} />
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {r.department_name ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                            <Building2 className="w-3 h-3" /> {r.department_name}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3 max-w-[260px]">
                        {summary ? (
                          <p className="text-xs text-slate-600 line-clamp-2" title={summary}>{summary}</p>
                        ) : <span className="text-xs text-slate-400">No notes</span>}
                        {diags.length > 0 && (
                          <p className="text-[10px] text-indigo-600 mt-0.5 truncate">{diags.length} diagnosis{diags.length !== 1 ? 'es' : ''}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {r.outcome_note ? (
                          <p className="text-xs text-emerald-700 max-w-[180px] truncate" title={r.outcome_note}>{r.outcome_note}</p>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openDetail(r) }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/patient/${r.patient_id}`) }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100"
                          >
                            <Stethoscope className="w-3 h-3" /> Chart
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-3 pb-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Previous
            </button>
            <span className="text-xs text-slate-500 font-medium">Page {page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {d && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center"><ScrollText className="w-4 h-4 text-indigo-600" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Consultation Detail</h2>
                  <p className="text-xs text-slate-400">{d.patient_name}{d.hospital_number ? ` · ${d.hospital_number}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {d.department_name && <ConsultantTag departmentName={d.department_name} size="sm" />}
                <PriorityBadge priority={d.referral_priority} />
                <ReferralStatusBadge status={d.referral_status} />
                {d.referral_number && <span className="text-xs font-mono text-slate-500">{d.referral_number}</span>}
              </div>

              {/* Referral info */}
              {d.referral_reason && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Referral Reason</p>
                  <CollapsibleReason text={d.referral_reason} />
                </div>
              )}

              {/* Chief complaint */}
              {d.chief_complaint && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{d.chief_complaint}</p>
                </div>
              )}

              {/* SOAP */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SOAP Notes {notesArr.length > 1 ? `(${notesArr.length})` : ''}</p>
                <div className="space-y-3">
                  {(notesArr.length > 0 ? notesArr : [soap]).map((note: any, ni: number) => {
                    const nSoap = typeof note.soap_notes === 'string' ? (() => { try { return JSON.parse(note.soap_notes) } catch { return note } })() : (note.soap_notes || note)
                    const hasContent = nSoap && (nSoap.subjective || nSoap.objective || nSoap.assessment || nSoap.plan || nSoap.notes)
                    if (!hasContent) return null
                    return (
                      <div key={ni} className="border border-slate-200 rounded-xl p-3">
                        {(notesArr.length > 1 || note.created_at) && (
                          <p className="text-[10px] text-slate-400 mb-1.5">
                            {notesArr.length > 1 ? `Note ${ni + 1}` : 'Note'} · {note.staff_name || '—'}
                            {note.created_at ? ` · ${new Date(note.created_at).toLocaleString()}` : ''}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {nSoap.subjective && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[11px] font-bold text-sky-600 uppercase mb-1">Subjective</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.subjective}</p></div>}
                          {nSoap.objective && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[11px] font-bold text-emerald-600 uppercase mb-1">Objective</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.objective}</p></div>}
                          {nSoap.assessment && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[11px] font-bold text-amber-600 uppercase mb-1">Assessment</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.assessment}</p></div>}
                          {nSoap.plan && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[11px] font-bold text-violet-600 uppercase mb-1">Plan</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.plan}</p></div>}
                          {nSoap.notes && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 col-span-full"><p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Additional Notes</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.notes}</p></div>}
                        </div>
                        {Array.isArray(note.diagnoses) && note.diagnoses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {note.diagnoses.map((dx: any, di: number) => (
                              <span key={di} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px]">
                                {dx.code && <span className="font-mono">{dx.code}</span>} {dx.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {notesArr.length === 0 && !(soap.subjective || soap.objective || soap.assessment || soap.plan || soap.notes) && (
                    <p className="text-sm text-slate-400">No SOAP notes recorded.</p>
                  )}
                </div>
              </div>

              {/* Diagnoses */}
              {diagnoses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Diagnoses</p>
                  <div className="flex flex-wrap gap-2">
                    {diagnoses.map((dx: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                        {dx.code && <span className="font-mono">{dx.code}</span>}
                        {dx.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Outcome */}
              {d.outcome_note && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Consultant Outcome</p>
                  <p className="text-sm text-slate-700">{d.outcome_note}</p>
                </div>
              )}

              {/* Orders */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Orders Placed</p>
                {ordersLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading orders...</div>
                ) : (
                  <div className="space-y-3">
                    {detailOrders.lab.length > 0 && (
                      <div className="border border-slate-200 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-purple-600 uppercase mb-1.5 flex items-center gap-1"><Beaker className="w-3 h-3" /> Laboratory ({detailOrders.lab.length})</p>
                        <div className="space-y-1">
                          {detailOrders.lab.map((o) => (
                            <p key={o.id} className="text-xs text-slate-600 flex items-center justify-between gap-2">
                              <span>{o.test_name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailOrders.rad.length > 0 && (
                      <div className="border border-slate-200 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-indigo-600 uppercase mb-1.5 flex items-center gap-1"><Scan className="w-3 h-3" /> Radiology ({detailOrders.rad.length})</p>
                        <div className="space-y-1">
                          {detailOrders.rad.map((o) => (
                            <p key={o.id} className="text-xs text-slate-600 flex items-center justify-between gap-2">
                              <span>{o.imaging_type}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailOrders.rx.length > 0 && (
                      <div className="border border-slate-200 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-violet-600 uppercase mb-1.5 flex items-center gap-1"><Pill className="w-3 h-3" /> Prescriptions ({detailOrders.rx.length})</p>
                        <div className="space-y-1">
                          {detailOrders.rx.map((o) => (
                            <p key={o.id} className="text-xs text-slate-600 flex items-center justify-between gap-2">
                              <span>{o.drug_name}{o.dosage ? ` · ${o.dosage}` : ''}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status || 'pending'}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailOrders.lab.length === 0 && detailOrders.rad.length === 0 && detailOrders.rx.length === 0 && (
                      <p className="text-sm text-slate-400">No orders placed in this consultation.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <button
                onClick={() => navigate(`/patient/${d.patient_id}`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600"
              >
                <Stethoscope className="w-4 h-4" /> Open Patient Chart
              </button>
              <button onClick={() => setDetail(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
