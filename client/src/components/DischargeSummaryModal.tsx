import { X, LogOut, ScrollText, Stethoscope, Clock, Printer } from 'lucide-react'
import { getClinicInfo } from '../utils/clinicInfo'

interface DischargeSummaryModalProps {
  admission: any
  onClose: () => void
}

function textBlock(value?: string | null): string {
  if (!value || !value.trim()) return ''
  return value.trim()
}

function escapeHtml(value?: string | null): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : '—'
}

// Opens the browser's print dialog through a hidden iframe (no pop-up blocker
// issues). "Save as PDF" in that dialog covers the export case.
function printDischargeSummary(admission: any) {
  const clinic = getClinicInfo()
  const patientName = admission?.patient_name || admission?.full_name || 'Patient'
  const hospitalNumber = admission?.hospital_number || admission?.patient_id || ''
  const summary = escapeHtml(textBlock(admission?.discharge_summary))
  const instructions = escapeHtml(textBlock(admission?.discharge_instructions))

  const headerLines = [
    clinic?.hospital_name ? `<div class="hospital">${escapeHtml(clinic.hospital_name)}</div>` : '',
    clinic?.address ? `<div class="muted">${escapeHtml(clinic.address)}</div>` : '',
    clinic?.phone_number ? `<div class="muted">Tel: ${escapeHtml(clinic.phone_number)}</div>` : '',
  ].join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Discharge Summary — ${escapeHtml(patientName)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12.5px; line-height: 1.55; }
  .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 16px; }
  .hospital { font-size: 18px; font-weight: 700; letter-spacing: .3px; }
  .muted { color: #64748b; font-size: 11px; }
  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; margin: 14px 0 4px; text-align: center; }
  .meta { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
  .meta td { border: 1px solid #cbd5e1; padding: 6px 9px; vertical-align: top; }
  .meta .label { color: #64748b; width: 22%; font-size: 11px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #475569; margin: 18px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  .block { white-space: pre-wrap; }
  .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 8px; color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between; }
  .sign { margin-top: 40px; }
  .sign .line { border-top: 1px solid #334155; width: 240px; padding-top: 4px; font-size: 11px; }
</style>
</head>
<body>
  <div class="header">
    ${headerLines || '<div class="hospital">Hospital</div>'}
  </div>
  <h1>Discharge Summary</h1>
  <table class="meta">
    <tr><td class="label">Patient</td><td><strong>${escapeHtml(patientName)}</strong></td><td class="label">Hospital No.</td><td>${escapeHtml(hospitalNumber)}</td></tr>
    <tr><td class="label">Ward</td><td>${escapeHtml(admission?.ward_name || '—')}${admission?.bed_number ? ` · Bed ${escapeHtml(admission.bed_number)}` : ''}</td><td class="label">Discharged by</td><td>${escapeHtml(admission?.discharged_by_name || '—')}</td></tr>
    <tr><td class="label">Admitted</td><td>${formatDateTime(admission?.admitted_at)}</td><td class="label">Discharged</td><td>${formatDateTime(admission?.discharged_at)}</td></tr>
  </table>

  <h2>Discharge Summary</h2>
  <div class="block">${summary || 'No discharge summary was recorded for this admission.'}</div>

  ${instructions ? `<h2>Discharge Instructions / Follow-up</h2><div class="block">${instructions}</div>` : ''}

  <div class="sign">
    <div class="line">${escapeHtml(admission?.discharged_by_name || 'Discharging Doctor')}</div>
  </div>

  <div class="footer">
    <span>Printed ${escapeHtml(new Date().toLocaleString())}</span>
    <span>${escapeHtml(admission?.id ? String(admission.id).slice(0, 8) : '')}</span>
  </div>
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
  const win = iframe.contentWindow!
  const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 800)
  win.onafterprint = cleanup
  setTimeout(() => { win.focus(); win.print(); cleanup() }, 250)
}

export default function DischargeSummaryModal({ admission, onClose }: DischargeSummaryModalProps) {
  const patientName = admission?.patient_name || admission?.full_name || 'Patient'
  const hospitalNumber = admission?.hospital_number || ''
  const summary = textBlock(admission?.discharge_summary)
  const instructions = textBlock(admission?.discharge_instructions)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">Close</button>
          <button onClick={() => printDischargeSummary(admission)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all">
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  )
}
