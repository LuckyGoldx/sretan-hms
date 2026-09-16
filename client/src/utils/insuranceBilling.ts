import api from '../hooks/useAxios'

export interface InsuranceCartLine {
  service_type?: string
  service_id?: string | null
  description: string
  quantity: number
  unit_price: number
}

/** Map cart lines to the payload the insurance endpoints expect. */
export function toInsuranceItems(items: InsuranceCartLine[]) {
  return items.map((c) => ({
    service_type: c.service_type || 'billing',
    service_id: c.service_id || null,
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

export interface InsuranceBillResult {
  case_id: string
  case_number: string | null
  provider_name: string | null
  insurer_total: number
  patient_total: number
  co_pay_receipt: any
  receipt_number: string
  case_service_ids: string[]
  items: Array<{ description: string; insurer_amount: number; patient_amount: number; coverage_pct: number }>
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
    const pay = await api.post('/insurance/co-pay/pay', {
      patientId,
      caseId,
      amount: patientTotal,
      paymentMethod: paymentMethod || 'cash',
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
    receipt_number: `INS-${caseNumber || caseId}`,
    // Case-service ids, in the same order as the items sent (so a caller can
    // link its own records to the claim lines, e.g. for void/reversal).
    case_service_ids: added.map((a) => a.id),
    items: added.map((a) => ({
      description: a.service_name,
      insurer_amount: Number(a.total_price || 0),
      patient_amount: Number(a.patient_amount || 0),
      coverage_pct: Number(a.coverage_pct || 0),
    })),
  }
}
