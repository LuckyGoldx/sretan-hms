import { Shield } from 'lucide-react'

// Renders how much the insurance paid and how much the patient paid for a
// receipt that was (partly) billed to an insurance case. Returns null for
// ordinary cash receipts. `total_billed` is informational — only the patient
// amount is cash actually collected.
export default function InsuranceReceiptSplit({ receipt }: { receipt: any }) {
  if (!receipt) return null
  const hasSplit = receipt.insurance_amount != null || !!receipt.insurance_provider_name
  if (!hasSplit) return null

  const insurer = Number(receipt.insurance_amount || 0)
  const patient = Number(receipt.patient_amount ?? receipt.co_pay_amount ?? 0)
  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 space-y-1.5">
      <p className="font-semibold flex items-center gap-1.5">
        <Shield size={13} className="flex-shrink-0" /> Billed to {receipt.provider_name || 'insurance'}
        {receipt.case_number ? ` · ${receipt.case_number}` : ''}
      </p>
      <div className="flex justify-between"><span>Insurance paid</span><span className="font-bold">{money(insurer)}</span></div>
      <div className="flex justify-between"><span>Patient paid{receipt.payment_method && receipt.payment_method !== 'insurance' ? ` (${String(receipt.payment_method).toUpperCase()})` : ''}</span><span className="font-bold">{money(patient)}</span></div>
      <div className="flex justify-between border-t border-emerald-200 pt-1.5"><span>Total billed</span><span className="font-bold">{money(insurer + patient)}</span></div>
    </div>
  )
}
