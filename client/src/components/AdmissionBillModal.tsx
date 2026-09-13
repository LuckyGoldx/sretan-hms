import { X, Printer, Receipt, BadgeCheck } from 'lucide-react'
import { getClinicInfo } from '../utils/clinicInfo'

export interface BillItem {
  description: string
  amount: number
}

interface AdmissionBillModalProps {
  title?: string
  patientName?: string
  hospitalNumber?: string
  wardName?: string
  items: BillItem[]
  chargesTotal: number
  depositsHeld?: number
  outstanding?: number
  isFinal?: boolean
  dischargedAt?: string | null
  clearedBy?: string | null
  onClose: () => void
}

function money(n: any): string {
  return `₦${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function escapeHtml(value?: string | null): string {
  if (!value) return ''
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export default function AdmissionBillModal({
  title = 'Interim Bill',
  patientName = 'Patient',
  hospitalNumber = '',
  wardName = '',
  items,
  chargesTotal,
  depositsHeld = 0,
  outstanding = 0,
  isFinal = false,
  dischargedAt,
  clearedBy,
  onClose,
}: AdmissionBillModalProps) {
  function printBill() {
    const clinic = getClinicInfo()
    const header = [
      clinic?.hospital_name ? `<div class="hospital">${escapeHtml(clinic.hospital_name)}</div>` : '',
      clinic?.address ? `<div class="muted">${escapeHtml(clinic.address)}</div>` : '',
      clinic?.phone_number ? `<div class="muted">Tel: ${escapeHtml(clinic.phone_number)}</div>` : '',
    ].join('')

    const rows = (items || []).map((it) => `
      <tr><td>${escapeHtml(it.description)}</td><td class="right">${escapeHtml(money(it.amount))}</td></tr>`).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)} — ${escapeHtml(patientName)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12.5px; }
  .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 14px; }
  .hospital { font-size: 18px; font-weight: 700; }
  .muted { color: #64748b; font-size: 11px; }
  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin: 12px 0; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .meta td { border: 1px solid #cbd5e1; padding: 6px 9px; }
  .meta .label { color: #64748b; width: 22%; font-size: 11px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th, table.items td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  table.items th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .right { text-align: right; }
  .totals { margin-top: 10px; margin-left: auto; width: 320px; }
  .totals td { padding: 4px 8px; }
  .totals .big { border-top: 2px solid #334155; font-weight: 700; font-size: 13px; }
  .footer { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 8px; color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between; }
</style></head>
<body>
  <div class="header">${header || '<div class="hospital">Hospital</div>'}</div>
  <h1>${escapeHtml(title)}</h1>
  <table class="meta">
    <tr><td class="label">Patient</td><td><strong>${escapeHtml(patientName)}</strong></td><td class="label">Hospital No.</td><td>${escapeHtml(hospitalNumber)}</td></tr>
    <tr><td class="label">Ward</td><td>${escapeHtml(wardName || '—')}</td><td class="label">${isFinal ? 'Discharged' : 'Status'}</td><td>${escapeHtml(dischargedAt ? new Date(dischargedAt).toLocaleString() : 'In admission')}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="2">No charges</td></tr>'}</tbody>
  </table>
  <table class="totals">
    <tr><td>Total charges</td><td class="right">${escapeHtml(money(chargesTotal))}</td></tr>
    ${depositsHeld > 0 ? `<tr><td>Deposits paid</td><td class="right">${escapeHtml(money(depositsHeld))}</td></tr>` : ''}
    <tr class="big"><td>${isFinal ? 'Balance at clearance' : 'Outstanding'}</td><td class="right">${escapeHtml(money(outstanding))}</td></tr>
  </table>
  <div class="footer">
    <span>Printed ${escapeHtml(new Date().toLocaleString())}</span>
    <span>${escapeHtml(clearedBy ? `Cleared by ${clearedBy}` : '')}</span>
  </div>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'
    iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) return
    doc.open(); doc.write(html); doc.close()
    const win = iframe.contentWindow!
    const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 800)
    win.onafterprint = cleanup
    setTimeout(() => { win.focus(); win.print(); cleanup() }, 250)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Receipt size={18} className="text-primary" /> {title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs">
            <p className="text-sm font-semibold text-slate-800">{patientName}</p>
            <p className="text-slate-400 font-mono">{hospitalNumber}</p>
            <p className="text-slate-500 mt-1">Ward: <strong className="text-slate-700">{wardName || '—'}</strong></p>
            {dischargedAt && <p className="text-slate-500">Discharged: {new Date(dischargedAt).toLocaleString()}</p>}
            {clearedBy && <p className="text-slate-500 flex items-center gap-1"><BadgeCheck size={12} className="text-emerald-500" /> Cleared by {clearedBy}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 divide-y divide-slate-50 max-h-72 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">No charges</p>}
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="text-slate-600 pr-3">{it.description}</span>
                <span className="font-medium text-slate-700 whitespace-nowrap">{money(it.amount)}</span>
              </div>
            ))}
          </div>

          <div className="text-sm">
            <div className="flex justify-between py-1 text-slate-500"><span>Total charges</span><span>{money(chargesTotal)}</span></div>
            {depositsHeld > 0 && <div className="flex justify-between py-1 text-emerald-600"><span>Deposits paid</span><span>{money(depositsHeld)}</span></div>}
            <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-slate-800"><span>{isFinal ? 'Balance at clearance' : 'Outstanding'}</span><span>{money(outstanding)}</span></div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50">Close</button>
          <button onClick={printBill} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90">
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  )
}
