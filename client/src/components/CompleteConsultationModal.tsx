import { useState, useEffect } from 'react'
import {
  ClipboardCheck, X, Loader2, AlertTriangle, CheckCircle, Building2, Pill, Beaker, Scan,
  Stethoscope, User,
} from 'lucide-react'
import api from '../hooks/useAxios'

interface CompleteConsultationModalProps {
  referral: any
  patientName?: string
  hospitalNumber?: string
  labCount: number
  radiologyCount: number
  prescriptionCount: number
  defaultOutcome?: string
  onClose: () => void
  onCompleted?: () => void
}

export default function CompleteConsultationModal({
  referral, patientName, hospitalNumber,
  labCount, radiologyCount, prescriptionCount,
  defaultOutcome, onClose, onCompleted,
}: CompleteConsultationModalProps) {
  const [outcome, setOutcome] = useState(defaultOutcome || '')
  const [submitting, setSubmitting] = useState(false)

  const currentStaffId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  async function confirmComplete() {
    if (!referral?.id) return
    setSubmitting(true)
    try {
      await api.put(`/referrals/${referral.id}/complete`, {
        performed_by: currentStaffId,
        outcome_note: outcome.trim() || undefined,
      })
      onCompleted?.()
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to complete consultation')
      setSubmitting(false)
    }
  }

  const priorityStyle =
    referral?.priority === 'emergency' ? 'bg-rose-100 text-rose-700 border-rose-200' :
    referral?.priority === 'urgent' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-sky-100 text-sky-700 border-sky-200'

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { if (!submitting) onClose() }}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Complete Consultation</h2>
              <p className="text-xs text-slate-500">Close referral {referral?.referral_number || ''}</p>
            </div>
          </div>
          <button onClick={() => { if (!submitting) onClose() }} className="p-1.5 rounded-lg hover:bg-black/5 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Patient + referral summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{patientName || 'Patient'}</p>
                {hospitalNumber && <p className="text-xs text-slate-400 font-mono">{hospitalNumber}</p>}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Department</p>
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Building2 size={14} className="text-indigo-500" /> {referral?.to_department_name || '—'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Priority</p>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${priorityStyle}`}>
                {referral?.priority || 'routine'}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
              <p className="text-xs text-slate-500 mb-1">Referred by</p>
              <p className="text-sm font-medium text-slate-700">{referral?.referred_by_name || '—'}</p>
            </div>
          </div>

          {/* Order counts */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Orders placed this consultation</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <Beaker className="w-4 h-4 mx-auto mb-1 text-purple-500" />
                <p className="text-lg font-bold text-slate-800">{labCount}</p>
                <p className="text-[10px] text-slate-500">Lab</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <Scan className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                <p className="text-lg font-bold text-slate-800">{radiologyCount}</p>
                <p className="text-[10px] text-slate-500">Radiology</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <Pill className="w-4 h-4 mx-auto mb-1 text-violet-500" />
                <p className="text-lg font-bold text-slate-800">{prescriptionCount}</p>
                <p className="text-[10px] text-slate-500">Prescriptions</p>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Closing this referral returns the patient to the referring doctor (<strong>{referral?.referred_by_name || 'the GP'}</strong>)
              and removes them from your consultation queue. The referring doctor will be notified.
            </p>
          </div>

          {/* Outcome note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Outcome Summary <span className="text-slate-400 font-normal">(recommended)</span></label>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={3}
              placeholder="e.g. Patient evaluated and treated; diagnosis made; follow-up planned..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirmComplete}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {submitting ? 'Completing...' : 'Confirm Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
