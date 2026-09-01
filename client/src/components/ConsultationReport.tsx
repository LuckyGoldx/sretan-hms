import { useState, useEffect } from 'react'
import { X, Loader2, Stethoscope, Building2, Beaker, Pill, Scan, AlertTriangle, Zap, Clock, CheckCircle, FileText } from 'lucide-react'
import api from '../hooks/useAxios'
import CollapsibleReason from './CollapsibleReason'

interface ReportData {
  referral: any
  encounters: any[]
  lab_orders: any[]
  radiology_orders: any[]
  prescriptions: any[]
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

export default function ConsultationReport({ referralId, onClose }: { referralId: string; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/referrals/${referralId}/consultation-report`)
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load consultation report'))
      .finally(() => setLoading(false))
  }, [referralId])

  const statusStyle =
    data?.referral?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
    data?.referral?.status === 'in_consultation' ? 'bg-violet-100 text-violet-700' :
    data?.referral?.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
    data?.referral?.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
    'bg-amber-100 text-amber-700'

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Consultation Report</h2>
              <p className="text-xs text-slate-500 font-mono">{data?.referral?.referral_number || ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={32} className="animate-spin text-primary" /></div>
          ) : error ? (
            <p className="text-sm text-rose-500 text-center py-10">{error}</p>
          ) : data ? (
            <>
              {/* Referral summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityBadge priority={data.referral?.priority} />
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusStyle}`}>
                  {data.referral?.status?.replace('_', ' ') || '—'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium">
                  <Building2 className="w-3 h-3" /> {data.referral?.to_department_name || '—'}
                </span>
              </div>

              {/* Patient + referral info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="font-medium text-slate-800">{data.referral?.patient_name || '—'}</p>
                  {data.referral?.hospital_number && <p className="text-xs text-slate-400 font-mono">{data.referral.hospital_number}</p>}
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Referred By</p>
                  <p className="font-medium text-slate-700">{data.referral?.referred_by_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Accepted By</p>
                  <p className="font-medium text-emerald-700">{data.referral?.accepted_by_name || '—'}</p>
                </div>
                {data.referral?.reason && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Referral Reason</p>
                    <CollapsibleReason text={data.referral.reason} />
                  </div>
                )}
                {data.referral?.outcome_note && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 col-span-2">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Consultant Outcome</p>
                    <p className="text-sm text-slate-700">{data.referral.outcome_note}</p>
                  </div>
                )}
              </div>

              {/* Consultant encounters + SOAP */}
              {data.encounters.length > 0 ? (
                data.encounters.map((enc) => {
                  const soap = enc.soap_notes && typeof enc.soap_notes === 'object' ? enc.soap_notes : {}
                  const diags = Array.isArray(enc.diagnoses) ? enc.diagnoses : (typeof enc.diagnoses === 'string' && enc.diagnoses ? JSON.parse(enc.diagnoses) : [])
                  return (
                    <div key={enc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2.5 flex-wrap">
                        <Stethoscope className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">Consultation by {enc.staff_name || 'Consultant'}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{enc.department_name || '—'}</span>
                        <span className="text-xs text-slate-400 ml-auto">{new Date(enc.created_at).toLocaleString()}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {enc.chief_complaint && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Chief Complaint</p>
                            <p className="text-sm text-slate-700">{enc.chief_complaint}</p>
                          </div>
                        )}
                        {(() => {
                          const notesArr = Array.isArray(enc.notes) ? enc.notes : []
                          const soapFallback = enc.soap_notes && typeof enc.soap_notes === 'object' ? enc.soap_notes : {}
                          return (
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold text-slate-500 uppercase">SOAP Notes {notesArr.length > 1 ? `(${notesArr.length})` : ''}</p>
                              {(notesArr.length > 0 ? notesArr : [soapFallback]).map((note: any, ni: number) => {
                                const nSoap = typeof note.soap_notes === 'string' ? (() => { try { return JSON.parse(note.soap_notes) } catch { return note } })() : (note.soap_notes || note)
                                const hasContent = nSoap && (nSoap.subjective || nSoap.objective || nSoap.assessment || nSoap.plan || nSoap.notes)
                                if (!hasContent) return null
                                return (
                                  <div key={ni} className="border border-slate-200 rounded-lg p-3">
                                    {(notesArr.length > 1 || note.created_at) && (
                                      <p className="text-[10px] text-slate-400 mb-1">
                                        {notesArr.length > 1 ? `Note ${ni + 1}` : 'Note'} · {note.staff_name || '—'}
                                        {note.created_at ? ` · ${new Date(note.created_at).toLocaleString()}` : ''}
                                      </p>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {nSoap.subjective && <div className="bg-slate-50 rounded-lg p-3"><p className="text-[11px] font-bold text-sky-600 uppercase mb-1">Subjective</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.subjective}</p></div>}
                                      {nSoap.objective && <div className="bg-slate-50 rounded-lg p-3"><p className="text-[11px] font-bold text-emerald-600 uppercase mb-1">Objective</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.objective}</p></div>}
                                      {nSoap.assessment && <div className="bg-slate-50 rounded-lg p-3"><p className="text-[11px] font-bold text-amber-600 uppercase mb-1">Assessment</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.assessment}</p></div>}
                                      {nSoap.plan && <div className="bg-slate-50 rounded-lg p-3"><p className="text-[11px] font-bold text-violet-600 uppercase mb-1">Plan</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.plan}</p></div>}
                                      {nSoap.notes && <div className="bg-slate-50 rounded-lg p-3 col-span-full"><p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Additional Notes</p><p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{nSoap.notes}</p></div>}
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
                            </div>
                          )
                        })()}
                        {diags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {diags.map((dx: any, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                                {dx.code && <span className="font-mono">{dx.code}</span>} {dx.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-slate-400">No consultant encounter recorded for this referral.</p>
              )}

              {/* Orders */}
              <div className="grid grid-cols-1 gap-3">
                {data.lab_orders.length > 0 && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-purple-600 uppercase mb-2 flex items-center gap-1"><Beaker className="w-3 h-3" /> Laboratory Orders ({data.lab_orders.length})</p>
                    <div className="space-y-1.5">
                      {data.lab_orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700">{o.test_name}</span>
                          <div className="flex items-center gap-2">
                            {o.doctor_comment && <span className="text-slate-400 max-w-[200px] truncate" title={o.doctor_comment}>{o.doctor_comment}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.radiology_orders.length > 0 && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1"><Scan className="w-3 h-3" /> Radiology Orders ({data.radiology_orders.length})</p>
                    <div className="space-y-1.5">
                      {data.radiology_orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700">{o.imaging_type}</span>
                          <div className="flex items-center gap-2">
                            {o.doctor_comment && <span className="text-slate-400 max-w-[200px] truncate" title={o.doctor_comment}>{o.doctor_comment}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.prescriptions.length > 0 && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-violet-600 uppercase mb-2 flex items-center gap-1"><Pill className="w-3 h-3" /> Prescriptions ({data.prescriptions.length})</p>
                    <div className="space-y-1.5">
                      {data.prescriptions.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700">{o.drug_name}{o.dosage ? ` · ${o.dosage}` : ''}</span>
                          <div className="flex items-center gap-2">
                            {o.instructions && <span className="text-slate-400 max-w-[220px] truncate" title={o.instructions}>{o.instructions}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.status || 'pending'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.lab_orders.length === 0 && data.radiology_orders.length === 0 && data.prescriptions.length === 0 && (
                  <p className="text-sm text-slate-400">No orders were placed by the consultant.</p>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
