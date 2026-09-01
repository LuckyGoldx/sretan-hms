import { useState } from 'react'
import { X, Building2, Clock, Zap, AlertTriangle, CheckCircle, XCircle, Stethoscope, Printer, FileText } from 'lucide-react'
import { printReferralSlip } from '../utils/printReferral'
import ConsultationReport from './ConsultationReport'
import CollapsibleReason from './CollapsibleReason'

interface ReferralDetailModalProps {
  referral: any
  onClose: () => void
  onCancel?: () => void
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-blue-100 text-blue-700',
  in_consultation: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (priority === 'emergency') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> EMERGENCY</span>
  if (priority === 'urgent') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><Zap className="w-3 h-3" /> URGENT</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold"><Clock className="w-3 h-3" /> ROUTINE</span>
}

function TimelineStep({ label, date, name, done }: { label: string; date?: string | null; name?: string | null; done: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {done ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-slate-800' : 'text-slate-400'}`}>{label}</p>
        {(date || name) && (
          <p className="text-xs text-slate-500">
            {name && <span className="font-medium">{name}</span>}
            {date && <span className="text-slate-400"> · {new Date(date).toLocaleString()}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

export default function ReferralDetailModal({ referral, onClose, onCancel }: ReferralDetailModalProps) {
  const r = referral || {}
  const canCancel = r.status === 'pending'
  const [showReport, setShowReport] = useState(false)

  if (showReport && r.id) {
    return <ConsultationReport referralId={r.id} onClose={() => setShowReport(false)} />
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Referral Detail</h2>
              <p className="text-xs text-slate-400 font-mono">{r.referral_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={r.priority} />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[r.status] || 'bg-slate-100 text-slate-600'}`}>
              {r.status?.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-400">Created {new Date(r.created_at).toLocaleString()}</span>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
              <p className="text-xs text-slate-500 mb-1">Patient</p>
              <p className="font-medium text-slate-800">{r.patient_name || '—'}</p>
              {r.hospital_number && <p className="text-xs text-slate-400 font-mono">{r.hospital_number}</p>}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">To Department</p>
              <p className="font-medium text-slate-700 flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500" /> {r.to_department_name || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Consultant</p>
              <p className="font-medium text-slate-700">{r.to_consultant_name || 'Any in department'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Referred By</p>
              <p className="font-medium text-slate-700">{r.referred_by_name || '—'}</p>
            </div>
            {r.from_department_name && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs text-slate-500 mb-1">From Department</p>
                <p className="font-medium text-slate-700">{r.from_department_name}</p>
              </div>
            )}
          </div>

          {/* Reason */}
          {r.reason && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Referral Reason</p>
              <div className="bg-slate-50 rounded-xl p-3">
                <CollapsibleReason text={r.reason} />
              </div>
            </div>
          )}

          {/* Outcome */}
          {r.outcome_note && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Consultant Outcome</p>
              <p className="text-sm text-slate-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{r.outcome_note}</p>
            </div>
          )}

          {/* Reject note */}
          {r.status === 'rejected' && r.referral_notes && (
            <div>
              <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-1">Rejection Reason</p>
              <p className="text-sm text-slate-700 bg-rose-50 border border-rose-100 rounded-xl p-3">{r.referral_notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Progress</p>
            <div className="space-y-3">
              <TimelineStep label="Referred" date={r.created_at} name={r.referred_by_name} done={!!r.created_at} />
              <TimelineStep label="Accepted" date={r.accepted_at} name={r.accepted_by_name} done={!!r.accepted_at} />
              <TimelineStep label="In Consultation" date={r.accepted_at && !r.completed_at ? r.accepted_at : r.completed_at} name={r.status === 'in_consultation' ? r.accepted_by_name : null} done={r.status === 'in_consultation' || r.status === 'completed'} />
              <TimelineStep label="Completed" date={r.completed_at} name={r.completed_by_name} done={r.status === 'completed'} />
              {(r.status === 'rejected' || r.status === 'cancelled') && (
                <TimelineStep label={r.status === 'rejected' ? 'Rejected' : 'Cancelled'} date={r.completed_at || r.accepted_at} done />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button
            onClick={() => printReferralSlip(r)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          {r.id && (
            <button
              onClick={() => setShowReport(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100"
            >
              <FileText className="w-4 h-4" /> Consultation Report
            </button>
          )}
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100"
            >
              <XCircle className="w-4 h-4" /> Cancel Referral
            </button>
          )}
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
