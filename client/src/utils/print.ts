// Standard hospital header + receipt/report print helpers shared across the system.

export const HOSPITAL_NAME = 'MACHOKO MEMORIAL HOSPITAL'
export const HOSPITAL_ADDRESS = 'Machoko Diamond Plaza, Mile 6 Road Bye-Pass, Jalingo, Taraba State'
export const HOSPITAL_CONTACTS = '0802900231, 07068855750, 08068862666'

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
  return `
    <div style="text-align:center;padding-bottom:8px;border-bottom:2px dashed #cbd5e1">
      <div style="font-size:15px;font-weight:700">${HOSPITAL_NAME}</div>
      <div style="font-size:10px;color:#64748b">${HOSPITAL_ADDRESS}</div>
      <div style="font-size:10px;color:#64748b">Tel: ${HOSPITAL_CONTACTS}</div>
    </div>`
}

// Full A4 report header
export function reportHeaderHtml(): string {
  return `
    <div style="text-align:center;padding-bottom:12px;border-bottom:3px solid #0f766e;margin-bottom:16px">
      <div style="font-size:20px;font-weight:800;color:#0f766e;letter-spacing:0.5px">${HOSPITAL_NAME}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${HOSPITAL_ADDRESS}</div>
      <div style="font-size:12px;color:#64748b">Tel: ${HOSPITAL_CONTACTS}</div>
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
    <div style="text-align:center;padding:6px 0;font-size:13px;font-weight:700">RECEIPT</div>
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
    <div style="text-align:center;font-size:9px;color:#94a3b8;padding-top:10px">Thank you for choosing ${HOSPITAL_NAME}</div>
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
    total: Number(it.total_price) || (Number(it.unit_price) * (it.quantity || 1)) || 0,
  }))
  if (lines.length === 0) {
    lines.push({ item: 'Payment', quantity: 1, price: Number(r.total_amount) || 0, total: Number(r.total_amount) || 0 })
  }
  const html = buildReceiptHtml({
    receiptNumber: r.receipt_number || generateReceiptNumber(),
    date: receiptDate(d),
    time: receiptTime(d),
    staff: r.staff_name || '',
    customer,
    paymentMethod: r.payment_method ? String(r.payment_method).toUpperCase() : '',
    lines,
    total: Number(r.total_amount) || lines.reduce((s, l) => s + Number(l.total), 0),
    notes: r.notes || '',
  })
  return openPrint(html)
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
    <p class="foot">This is a computer-generated radiology report from ${HOSPITAL_NAME}.</p>
  </body></html>`
  return openPrint(html, 820, 640)
}
