import { useState, useEffect } from 'react'
import { X, Loader2, LogOut, AlertTriangle, CheckCircle, Save, Receipt, ShieldAlert, BadgeCheck, Send } from 'lucide-react'
import api from '../hooks/useAxios'

interface DischargeModalProps {
  admission: any
  onClose: () => void
  onDischarged?: (admission: any) => void
  onRequested?: (admission: any) => void
}

export default function DischargeModal({ admission, onClose, onDischarged, onRequested }: DischargeModalProps) {
  const [summary, setSummary] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [balance, setBalance] = useState<any | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [override, setOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const currentUser = (() => {
    try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch {}
    return null
  })()
  const currentUserId: string | null = currentUser?.id || null
  const isAdmin = currentUser?.role === 'Admin'

  const patientName = admission?.patient_name || admission?.full_name || 'Patient'
  const hospitalNumber = admission?.hospital_number || ''
  const wardName = admission?.ward_name || 'Ward'
  const bedNumber = admission?.bed_number

  useEffect(() => {
    let alive = true
    async function loadBalance() {
      if (!admission?.id) { setLoadingBalance(false); return }
      setLoadingBalance(true)
      try {
        const res = await api.get(`/admissions/${admission.id}/balance`)
        if (alive) setBalance(res.data)
      } catch { if (alive) setBalance(null) } finally { if (alive) setLoadingBalance(false) }
    }
    loadBalance()
    return () => { alive = false }
  }, [admission?.id])

  const isBlocked = !!balance && balance.can_discharge === false
  const isInsuredClear = !!balance && balance.insured === true && !isBlocked
  const needsOverride = isBlocked
  const overrideReady = !needsOverride || (isAdmin && override && overrideReason.trim().length > 0)
  const canSubmit = summary.trim().length > 0 && overrideReady && !loadingBalance

  async function handleDischarge() {
    if (!summary.trim()) { setError('Please write the discharge summary before confirming.'); return }
    if (needsOverride && !overrideReady) {
      setError(isAdmin ? 'Tick the override and give a reason to discharge with an outstanding balance.' : 'Outstanding balance must be settled at Paypoint before discharge.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.put(`/admissions/${admission.id}/discharge`, {
        discharged_by: currentUserId,
        discharge_summary: summary.trim(),
        discharge_instructions: instructions.trim() || null,
        override: needsOverride && override,
        override_reason: needsOverride && override ? overrideReason.trim() : null,
      })
      setSuccess('Patient discharged successfully')
      onDischarged?.(res.data)
      setTimeout(() => onClose(), 900)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to discharge patient. Please try again.'
      setError(msg)
      if (err?.response?.status === 402) {
        try { const r = await api.get(`/admissions/${admission.id}/balance`); setBalance(r.data) } catch {}
      }
    } finally { setSubmitting(false) }
  }

  // Blocked patient: save the summary and hand the admission to Finance.
  async function handleRequest() {
    if (!summary.trim()) { setError('Please write the discharge summary before submitting.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post(`/admissions/${admission.id}/request-discharge`, {
        discharged_by: currentUserId,
        discharge_summary: summary.trim(),
        discharge_instructions: instructions.trim() || null,
      })
      setSuccess('Discharge submitted for financial clearance')
      onRequested?.(res.data?.admission)
      setTimeout(() => onClose(), 1000)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit for clearance.')
    } finally { setSubmitting(false) }
  }

  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting && !success) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
              <p className="text-sm font-semibold text-slate-700">{success}</p>
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

              {/* Financial clearance */}
              {loadingBalance ? (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Checking outstanding balance…</div>
              ) : balance ? (
                <div className={`rounded-xl border px-4 py-3 ${isBlocked ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className={`text-sm font-semibold flex items-center gap-1.5 ${isBlocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {isBlocked ? <ShieldAlert size={15} /> : <BadgeCheck size={15} />}
                      {isBlocked ? 'Outstanding balance — settle before discharge' : (isInsuredClear ? 'Approved payer — discharge allowed' : 'No outstanding balance')}
                    </p>
                    {!isBlocked && balance.insured && <span className="text-xs text-emerald-700">Insured: {balance.insurance_provider || '—'}</span>}
                    {isBlocked && <span className="text-sm font-bold text-rose-700">{money(balance.outstanding)}</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-slate-500">Charges: <strong className="text-slate-700">{money(balance.charges_total)}</strong></span>
                    {balance.deposits_held > 0 && <span className="text-slate-500">Deposits paid: <strong className="text-emerald-700">{money(balance.deposits_held)}</strong></span>}
                    <span className={isBlocked ? 'text-rose-600' : 'text-emerald-600'}>Outstanding: <strong>{money(balance.outstanding)}</strong></span>
                  </div>

                  {isBlocked && balance.items?.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white/70 border border-rose-100 divide-y divide-rose-50">
                      {balance.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-600">
                          <span className="truncate pr-3 flex items-center gap-1.5"><Receipt size={11} className="text-slate-300 flex-shrink-0" />{it.description}</span>
                          <span className="font-medium text-slate-700 whitespace-nowrap">{money(it.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isBlocked && (
                    <p className="mt-2 text-[11px] text-rose-600">Submit this discharge for clearance — Finance will collect the balance from the patient. {isAdmin ? 'Administrators may also override.' : ''}</p>
                  )}
                  {!isBlocked && balance.insured && (
                    <p className="mt-1 text-[11px] text-emerald-600">Charges will be claimed from {balance.insurance_provider || 'the insurer'}.</p>
                  )}
                </div>
              ) : null}

              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {isBlocked && isAdmin && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-amber-800">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="rounded border-amber-300" />
                    Override balance (administrator only)
                  </label>
                  {override && (
                    <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2}
                      placeholder="Reason for override — LAMA/absconding risk accepted, emergency, waiver…"
                      className="w-full rounded-lg border border-amber-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-400 resize-y" />
                  )}
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
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-wrap">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>

            {!isBlocked && (
              <button onClick={handleDischarge} disabled={submitting || !canSubmit}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Confirm Discharge
              </button>
            )}

            {isBlocked && (
              <>
                {isAdmin && override && (
                  <button onClick={handleDischarge} disabled={submitting || !overrideReady}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all disabled:opacity-50">
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                    Override &amp; Discharge
                  </button>
                )}
                <button onClick={handleRequest} disabled={submitting || !summary.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50">
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Submit for Clearance
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
