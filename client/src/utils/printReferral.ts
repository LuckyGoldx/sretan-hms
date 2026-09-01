// Referral slip print helper.
import { HOSPITAL_NAME, HOSPITAL_ADDRESS, HOSPITAL_CONTACTS, escapeHtml } from './print'

export function printReferralSlip(ref: any) {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return
  const priority = ref?.priority || 'routine'
  const status = (ref?.status || 'pending').replace('_', ' ')
  w.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Referral Slip ${escapeHtml(ref?.referral_number || '')}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; width: 360px; margin: 0 auto; padding: 16px; color: #0f172a; }
  .center { text-align: center; }
  h2 { margin: 4px 0; font-size: 16px; }
  .muted { color: #64748b; font-size: 11px; }
  .dashed { border-bottom: 2px dashed #cbd5e1; margin: 12px 0; }
  .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
  .label { color: #64748b; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .prio-routine { background: #e0f2fe; color: #0369a1; }
  .prio-urgent { background: #fef3c7; color: #b45309; }
  .prio-emergency { background: #fee2e2; color: #b91c1c; }
  .reason { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-top: 6px; font-size: 12px; }
  .foot { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <div class="center">
    <h2>${escapeHtml(HOSPITAL_NAME)}</h2>
    <div class="muted">${escapeHtml(HOSPITAL_ADDRESS)}</div>
    <div class="muted">${escapeHtml(HOSPITAL_CONTACTS)}</div>
  </div>
  <div class="dashed"></div>
  <div class="center"><h2>REFERRAL SLIP</h2><div class="muted">${escapeHtml(ref?.referral_number || '')}</div></div>
  <div class="dashed"></div>
  <div class="row"><span class="label">Patient</span><span><strong>${escapeHtml(ref?.patient_name || '—')}</strong></span></div>
  <div class="row"><span class="label">Hospital No.</span><span>${escapeHtml(ref?.hospital_number || '—')}</span></div>
  <div class="row"><span class="label">Referred To</span><span>${escapeHtml(ref?.to_department_name || '—')}</span></div>
  <div class="row"><span class="label">Consultant</span><span>${escapeHtml(ref?.to_consultant_name || 'Any in department')}</span></div>
  <div class="row"><span class="label">Priority</span><span><span class="badge prio-${escapeHtml(priority)}">${escapeHtml(priority)}</span></span></div>
  <div class="row"><span class="label">Status</span><span>${escapeHtml(status)}</span></div>
  <div class="row"><span class="label">Referred By</span><span>${escapeHtml(ref?.referred_by_name || '—')}</span></div>
  <div class="row"><span class="label">Date</span><span>${escapeHtml(new Date(ref?.created_at || Date.now()).toLocaleString())}</span></div>
  <div class="dashed"></div>
  <div class="label">Referral Reason</div>
  <div class="reason">${escapeHtml(ref?.reason || '—')}</div>
  ${ref?.outcome_note ? `<div class="dashed"></div><div class="label">Consultant Outcome</div><div class="reason">${escapeHtml(ref.outcome_note)}</div>` : ''}
  <div class="foot">This is a computer-generated referral slip.</div>
</body>
</html>`)
  w.document.close()
  w.focus()
  w.print()
}
