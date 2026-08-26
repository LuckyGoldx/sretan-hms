import { HOSPITAL_NAME, HOSPITAL_ADDRESS, HOSPITAL_CONTACTS } from './print';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function fmt(value: unknown, fallback = '—'): string {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

export function printLabReport(order: any, results: any[] = []): void {
  const w = window.open('', '_blank', 'width=820,height=640');
  if (!w) return;

  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString() : '—';
  const collectedStr = order.results_collected_at
    ? new Date(order.results_collected_at).toLocaleString()
    : '';
  const approvedAt = order.approved_at ? new Date(order.approved_at).toLocaleString() : '';

  const resultRows = results.length
    ? results.map((r: any) => {
        const flag = r.flag_status || (r.is_abnormal ? 'abnormal' : 'normal');
        const value = `${escapeHtml(fmt(r.value))}${r.unit ? ' <span class="unit">' + escapeHtml(r.unit) + '</span>' : ''}`;
        const refRange = r.ref_range_text
          ? escapeHtml(r.ref_range_text)
          : `${escapeHtml(fmt(r.reference_range_low, '?'))} – ${escapeHtml(fmt(r.reference_range_high, '?'))}`;
        const flagBadge = flag === 'critical'
          ? '<span class="flag crit">CRITICAL</span>'
          : flag === 'abnormal'
            ? '<span class="flag">ABNORMAL</span>'
            : 'Normal';
        const remarks = r.remarks ? `<div class="analyte-note">Note: ${escapeHtml(r.remarks)}</div>` : '';
        const row = `<tr${flag !== 'normal' ? ' class="' + flag + '"' : ''}>
          <td>${escapeHtml(r.analyte_name)}${remarks}</td>
          <td class="center">${value}</td>
          <td class="center">${refRange}</td>
          <td class="center">${flagBadge}</td>
          <td class="center mono">${escapeHtml(fmt(r.result_number))}</td>
        </tr>`;
        return row;
      }).join('')
    : '<tr><td colspan="5" class="center muted">No results recorded for this order yet.</td></tr>';

  const generalRemarks = order.remarks ? `
    <div class="remarks">
      <h4>General Lab Remarks</h4>
      <p>${escapeHtml(order.remarks)}</p>
    </div>` : '';

  w.document.write(`<!DOCTYPE html><html><head><title>Laboratory Report ${escapeHtml(order.lab_number || '')}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1e293b; font-size: 13px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 20px; }
      .org { font-size: 20px; font-weight: 800; color: #0f766e; letter-spacing: 0.5px; }
      .org-sub { color: #64748b; font-size: 12px; }
      .meta { text-align: right; font-size: 12px; color: #334155; }
      .meta div { margin-top: 2px; }
      .labnum { font-family: Consolas, monospace; font-weight: 700; color: #0f172a; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 14px 0 20px; }
      .info-grid .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
      .info-grid .value { font-weight: 600; color: #0f172a; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #475569; }
      td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .center { text-align: center; }
      .right { text-align: right; }
      .mono { font-family: Consolas, monospace; font-size: 12px; color: #64748b; }
      .muted { color: #94a3b8; }
      .unit { color: #64748b; font-size: 11px; font-weight: 400; }
      .analyte-note { font-size: 11px; color: #64748b; font-weight: 400; margin-top: 3px; }
      tr.abnormal { background: #fffbeb; }
      tr.abnormal td { color: #b45309; }
      tr.critical { background: #fff1f2; }
      tr.critical td { color: #be123c; }
      .flag { display: inline-block; background: #f59e0b; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
      .flag.crit { background: #e11d48; }
      .remarks { margin-top: 22px; border-top: 2px solid #e2e8f0; padding-top: 12px; }
      .remarks h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; }
      .remarks p { margin: 0; font-size: 13px; color: #0f172a; white-space: pre-wrap; }
      .status { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .status-completed { background: #dcfce7; color: #15803d; }
      .status-review { background: #fef3c7; color: #b45309; }
      .status-processing { background: #dbeafe; color: #1d4ed8; }
      .status-ordered { background: #f1f5f9; color: #475569; }
      .status-collected { background: #e0e7ff; color: #4338ca; }
      .sign { display: flex; justify-content: space-between; margin-top: 42px; padding-top: 12px; }
      .sign-line { text-align: center; width: 38%; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 11px; color: #64748b; }
      .foot { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 10px; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <div class="head">
      <div>
        <div class="org">${HOSPITAL_NAME}</div>
        <div class="org-sub">${HOSPITAL_ADDRESS}</div>
        <div class="org-sub">Tel: ${HOSPITAL_CONTACTS}</div>
        <div class="org-sub">Laboratory Results Report</div>
      </div>
      <div class="meta">
        <div>Lab No: <span class="labnum">${escapeHtml(fmt(order.lab_number))}</span></div>
        ${order.request_number ? `<div>Request: ${escapeHtml(order.request_number)}</div>` : ''}
        ${order.order_number ? `<div>Order: ${escapeHtml(order.order_number)}</div>` : ''}
        <div>Issued: ${escapeHtml(dateStr)}</div>
        <div>Status: <span class="status status-${escapeHtml(order.status || 'ordered')}">${escapeHtml(fmt(order.status))}</span></div>
      </div>
    </div>

    <div class="info-grid">
      <div><div class="label">Patient</div><div class="value">${escapeHtml(order.patient_name || 'Walk-in Patient')}</div></div>
      <div><div class="label">Hospital No.</div><div class="value">${escapeHtml(fmt(order.hospital_number))}</div></div>
      <div><div class="label">Test</div><div class="value">${escapeHtml(order.test_name)}</div></div>
      <div><div class="label">Specimen</div><div class="value">${escapeHtml(fmt(order.specimen_type))}</div></div>
      <div><div class="label">Priority</div><div class="value">${escapeHtml(fmt(order.priority))}</div></div>
      <div><div class="label">Requested By</div><div class="value">${escapeHtml(order.doctor_name || order.referred_by || '—')}</div></div>
      ${collectedStr ? `<div><div class="label">Sample Collected</div><div class="value">${escapeHtml(collectedStr)}</div></div>` : ''}
      ${approvedAt ? `<div><div class="label">Approved</div><div class="value">${escapeHtml(approvedAt)}</div></div>` : ''}
    </div>

    <table>
      <thead><tr><th>Analyte</th><th class="center">Result</th><th class="center">Reference Range</th><th class="center">Flag</th><th class="center">Result No.</th></tr></thead>
      <tbody>${resultRows}</tbody>
    </table>

    ${generalRemarks}

    <div class="sign">
      <div class="sign-line">Lab Scientist</div>
      <div class="sign-line">Supervisor / Approver</div>
    </div>

    <p class="foot">This is a computer-generated laboratory report from ${HOSPITAL_NAME}. Results flagged <b>ABNORMAL</b> fall outside the reference range.</p>
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 350);
}
