// Standard hospital header + receipt/report print helpers shared across the system.
import { getClinicInfo } from './clinicInfo'

export const HOSPITAL_NAME = 'MACHOKO MEMORIAL HOSPITAL'
export const HOSPITAL_ADDRESS = 'Machoko Diamond Plaza, Mile 6 Road Bye-Pass, Jalingo, Taraba State'

// The configured clinic branding (from /api/setup/status, cached by clinicInfo)
// always wins; the constants above are only a fallback when branding has not
// loaded at all. A deliberately blank configured value stays blank so one
// hospital's details never leak into another's printables.
function brandValue(key: 'hospital_name' | 'address' | 'phone_number', fallback: string): string {
  const info = getClinicInfo()
  if (!info || Object.keys(info).length === 0) return fallback
  const v = (info as any)[key]
  return v === undefined || v === null ? fallback : String(v)
}

export function hospitalName(): string {
  return brandValue('hospital_name', HOSPITAL_NAME)
}

export function hospitalAddress(): string {
  return brandValue('address', HOSPITAL_ADDRESS)
}

export function hospitalContacts(): string {
  // Deliberately no fallback: a hospital's phone numbers come only from its own
  // configuration. If none are set, the Tel line stays blank.
  return brandValue('phone_number', '')
}

// Absolute URL so the logo resolves inside print popups (about:blank).
export function hospitalLogoUrl(): string | null {
  const raw = getClinicInfo().logo_url
  if (!raw) return null
  if (/^(https?:|data:)/i.test(raw)) return raw
  try { return new URL(raw, window.location.origin).href } catch { return raw }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}

export function generateReceiptNumber(prefix = 'RCP'): string {
  const d = new Date()
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${ymd}-${rand}`
}

// Compact 72mm receipt header
export function receiptHeaderHtml(): string {
  const logo = hospitalLogoUrl()
  return `
    <div style="text-align:center;padding-bottom:8px;border-bottom:2px dashed #cbd5e1">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="max-height:44px;max-width:78%;margin:0 auto 4px;display:block" />` : ''}
      <div style="font-size:15px;font-weight:700">${escapeHtml(hospitalName())}</div>
      <div style="font-size:10px;color:#64748b">${escapeHtml(hospitalAddress())}</div>
      <div style="font-size:10px;color:#64748b">Tel: ${escapeHtml(hospitalContacts())}</div>
    </div>`
}

// Full A4 report header
export function reportHeaderHtml(): string {
  const logo = hospitalLogoUrl()
  return `
    <div style="text-align:center;padding-bottom:12px;border-bottom:3px solid #0f766e;margin-bottom:16px">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="max-height:64px;max-width:260px;margin:0 auto 6px;display:block" />` : ''}
      <div style="font-size:20px;font-weight:800;color:#0f766e;letter-spacing:0.5px">${escapeHtml(hospitalName())}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(hospitalAddress())}</div>
      <div style="font-size:12px;color:#64748b">Tel: ${escapeHtml(hospitalContacts())}</div>
    </div>`
}

export interface ReceiptLine {
  item: string
  quantity: number | string
  price: number | string
  total: number | string
}

export interface ReceiptData {
  receiptNumber: string
  date: string
  time: string
  title?: string
  staff?: string
  customer?: string
  paymentMethod?: string
  lines: ReceiptLine[]
  discount?: number
  total: number
  notes?: string
}

export function buildReceiptHtml(data: ReceiptData): string {
  const fmt = (n: number) => '₦' + (Number.isFinite(n) ? n.toFixed(2) : '0.00')
  const lineTotal = (l: ReceiptLine) => Number(l.total) || (Number(l.price) * Number(l.quantity)) || 0
  const linesHtml = data.lines.length
    ? data.lines.map((l) => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px">
        <span style="flex:1;padding-right:8px">${escapeHtml(l.item)}</span>
        <span style="width:44px;text-align:right">${escapeHtml(l.quantity)}</span>
        <span style="width:96px;text-align:right;font-weight:600">${fmt(lineTotal(l))}</span>
      </div>`).join('')
    : `<div style="text-align:center;color:#64748b;font-size:12px;padding:6px 0">No items</div>`

  return `<!DOCTYPE html><html><head><title>Receipt ${escapeHtml(data.receiptNumber)}</title>
  <style>@page { margin: 0; } body { width: 72mm; }</style></head>
  <body style="font-family:monospace;width:72mm;margin:0 auto;padding:8px 6px;color:#0f172a;font-size:12px">
    ${receiptHeaderHtml()}
    <div style="text-align:center;padding:6px 0;font-size:13px;font-weight:700">${escapeHtml(data.title || 'RECEIPT')}</div>
    <div style="font-size:11px;color:#334155">
      <div>Receipt No: ${escapeHtml(data.receiptNumber)}</div>
      <div>Date: ${escapeHtml(data.date)} ${escapeHtml(data.time)}</div>
      ${data.staff ? `<div>Staff: ${escapeHtml(data.staff)}</div>` : ''}
      ${data.customer ? `<div>Customer: ${escapeHtml(data.customer)}</div>` : ''}
      ${data.paymentMethod ? `<div>Payment Method: ${escapeHtml(data.paymentMethod)}</div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1;padding:4px 0;font-size:11px;font-weight:700;margin-top:6px">
      <span style="flex:1">Item</span><span style="width:44px;text-align:right">Qty</span><span style="width:96px;text-align:right">Price</span>
    </div>
    ${linesHtml}
    ${(data.discount || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>Discount</span><span>-${fmt(Number(data.discount))}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px dashed #cbd5e1;font-size:15px;font-weight:700">
      <span>TOTAL</span><span>${fmt(Number(data.total))}</span>
    </div>
    ${data.notes ? `<div style="padding-top:4px;font-size:10px;color:#64748b">${escapeHtml(data.notes)}</div>` : ''}
    <div style="text-align:center;font-size:9px;color:#94a3b8;padding-top:10px">Thank you for choosing ${escapeHtml(hospitalName())}</div>
    <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},250)})<\/script>
  </body></html>`
}

// Open a print popup and write HTML. Returns the window or null if blocked.
export function openPrint(html: string, width = 300, height = 640): Window | null {
  const win = window.open('', '_blank', `width=${width},height=${height}`)
  if (!win) return null
  win.document.write(html)
  win.document.close()
  return win
}

export function receiptDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function receiptTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

// Print a standardized receipt from a payment/receipt object
// (shape of the POST /api/payments response used by Paypoint/Billing modals).
export function printPaymentReceipt(r: any): Window | null {
  if (!r) return null
  const d = r.created_at ? new Date(r.created_at) : new Date()
  const customer = r.patient_name || r.walkin_name || 'Walk-in Customer'
  const lines: ReceiptLine[] = (r.items || []).map((it: any) => ({
    item: it.description || it.service_name || 'Item',
    quantity: it.quantity || 1,
    price: Number(it.unit_price) || Number(it.total_price) || 0,
    total: Number(it.line_total) || Number(it.total_price) || (Number(it.unit_price) * (it.quantity || 1)) || 0,
  }))
  if (lines.length === 0) {
    lines.push({ item: 'Payment', quantity: 1, price: Number(r.total_amount) || 0, total: Number(r.total_amount) || 0 })
  }
  // Insurance receipts print the provider and the insurer/patient split so the
  // patient can see what the insurance covered and what they paid.
  const insurer = Number(r.insurance_amount || 0)
  const patient = Number(r.patient_amount ?? r.total_amount ?? 0)
  const provider = r.provider_name || r.insurance_provider_name
  const caseRef = r.case_number || r.insurance_case_number
  const isInsurance = r.insurance_amount != null || !!provider
  const fmtMoney = (n: number) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const splitNote = isInsurance
    ? `Billed to ${provider || 'insurance'}${caseRef ? ' · ' + caseRef : ''} | Insurance paid ${fmtMoney(insurer)} | Patient paid ${fmtMoney(patient)} | Total billed ${fmtMoney(insurer + patient)}`
    : ''
  const notesText = [r.notes, splitNote].filter(Boolean).join(' | ')
  // Prefer an explicit display label; otherwise derive one from the split so a
  // 100%-insured receipt reads "INSURANCE" and a co-pay reads
  // "INSURANCE + CASH" (or the chosen method).
  let methodLabel = r.payment_label ? String(r.payment_label).toUpperCase() : ''
  if (!methodLabel) {
    methodLabel = isInsurance
      ? (insurer > 0 && patient > 0 ? `INSURANCE + ${String(r.payment_method || 'cash').toUpperCase()}` : 'INSURANCE')
      : (r.payment_method ? String(r.payment_method).toUpperCase() : '')
  }
  const html = buildReceiptHtml({
    receiptNumber: r.receipt_number || generateReceiptNumber(),
    date: receiptDate(d),
    time: receiptTime(d),
    staff: r.staff_name || '',
    customer,
    paymentMethod: methodLabel,
    lines,
    total: Number(r.total_amount) || lines.reduce((s, l) => s + Number(l.total), 0),
    notes: notesText,
  })
  return openPrint(html)
}

// Print a deposit receipt: labelled "DEPOSIT RECEIPT", itemising the bills the
// deposit settled (coveredItems from deposit_applications).
export function printDepositReceipt(r: any, coveredItems?: any[]): Window | null {
  if (!r) return null
  const d = r.created_at ? new Date(r.created_at) : new Date()
  const customer = r.patient_name || r.walkin_name || 'Patient'
  const src = (coveredItems && coveredItems.length > 0)
    ? coveredItems.map((it: any) => ({ item: it.description || 'Item', quantity: 1, price: Number(it.amount) || 0, total: Number(it.amount) || 0 }))
    : [{ item: 'Deposit on account', quantity: 1, price: Number(r.total_amount) || 0, total: Number(r.total_amount) || 0 }]
  const html = buildReceiptHtml({
    title: 'DEPOSIT RECEIPT',
    receiptNumber: r.receipt_number || generateReceiptNumber(),
    date: receiptDate(d),
    time: receiptTime(d),
    staff: r.staff_name || '',
    customer,
    paymentMethod: r.payment_method ? String(r.payment_method).toUpperCase() : '',
    lines: src,
    total: Number(r.total_amount) || src.reduce((s, l) => s + Number(l.total), 0),
    notes: 'Advance deposit received. The items above are the bills this deposit settled; any remaining credit stays on account.',
  })
  return openPrint(html)
}

// Print the maternity register (Records): a table of the current list.
export function printMaternityRegister(rows: any[], meta?: { subtitle?: string }): Window | null {
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const body = (rows || []).map((p) => `
    <tr>
      <td>${escapeHtml(p.full_name || '')}<br/><span class="muted">${escapeHtml(p.hospital_number || '')}</span></td>
      <td>${escapeHtml(p.phone || '—')}</td>
      <td>${escapeHtml(p.booking_code || '—')}</td>
      <td>${escapeHtml(fmtDate(p.edd))}</td>
      <td>${escapeHtml(`G${p.gravida ?? '-'} P${p.para ?? '-'}`)}</td>
      <td>${escapeHtml(String(p.risk_level || '—'))}</td>
      <td>${escapeHtml(String(p.status || '—'))}</td>
      <td>${escapeHtml(fmtDate(p.next_appointment_date))}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Maternity Register</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }
    h1 { font-size: 14px; text-transform: uppercase; letter-spacing: .8px; text-align: center; margin: 10px 0 4px; }
    .sub { text-align: center; color: #64748b; font-size: 10px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; }
    .muted { color: #94a3b8; font-size: 9px; }
    .foot { margin-top: 12px; color: #94a3b8; font-size: 9px; display: flex; justify-content: space-between; }
  </style></head><body>
    ${reportHeaderHtml()}
    <h1>Maternity Register</h1>
    <div class="sub">${escapeHtml(meta?.subtitle || '')}${meta?.subtitle ? ' · ' : ''}Printed ${escapeHtml(new Date().toLocaleString())} · ${rows.length} record${rows.length !== 1 ? 's' : ''}</div>
    <table>
      <thead><tr><th>Patient</th><th>Phone</th><th>Booking Code</th><th>EDD</th><th>G/P</th><th>Risk</th><th>Status</th><th>Next Visit</th></tr></thead>
      <tbody>${body || '<tr><td colspan="8" style="text-align:center;color:#94a3b8">No records</td></tr>'}</tbody>
    </table>
    <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},300)})<\/script>
  </body></html>`
  return openPrint(html, 1000, 720)
}

// Print a single maternity registration record (Records slip).
export function printMaternityRecord(p: any): Window | null {
  if (!p) return null
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const ga = p.lmp ? `${Math.max(0, Math.floor((Date.now() - new Date(p.lmp).getTime()) / (7 * 24 * 60 * 60 * 1000)))} weeks` : '—'
  const row = (label: string, value: any) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value == null || value === '' ? '—' : String(value))}</td></tr>`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Maternity Record</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12px; }
    h1 { font-size: 14px; text-transform: uppercase; letter-spacing: .8px; text-align: center; margin: 10px 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    td { border: 1px solid #cbd5e1; padding: 6px 9px; }
    .label { color: #64748b; width: 32%; font-size: 11px; }
    .foot { margin-top: 18px; color: #94a3b8; font-size: 9px; text-align: right; }
  </style></head><body>
    ${reportHeaderHtml()}
    <h1>Maternity Registration Record</h1>
    <table>
      ${row('Patient', p.full_name)}
      ${row('Hospital Number', p.hospital_number)}
      ${row('Phone', p.phone)}
      ${row('Booking Code', p.booking_code)}
      ${row('LMP', fmtDate(p.lmp))}
      ${row('EDD', fmtDate(p.edd))}
      ${row('Gestational Age', ga)}
      ${row('Gravida / Para', `G${p.gravida ?? '-'} P${p.para ?? '-'}`)}
      ${row('Blood Group / Genotype', `${p.blood_group || '—'} / ${p.genotype || '—'}`)}
      ${row('Risk Level', p.risk_level)}
      ${row('Status', p.status)}
      ${row('Next Appointment', fmtDate(p.next_appointment_date))}
    </table>
    <div class="foot">Printed ${escapeHtml(new Date().toLocaleString())}</div>
    <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},300)})<\/script>
  </body></html>`
  return openPrint(html, 820, 700)
}

// Print a radiology report with the hospital header (heading/address/contact only).
export function printRadiologyReport(d: any): Window | null {
  if (!d) return null
  const reported = d.reported_at ? new Date(d.reported_at) : null
  const created = d.created_at ? new Date(d.created_at) : null
  const imageHtml = d.image_path
    ? `<div style="margin-top:14px">
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#64748b;margin:0 0 6px">Attached Image</h3>
        <img src="${escapeHtml(d.image_path)}" style="max-width:100%;max-height:320px;border:1px solid #e2e8f0;border-radius:8px" />
       </div>`
    : ''
  const html = `<!DOCTYPE html><html><head><title>Radiology Report ${escapeHtml(d.imaging_number || '')}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1e293b; font-size: 13px; }
    h2 { font-size: 18px; margin: 0 0 16px; color: #0f172a; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 14px 0 20px; }
    .info-grid .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
    .info-grid .value { font-weight: 600; color: #0f172a; font-size: 14px; }
    .report { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 8px; white-space: pre-wrap; min-height: 80px; }
    .sign { display: flex; justify-content: space-between; margin-top: 42px; padding-top: 12px; }
    .sign-line { text-align: center; width: 38%; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 11px; color: #64748b; }
    .foot { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 10px; }
    @media print { body { margin: 20px; } }
  </style></head><body>
    ${reportHeaderHtml()}
    <h2>RADIOLOGY REPORT</h2>
    <div class="info-grid">
      <div><div class="label">Patient</div><div class="value">${escapeHtml(d.patient_name || 'Walk-in Patient')}</div></div>
      <div><div class="label">Imaging No.</div><div class="value">${escapeHtml(d.imaging_number || '—')}</div></div>
      <div><div class="label">Imaging Type</div><div class="value">${escapeHtml(d.imaging_type || '—')}</div></div>
      <div><div class="label">Ordered By</div><div class="value">${escapeHtml(d.doctor_name || '—')}</div></div>
      <div><div class="label">Ordered On</div><div class="value">${created ? escapeHtml(created.toLocaleString()) : '—'}</div></div>
      <div><div class="label">Reported By</div><div class="value">${escapeHtml(d.reported_by_name || '—')}</div></div>
      ${reported ? `<div><div class="label">Reported On</div><div class="value">${escapeHtml(reported.toLocaleString())}</div></div>` : ''}
      <div><div class="label">Status</div><div class="value">${escapeHtml(d.status || '—')}</div></div>
    </div>
    <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#64748b">Radiology Report</h3>
    <div class="report">${escapeHtml(d.report_text || 'No report available')}</div>
    ${imageHtml}
    <div class="sign">
      <div class="sign-line">Radiologist / Reporting Officer</div>
    </div>
    <p class="foot">This is a computer-generated radiology report from ${escapeHtml(hospitalName())}.</p>
  </body></html>`
  return openPrint(html, 820, 640)
}
