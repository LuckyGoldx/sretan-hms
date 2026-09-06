import { useState } from 'react'
import { X, Loader2, LogOut, AlertTriangle, CheckCircle, Save } from 'lucide-react'
import api from '../hooks/useAxios'

interface DischargeModalProps {
  admission: any
  onClose: () => void
  onDischarged?: (admission: any) => void
}

export default function DischargeModal({ admission, onClose, onDischarged }: DischargeModalProps) {
  const [summary, setSummary] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const currentUserId: string | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {}
    return null
  })()

  const patientName = admission?.patient_name || admission?.full_name || 'Patient'
  const hospitalNumber = admission?.hospital_number || ''
  const wardName = admission?.ward_name || 'Ward'
  const bedNumber = admission?.bed_number

  async function handleDischarge() {
    if (!summary.trim()) { setError('Please write the discharge summary before confirming.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.put(`/admissions/${admission.id}/discharge`, {
        discharged_by: currentUserId,
        discharge_summary: summary.trim(),
        discharge_instructions: instructions.trim() || null,
      })
      setSuccess(true)
      onDischarged?.(res.data)
      setTimeout(() => onClose(), 900)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to discharge patient. Please try again.')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting && !success) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <LogOut size={18} className="text-rose-500" /> Discharge Patient
          </h2>
          <button onClick={() => { if (!submitting && !success) onClose() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {success ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2"><CheckCircle size={24} className="text-emerald-600" /></div>
              <p className="text-sm font-semibold text-slate-700">Patient discharged successfully</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{patientName}</p>
                    <p className="text-xs text-slate-400 font-mono">{hospitalNumber || admission?.patient_id || ''}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500 space-y-0.5">
                    <p>Ward: <strong className="text-slate-700">{wardName}</strong>{bedNumber ? ` · Bed ${bedNumber}` : ''}</p>
                    <p>Admitted: {admission?.admitted_at ? new Date(admission.admitted_at).toLocaleString() : '—'}</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Summary <span className="text-rose-500">*</span></label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={6}
                  placeholder="Comprehensive summary — reason for admission, hospital course, diagnosis at discharge, condition at discharge, procedures, outcome..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Instructions / Follow-up</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  placeholder="Discharge medications, wound care, diet, activity restrictions, follow-up appointment / review date, danger signs to watch for..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-y"
                />
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button onClick={handleDischarge} disabled={submitting || !summary.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all disabled:opacity-50">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Confirm Discharge
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
