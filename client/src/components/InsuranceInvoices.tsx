import { useState, useEffect } from 'react'
import { Loader2, Plus, X, FileText, Eye, Send, CheckCircle, Printer, AlertTriangle, CreditCard } from 'lucide-react'
import { HOSPITAL_NAME, HOSPITAL_ADDRESS, HOSPITAL_CONTACTS } from '../utils/print'

export default function InsuranceInvoices() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [genForm, setGenForm] = useState({ provider_id: '', period_start: '', period_end: '', due_date: '' })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Invoice detail modal state
  const [detailInvoice, setDetailInvoice] = useState<any | null>(null)
  const [detailItems, setDetailItems] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Stylish confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{ type: 'send' | 'cancel' | 'void' | 'paid'; invoice: any } | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [invRes, provRes] = await Promise.all([
        api.get('/insurance/invoices'),
        api.get('/insurance/providers'),
      ])
      setInvoices(Array.isArray(invRes.data) ? invRes.data : [])
      setProviders(Array.isArray(provRes.data) ? provRes.data : [])
    } catch {} finally { setLoading(false) }
  }

  async function openDetail(inv: any) {
    setDetailInvoice(inv)
    setDetailLoading(true)
    setPaidAmount('')
    setConfirmError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/invoices/${inv.id}`)
      setDetailInvoice(res.data)
      setDetailItems(res.data.items || [])
    } catch {} finally { setDetailLoading(false) }
  }

  async function executeConfirm() {
    if (!confirmAction) return
    const { type, invoice } = confirmAction
    if (type === 'paid') {
      const amt = parseFloat(paidAmount)
      if (!amt || amt <= 0) { setConfirmError('Please enter a valid payment amount'); return }
      if (amt > Number(invoice.total_amount) - Number(invoice.paid_amount || 0)) {
        setConfirmError('Amount cannot exceed the outstanding balance'); return
      }
    }
    setUpdating(true)
    setConfirmError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      if (type === 'send') {
        await api.put(`/insurance/invoices/${invoice.id}`, { status: 'sent' })
      } else if (type === 'paid') {
        await api.put(`/insurance/invoices/${invoice.id}`, { status: 'paid', paid_amount: parseFloat(paidAmount) })
      } else if (type === 'cancel') {
        await api.put(`/insurance/invoices/${invoice.id}/cancel`)
      } else if (type === 'void') {
        await api.put(`/insurance/invoices/${invoice.id}/void`)
      }
      setConfirmAction(null)
      setDetailInvoice(null)
      setPaidAmount('')
      await loadData()
    } catch (err: any) { setConfirmError(err.response?.data?.message || 'Action failed') }
    finally { setUpdating(false) }
  }

  async function generateInvoice() {
    if (!genForm.provider_id || !genForm.period_start || !genForm.period_end) {
      setError('Provider and period are required'); return
    }
    setGenerating(true); setError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.post('/insurance/invoices', genForm)
      setShowGenerate(false)
      setGenForm({ provider_id: '', period_start: '', period_end: '', due_date: '' })
      await loadData()
      // Open the generated invoice for review
      if (res.data?.id) openDetail(res.data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate invoice')
    } finally { setGenerating(false) }
  }

  function printInvoice(inv: any, items: any[]) {
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    const total = Number(inv.total_amount || 0)
    const paid = Number(inv.paid_amount || 0)
    w.document.write(`<!DOCTYPE html><html><head><title>${inv.invoice_number}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1e293b; font-size: 13px; }
        h1 { font-size: 22px; margin-bottom: 4px; color: #0f172a; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #475569; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        .right { text-align: right; }
        .center { text-align: center; }
        .total-row { font-weight: bold; background: #f8fafc; }
        .summary { margin-top: 20px; border-top: 2px solid #e2e8f0; padding-top: 12px; }
        .summary td { border: none; padding: 4px 10px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .logo { font-size: 18px; font-weight: bold; color: #059669; }
        .meta { text-align: right; font-size: 11px; color: #64748b; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
        .badge-draft { background: #f1f5f9; color: #475569; }
        .badge-sent { background: #dbeafe; color: #1d4ed8; }
        .badge-paid { background: #dcfce7; color: #15803d; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <div class="header">
        <div>
          <div class="logo">${HOSPITAL_NAME}</div>
          <div style="color:#64748b;font-size:12px">${HOSPITAL_ADDRESS}</div>
          <div style="color:#64748b;font-size:12px">Tel: ${HOSPITAL_CONTACTS}</div>
          <p class="sub" style="margin-top:10px">Invoice #<strong>${inv.invoice_number}</strong></p>
        </div>
        <div class="meta">
          <p><strong>Provider:</strong> ${inv.provider_name || '—'}</p>
          <p><strong>Period:</strong> ${inv.period_start} → ${inv.period_end}</p>
          <p><strong>Due:</strong> ${inv.due_date || '—'}</p>
          <p><strong>Date:</strong> ${new Date(inv.created_at).toLocaleDateString()}</p>
          <p><span class="badge badge-${inv.status}">${inv.status.toUpperCase()}</span></p>
        </div>
      </div>
      <table>
        <thead><tr><th>Case</th><th>Patient</th><th>Service</th><th class="center">Qty</th><th class="right">Unit Price</th><th class="right">Total</th></tr></thead>
        <tbody>
          ${items.map((i: any) => `<tr>
            <td>${i.case_number || '—'}</td>
            <td>${i.patient_name || '—'}</td>
            <td>${i.description || '—'}</td>
            <td class="center">${i.quantity}</td>
            <td class="right">₦${Number(i.unit_price).toLocaleString()}</td>
            <td class="right">₦${Number(i.total_price).toLocaleString()}</td>
          </tr>`).join('')}
          <tr class="total-row"><td colspan="5" style="text-align:right;font-weight:bold">Total</td><td class="right" style="font-weight:bold">₦${total.toLocaleString()}</td></tr>
        </tbody>
      </table>
      <table class="summary">
        <tr><td style="color:#64748b">Amount Paid</td><td class="right" style="color:#059669">₦${paid.toLocaleString()}</td></tr>
        <tr><td style="font-weight:bold;font-size:14px">Balance Due</td><td class="right" style="font-weight:bold;font-size:14px;color:#0f172a">₦${Math.max(0, total - paid).toLocaleString()}</td></tr>
      </table>
      <p style="margin-top:30px;text-align:center;color:#94a3b8;font-size:10px">Generated by ${HOSPITAL_NAME} Insurance Module · ${new Date().toISOString().slice(0, 10)}</p>
      </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const filtered = invoices.filter(i => {
    if (filterProvider && i.provider_id !== filterProvider) return false
    if (filterStatus && i.status !== filterStatus) return false
    return true
  })

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-emerald-100 text-emerald-700', disputed: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-400' }
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-500'}`}>{s}</span>
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
          <Plus className="w-4 h-4" /> Generate Invoice
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Providers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Invoice #</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Period</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Amount</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Paid</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Due</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv: any) => (
                <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-xs font-bold">{inv.invoice_number}</td>
                  <td className="py-3 px-4">{inv.provider_name || '—'}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{inv.period_start} — {inv.period_end}</td>
                  <td className="py-3 px-4 text-right font-medium">₦{Number(inv.total_amount || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-emerald-600">₦{Number(inv.paid_amount || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-center">{statusBadge(inv.status)}</td>
                  <td className="py-3 px-4 text-center text-xs text-slate-500">{inv.due_date || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => openDetail(inv)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                      <Eye className="w-3 h-3" /> View
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400">No invoices yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Invoice Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Generate Invoice</h3>
              <button onClick={() => setShowGenerate(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                <select value={genForm.provider_id} onChange={e => setGenForm(p => ({ ...p, provider_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="">Select provider...</option>
                  {providers.filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Period Start</label>
                  <input type="date" value={genForm.period_start} onChange={e => setGenForm(p => ({ ...p, period_start: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Period End</label>
                  <input type="date" value={genForm.period_end} onChange={e => setGenForm(p => ({ ...p, period_end: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date (optional)</label>
                <input type="date" value={genForm.due_date} onChange={e => setGenForm(p => ({ ...p, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowGenerate(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={generateInvoice} disabled={generating} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                  {generating && <Loader2 className="w-4 h-4 animate-spin" />} Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !updating && setDetailInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center"><FileText className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{detailInvoice.invoice_number}</h2>
                  <p className="text-xs text-slate-400">Created {new Date(detailInvoice.created_at).toLocaleString()}</p>
                </div>
                <span className="ml-2">{statusBadge(detailInvoice.status)}</span>
              </div>
              <button onClick={() => setDetailInvoice(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Header info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Provider</p>
                    <p className="text-sm font-medium text-slate-700">{detailInvoice.provider_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Period</p>
                    <p className="text-sm font-medium text-slate-700">{detailInvoice.period_start} → {detailInvoice.period_end}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Due Date</p>
                    <p className="text-sm font-medium text-slate-700">{detailInvoice.due_date || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Claim Ref</p>
                    <p className="text-sm font-medium text-slate-700">{detailInvoice.claim_reference || '—'}</p>
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Line Items ({detailItems.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Patient</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Service</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Qty</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-600">Unit</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-600">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((item: any) => (
                          <tr key={item.id} className="border-b border-slate-100">
                            <td className="py-2 px-3 text-xs">{item.patient_name || item.case_number || '—'}</td>
                            <td className="py-2 px-3 text-xs font-medium">{item.description}</td>
                            <td className="py-2 px-3 text-center text-xs">{item.quantity}</td>
                            <td className="py-2 px-3 text-right text-xs">₦{Number(item.unit_price).toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-xs font-medium">₦{Number(item.total_price).toLocaleString()}</td>
                          </tr>
                        ))}
                        {detailItems.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No line items</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Total billed</span><span className="font-medium text-slate-700">₦{Number(detailInvoice.total_amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Amount paid</span><span className="font-medium text-emerald-600">₦{Number(detailInvoice.paid_amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm pt-1 border-t border-slate-200"><span className="font-medium text-slate-700">Balance</span><span className="font-bold text-slate-800">₦{Math.max(0, Number(detailInvoice.total_amount || 0) - Number(detailInvoice.paid_amount || 0)).toLocaleString()}</span></div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                  {detailInvoice.status === 'draft' && (
                    <>
                      <button onClick={() => { setPaidAmount(''); setConfirmError(''); setConfirmAction({ type: 'cancel', invoice: detailInvoice }) }} disabled={updating}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-xl transition-all">
                        <AlertTriangle className="w-4 h-4" /> Cancel Invoice
                      </button>
                      <button onClick={() => { setPaidAmount(''); setConfirmError(''); setConfirmAction({ type: 'send', invoice: detailInvoice }) }} disabled={updating}
                        className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
                        <Send className="w-4 h-4" /> Send to HMO
                      </button>
                    </>
                  )}
                  {detailInvoice.status === 'sent' && (
                    <>
                      <button onClick={() => { setPaidAmount(''); setConfirmError(''); setConfirmAction({ type: 'void', invoice: detailInvoice }) }} disabled={updating}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                        <AlertTriangle className="w-4 h-4" /> Void Invoice
                      </button>
                      <button onClick={() => { setPaidAmount(''); setConfirmError(''); setConfirmAction({ type: 'paid', invoice: detailInvoice }) }} disabled={updating}
                        className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all">
                        <CheckCircle className="w-4 h-4" /> Mark as Paid
                      </button>
                    </>
                  )}
                  {detailInvoice.status === 'paid' && (
                    <button onClick={() => { setPaidAmount(''); setConfirmError(''); setConfirmAction({ type: 'void', invoice: detailInvoice }) }} disabled={updating}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                      <AlertTriangle className="w-4 h-4" /> Void Invoice
                    </button>
                  )}
                  <button onClick={() => printInvoice(detailInvoice, detailItems)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                    <Printer className="w-4 h-4" /> Print
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stylish Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !updating && setConfirmAction(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-auto overflow-hidden" onClick={e => e.stopPropagation()}>
            {(() => {
              const t = confirmAction.type
              const config = {
                send:   { icon: Send,        color: 'bg-blue-50 text-blue-600',       ring: 'bg-blue-600 hover:bg-blue-700',     title: 'Send Invoice to HMO',   confirm: 'Confirm Send' },
                cancel: { icon: AlertTriangle, color: 'bg-amber-50 text-amber-600',    ring: 'bg-amber-600 hover:bg-amber-700',    title: 'Cancel Invoice',        confirm: 'Yes, Cancel Invoice' },
                void:   { icon: AlertTriangle, color: 'bg-rose-50 text-rose-600',      ring: 'bg-rose-600 hover:bg-rose-700',      title: 'Void Invoice',          confirm: 'Yes, Void Invoice' },
                paid:   { icon: CreditCard,   color: 'bg-emerald-50 text-emerald-600', ring: 'bg-emerald-600 hover:bg-emerald-700', title: 'Mark Invoice as Paid',   confirm: 'Confirm Payment' },
              }[t]
              const CfgIcon = config.icon
              return (
                <>
                  <div className="px-6 pt-6 pb-4 text-center">
                    <div className={`w-14 h-14 rounded-2xl ${config.color} flex items-center justify-center mx-auto mb-3`}>
                      <CfgIcon className="w-7 h-7" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">{config.title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{confirmAction.invoice.invoice_number}</p>
                  </div>

                  <div className="px-6 pb-4">
                    <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                      {t === 'send' && (
                        <p>This invoice will be submitted to <strong>{confirmAction.invoice.provider_name}</strong>. The status will change to <strong>sent</strong> and the submission time will be recorded.</p>
                      )}
                      {t === 'cancel' && (
                        <p>Cancelling this draft invoice will <strong>reopen all {confirmAction.invoice.items_count || ''} service(s) for re-billing</strong>. This cannot be undone.</p>
                      )}
                      {t === 'void' && (
                        <p>Voiding this {confirmAction.invoice.status} invoice acts as a <strong>credit note</strong> and reopens all services for re-billing. This cannot be undone.</p>
                      )}
                      {t === 'paid' && (
                        <div className="space-y-2">
                          <p>Record payment received from <strong>{confirmAction.invoice.provider_name}</strong>.</p>
                          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
                            <span className="text-slate-500 font-medium">₦</span>
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={paidAmount} placeholder="0.00" autoFocus
                              onChange={e => { const v = e.target.value; setConfirmError(''); if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setPaidAmount(v) }}
                              className="flex-1 outline-none text-sm font-medium" />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400 pt-1">
                            <span>Balance due: ₦{Math.max(0, Number(confirmAction.invoice.total_amount || 0) - Number(confirmAction.invoice.paid_amount || 0)).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                      {confirmError && <p className="text-xs text-rose-600 mt-2 flex items-center gap-1"><AlertTriangle size={11} /> {confirmError}</p>}
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setConfirmAction(null)} disabled={updating}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">
                      Cancel
                    </button>
                    <button onClick={executeConfirm} disabled={updating}
                      className={`flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 ${config.ring}`}>
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CfgIcon className="w-4 h-4" />}
                      {updating ? 'Processing...' : config.confirm}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
