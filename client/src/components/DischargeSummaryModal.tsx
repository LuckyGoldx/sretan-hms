import { X, LogOut, ScrollText, Stethoscope, Clock } from 'lucide-react'

interface DischargeSummaryModalProps {
  admission: any
  onClose: () => void
}

function textBlock(value?: string | null): string {
  if (!value || !value.trim()) return ''
  return value.trim()
}

export default function DischargeSummaryModal({ admission, onClose }: DischargeSummaryModalProps) {
  const patientName = admission?.patient_name || admission?.full_name || 'Patient'
  const hospitalNumber = admission?.hospital_number || ''
  const summary = textBlock(admission?.discharge_summary)
  const instructions = textBlock(admission?.discharge_instructions)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/60">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <ScrollText size={18} className="text-rose-500" /> Discharge Summary
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-slate-800">{patientName}</p>
                <p className="text-xs text-slate-400 font-mono">{hospitalNumber || admission?.patient_id || ''}</p>
              </div>
              <div className="text-right text-xs text-slate-500 space-y-0.5">
                <p>Ward: <strong className="text-slate-700">{admission?.ward_name || '—'}</strong>{admission?.bed_number ? ` · Bed ${admission.bed_number}` : ''}</p>
                <p className="flex items-center gap-1 justify-end"><Clock size={11} />Admitted: {admission?.admitted_at ? new Date(admission.admitted_at).toLocaleString() : '—'}</p>
                {admission?.discharged_at && (
                  <p className="flex items-center gap-1 justify-end text-emerald-700"><LogOut size={11} />Discharged: {new Date(admission.discharged_at).toLocaleString()}</p>
                )}
              </div>
            </div>
            {admission?.discharged_by_name && (
              <p className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <Stethoscope size={12} className="text-rose-500" /> Discharged by <strong className="text-slate-700">{admission.discharged_by_name}</strong>
              </p>
            )}
          </div>

          {!summary && !instructions && (
            <div className="text-center py-8 text-slate-400 text-sm">No discharge summary was recorded for this admission.</div>
          )}

          {summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Discharge Summary</p>
              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {summary}
              </div>
            </div>
          )}

          {instructions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Discharge Instructions / Follow-up</p>
              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {instructions}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-all">Close</button>
        </div>
      </div>
    </div>
  )
}
