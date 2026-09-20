import api from '../hooks/useAxios'

export interface InsuranceCartLine {
  service_type?: string
  service_id?: string | null
  coverage_item_id?: string | null
  description: string
  quantity: number
  unit_price: number
}

/** Map cart lines to the payload the insurance endpoints expect. */
export function toInsuranceItems(items: InsuranceCartLine[]) {
  return items.map((c) => ({
    service_type: c.service_type || 'billing',
    service_id: c.service_id || null,
    coverage_item_id: c.coverage_item_id || null,
    description: c.description,
    quantity: c.quantity,
    unit_price: c.unit_price,
  }))
}

/**
 * The single active case used for billing. `inWindow` is false when the case's
 * coverage window has passed, in which case the insurer must not be billed.
 */
export async function fetchActiveInsuranceCase(patientId: string): Promise<{ hasActiveCase: boolean; inWindow: boolean; case: any | null }> {
  const res = await api.get(`/insurance/active-case/${patientId}`)
  return {
    hasActiveCase: !!res.data?.hasActiveCase,
    inWindow: res.data?.inWindow !== false,
    case: res.data?.case || null,
  }
}

/** Per-line insurer/patient split from the provider's configured coverage. */
export async function fetchCoverageQuote(patientId: string, items: InsuranceCartLine[]) {
  const res = await api.get('/insurance/coverage-quote', {
    params: { patientId, items: JSON.stringify(toInsuranceItems(items)) },
  })
  return res.data
}

/**
 * Label for a receipt's payment method when insurance is involved:
 *  - 100% covered            -> "INSURANCE"
 *  - part covered + co-pay   -> "INSURANCE + CASH" (or the chosen method)
 *  - no insurance            -> the chosen method
 */
export function insurancePaymentLabel(insuranceAmount: number, patientAmount: number, method?: string): string {
  const ins = Number(insuranceAmount) || 0
  const pat = Number(patientAmount) || 0
  const m = String(method || '').trim().toUpperCase()
  if (ins > 0 && pat > 0) return `INSURANCE + ${m || 'CASH'}`
  if (ins > 0) return 'INSURANCE'
  return m
}

export interface InsuranceBillResult {
  case_id: string
  case_number: string | null
  provider_name: string | null
  insurer_total: number
  patient_total: number
  co_pay_receipt: any
  co_pay_receipt_number: string | null
  receipt_number: string
  case_service_ids: string[]
  items: Array<{ description: string; insurer_amount: number; patient_amount: number; line_total: number; coverage_pct: number }>
}

/**
 * Bills only the insurer share to the case (server-side split when no quote is
 * supplied), then collects any patient co-pay. This is the one flow every
 * paypoint screen should use so the provider shown is the provider billed and
 * the patient portion is never silently dropped.
 */
export async function billToInsuranceAndCollect(opts: {
  patientId: string
  caseId: string
  caseNumber?: string | null
  providerName?: string | null
  items: InsuranceCartLine[]
  quote?: any
  paymentMethod?: string
  createdBy?: string | null
}): Promise<InsuranceBillResult> {
  const { patientId, caseId, caseNumber, providerName, items, quote, paymentMethod, createdBy } = opts

  const mapped = items.map((c, i) => ({
    ...toInsuranceItems([c])[0],
    insurer_amount: quote?.items?.[i]?.insurer_amount,
  }))

  const billRes = await api.post('/insurance/bill-to-insurance', {
    patientId,
    caseId,
    items: mapped,
    source: 'paypoint',
    created_by: createdBy,
  })

  const added: any[] = billRes.data?.added || []
  const insurerTotal = Number(
    billRes.data?.insurer_total ?? added.reduce((s, a) => s + Number(a.total_price || 0), 0)
  )
  const patientTotal = Number(billRes.data?.patient_total ?? 0)

  let coPayReceipt: any = null
  if (patientTotal > 0) {
    // Send the per-line split (patient share, insurer share, full line price)
    // so the co-pay receipt itemises what each item cost and who paid it.
    const pay = await api.post('/insurance/co-pay/pay', {
      patientId,
      caseId,
      amount: patientTotal,
      insurance_amount: insurerTotal,
      provider_name: providerName || null,
      case_number: caseNumber || null,
      paymentMethod: paymentMethod || 'cash',
      items: added
        .map((a) => ({
          description: a.service_name,
          amount: Number(a.patient_amount || 0),
          insurance_amount: Number(a.total_price || 0),
          line_total: Number(a.line_total ?? (Number(a.total_price || 0) + Number(a.patient_amount || 0))),
        }))
        .filter((l) => l.amount > 0 || l.insurance_amount > 0),
    })
    coPayReceipt = pay.data
  }

  return {
    case_id: caseId,
    case_number: caseNumber || null,
    provider_name: providerName || null,
    insurer_total: insurerTotal,
    patient_total: patientTotal,
    co_pay_receipt: coPayReceipt,
    co_pay_receipt_number: coPayReceipt?.receipt_number || null,
    receipt_number: `INS-${caseNumber || caseId}`,
    // Case-service ids, in the same order as the items sent (so a caller can
    // link its own records to the claim lines, e.g. for void/reversal).
    case_service_ids: added.map((a) => a.id),
    items: added.map((a) => ({
      description: a.service_name,
      insurer_amount: Number(a.total_price || 0),
      patient_amount: Number(a.patient_amount || 0),
      line_total: Number(a.line_total ?? (Number(a.total_price || 0) + Number(a.patient_amount || 0))),
      coverage_pct: Number(a.coverage_pct || 0),
    })),
  }
}
