import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import api from '../hooks/useAxios'
import {
  Package, Plus, Loader2, CheckCircle, AlertTriangle, X, ArrowLeft, Truck, Eye,
  Trash2, Banknote, RotateCcw, Edit2, Search, MapPin, Phone, CalendarDays, FileText, Ban, Printer, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { loadClinicInfo } from '../utils/clinicInfo'

const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
const currentRole: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()

// All amounts are Nigerian Naira.
const naira = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const num = (n: any) => Number(n) || 0
const round2Safe = (n: any) => Math.round((Number(n) || 0) * 100) / 100
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

const PAGE_SIZE = 25

const PAY_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'bank_deposit', label: 'Bank Deposit' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]
const methodLabel = (v: string | null | undefined) => PAY_METHODS.find((m) => m.value === v)?.label || (v ? String(v) : '—')
const needsReference = (m: string) => !!m && m !== 'cash'
// Purchase orders are costed at the inventory COST price (falling back to the
// sell price only when no cost is set).
const invUnitPrice = (inv: any) => (num(inv?.cost_price) > 0 ? num(inv.cost_price) : num(inv?.price))

async function uploadReceipt(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data?.path || ''
}

// Textarea that grows with its content up to a maximum number of lines.
function AutoTextarea({ value, onChange, placeholder, className, maxLines = 5 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; maxLines?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const maxHeight = lineHeight * maxLines + padding
    el.style.height = 'auto'
    const target = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${target}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, maxLines])
  return (
    <textarea ref={ref} rows={1} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`resize-none ${className || ''}`} />
  )
}

interface Item { key: string; id?: string; inventory_item_id: string | null; drug_name: string; unit: string; quantity: string; unit_price: string }

function newLine(): Item {
  return { key: Math.random().toString(36).slice(2), inventory_item_id: null, drug_name: '', unit: '', quantity: '1', unit_price: '' }
}

function statusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case 'received': return { label: 'Received', cls: 'bg-indigo-100 text-indigo-700' }
    case 'paid': return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' }
    case 'partially_paid': return { label: 'Partially paid', cls: 'bg-blue-100 text-blue-700' }
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700' }
    default: return { label: 'Pending payment', cls: 'bg-amber-100 text-amber-700' }
  }
}

function concise(list: string[]): string {
  const clean = list.map((s) => String(s || '').trim()).filter(Boolean)
  const text = clean.slice(0, 2).join(', ')
  return clean.length > 2 ? `${text.length > 44 ? text.slice(0, 44) : text}…` : text
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingReceived, setEditingReceived] = useState(false)
  const [form, setForm] = useState({ supplier: '', supplier_address: '', supplier_phone: '', expected_at: '', notes: '', discount: '', tax: '', status: '' })
  const [items, setItems] = useState<Item[]>([newLine()])
  const [initialPayment, setInitialPayment] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentReceipt, setPaymentReceipt] = useState('')
  const [uploadingInit, setUploadingInit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [payForm, setPayForm] = useState<{ kind: 'payment' | 'refund'; amount: string; method: string; reference: string; note: string; receipt_url: string }>({ kind: 'payment', amount: '', method: 'cash', reference: '', note: '', receipt_url: '' })
  const [paySaving, setPaySaving] = useState(false)
  const [uploadingPay, setUploadingPay] = useState(false)

  // Quick "record payment" from the list row.
  const [payTarget, setPayTarget] = useState<any | null>(null)
  const [payTargetForm, setPayTargetForm] = useState<{ amount: string; method: string; reference: string; note: string; receipt_url: string }>({ amount: '', method: 'cash', reference: '', note: '', receipt_url: '' })
  const [payTargetSaving, setPayTargetSaving] = useState(false)
  const [payTargetError, setPayTargetError] = useState('')
  const [uploadingTarget, setUploadingTarget] = useState(false)

  const [receiveTarget, setReceiveTarget] = useState<any | null>(null)
  const [cancelTarget, setCancelTarget] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [o, inv] = await Promise.all([
        api.get('/purchase-orders').catch(() => ({ data: [] })),
        api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
      ])
      setOrders(Array.isArray(o.data) ? o.data : [])
      setInventory(Array.isArray(inv.data) ? inv.data : [])
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load purchase orders') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const formTotals = useMemo(() => {
    const subtotal = items.reduce((s, l) => s + (parseInt(l.quantity || '0', 10) || 0) * (parseFloat(l.unit_price || '0') || 0), 0)
    const discount = parseFloat(form.discount) || 0
    const tax = parseFloat(form.tax) || 0
    return { subtotal, discount, tax, total: subtotal - discount + tax }
  }, [items, form.discount, form.tax])

  const stats = useMemo(() => {
    const outstanding = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + num(o.outstanding), 0)
    const paid = orders.reduce((s, o) => s + num(o.amount_paid), 0)
    return {
      total: orders.length,
      outstanding,
      paid,
      received: orders.filter((o) => o.status === 'received').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }
  }, [orders])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter !== 'all' && o.status !== filter) return false
      if (!q) return true
      return [o.po_number, o.supplier, o.supplier_address, o.notes, (o.items || []).map((i: any) => i.drug_name).join(' ')]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [orders, filter, search])

  useEffect(() => { setPage(1) }, [search, filter])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetForm() {
    setEditingId(null)
    setEditingReceived(false)
    setForm({ supplier: '', supplier_address: '', supplier_phone: '', expected_at: '', notes: '', discount: '', tax: '', status: '' })
    setItems([newLine()])
    setInitialPayment(''); setPaymentMethod('cash'); setPaymentReference(''); setPaymentReceipt('')
    setFormError('')
  }
  function openCreate() { resetForm(); setFormOpen(true) }

  async function openEdit(order: any) {
    setFormError('')
    setEditingId(order.id)
    setEditingReceived(order.status === 'received')
    const editableStatus = ['pending', 'partially_paid', 'paid'].includes(order.status) ? order.status : ''
    setForm({
      supplier: order.supplier || '', supplier_address: order.supplier_address || '', supplier_phone: order.supplier_phone || '',
      expected_at: order.expected_at ? String(order.expected_at).slice(0, 10) : '', notes: order.notes || '',
      discount: String(num(order.discount)), tax: String(num(order.tax)), status: editableStatus,
    })
    setItems((order.items || []).length
      ? order.items.map((i: any) => ({ key: i.id, id: i.id, inventory_item_id: i.inventory_item_id || null, drug_name: i.drug_name || '', unit: i.unit || '', quantity: String(i.quantity ?? 1), unit_price: String(num(i.unit_price)) }))
      : [newLine()])
    setInitialPayment(''); setPaymentMethod('cash'); setPaymentReference(''); setPaymentReceipt('')
    setFormOpen(true)
  }

  // Typing an item name searches inventory; an exact hit links the line, a new
  // name is kept as free text (the item is created on receive). If the name
  // already exists on another line, the quantities are merged instead of adding
  // a duplicate line.
  function onItemNameChange(key: string, value: string) {
    const match = inventory.find((i) => String(i.drug_name || '').trim().toLowerCase() === value.trim().toLowerCase())
    setItems((prev) => {
      const me = prev.find((l) => l.key === key)
      const name = value.trim().toLowerCase()
      const duplicate = name
        ? prev.find((l) => l.key !== key && String(l.drug_name || '').trim().toLowerCase() === name)
        : undefined
      if (me && duplicate) {
        const addQty = Math.max(1, parseInt(me.quantity, 10) || 1)
        return prev
          .filter((l) => l.key !== key)
          .map((l) => l.key === duplicate.key ? { ...l, quantity: String((parseInt(l.quantity, 10) || 0) + addQty) } : l)
      }
      return prev.map((l) => l.key === key ? {
        ...l,
        drug_name: value,
        inventory_item_id: match ? match.id : null,
        unit: match && !l.unit ? (match.base_unit || '') : l.unit,
        unit_price: match && !l.unit_price ? String(invUnitPrice(match)) : l.unit_price,
      } : l)
    })
  }

  function updateLine(key: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l))
  }
  function addLine() { setItems((prev) => [...prev, newLine()]) }
  // Adding an existing inventory item bumps its quantity instead of duplicating
  // the line; unit price is the inventory cost price.
  function addFromInventory(id: string) {
    const inv = inventory.find((i) => i.id === id)
    if (!inv) return
    setItems((prev) => {
      const existing = prev.find((l) => l.inventory_item_id === id || String(l.drug_name || '').trim().toLowerCase() === String(inv.drug_name || '').trim().toLowerCase())
      if (existing) return prev.map((l) => l.key === existing.key ? { ...l, quantity: String((parseInt(l.quantity, 10) || 0) + 1) } : l)
      return [...prev, { ...newLine(), inventory_item_id: inv.id, drug_name: inv.drug_name || '', unit: inv.base_unit || '', unit_price: String(invUnitPrice(inv)) }]
    })
  }
  function removeLine(key: string) { setItems((prev) => prev.length === 1 ? prev : prev.filter((l) => l.key !== key)) }

  async function saveOrder() {
    setFormError('')
    const payloadItems = items
      .filter((l) => l.drug_name.trim())
      .map((l) => ({ inventory_item_id: l.inventory_item_id, drug_name: l.drug_name.trim(), unit: l.unit.trim() || null, quantity: parseInt(l.quantity, 10) || 0, unit_price: parseFloat(l.unit_price) || 0 }))
    if (payloadItems.length === 0) { setFormError('Add at least one item'); return }
    if (payloadItems.some((i) => i.quantity <= 0)) { setFormError('Every item needs a quantity greater than zero'); return }
    if (!editingId) {
      const first = parseFloat(initialPayment) || 0
      if (first > formTotals.total + 0.005) { setFormError(`Initial payment cannot exceed the order total (${naira(formTotals.total)})`); return }
    }
    setSaving(true)
    try {
      const body: any = {
        supplier: form.supplier.trim() || null, supplier_address: form.supplier_address.trim() || null,
        supplier_phone: form.supplier_phone.trim() || null, expected_at: form.expected_at || null,
        notes: form.notes.trim() || null, discount: parseFloat(form.discount) || 0, tax: parseFloat(form.tax) || 0,
        items: payloadItems,
      }
      if (editingId) {
        // A received order keeps its items/status; only header fields may change.
        if (editingReceived) { delete body.items; delete body.status }
        else if (form.status) body.status = form.status
        await api.put(`/purchase-orders/${editingId}`, body)
      } else {
        const wantsRef = needsReference(paymentMethod)
        body.created_by = currentUserId
        body.initial_payment = parseFloat(initialPayment) || 0
        body.payment_method = paymentMethod || null
        body.payment_reference = wantsRef ? (paymentReference.trim() || null) : null
        body.payment_receipt_url = wantsRef ? (paymentReceipt || null) : null
        await api.post('/purchase-orders', body)
      }
      setFormOpen(false); resetForm()
      await load()
    } catch (e: any) { setFormError(e?.response?.data?.message || 'Failed to save order') } finally { setSaving(false) }
  }

  async function openDetail(order: any) {
    setDetail(order); setDetailLoading(true)
    let data: any = null
    try { const r = await api.get(`/purchase-orders/${order.id}`); data = r.data; setDetail(r.data) } catch { /* keep list row */ }
    finally { setDetailLoading(false) }
    setPayForm({ kind: num(data?.outstanding) > 0 ? 'payment' : 'refund', amount: '', method: 'cash', reference: '', note: '', receipt_url: '' })
  }
  async function refreshDetail(id: string) {
    const r = await api.get(`/purchase-orders/${id}`)
    setDetail(r.data)
    setPayForm((p) => {
      const canPay = num(r.data.outstanding) > 0
      const held = num(r.data.amount_paid) - num(r.data.refunded_amount)
      if (p.kind === 'payment' && !canPay && held > 0) return { ...p, kind: 'refund' }
      if (p.kind === 'refund' && held <= 0 && canPay) return { ...p, kind: 'payment' }
      return p
    })
    return r.data
  }

  async function submitPayment() {
    if (!detail) return
    const amount = parseFloat(payForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount greater than zero'); return }
    const outstanding = round2Safe(num(detail.outstanding))
    const held = round2Safe(num(detail.amount_paid) - num(detail.refunded_amount))
    if (payForm.kind === 'payment' && amount > outstanding + 0.005) { setError(`Amount exceeds the outstanding balance (${naira(outstanding)})`); return }
    if (payForm.kind === 'refund' && amount > held + 0.005) { setError(`Refund cannot exceed the amount held (${naira(held)})`); return }
    setPaySaving(true); setError('')
    try {
      const wantsRef = needsReference(payForm.method)
      await api.post(`/purchase-orders/${detail.id}/payments`, {
        kind: payForm.kind, amount,
        method: payForm.method || null,
        reference: wantsRef ? (payForm.reference.trim() || null) : null,
        receipt_url: wantsRef ? (payForm.receipt_url || null) : null,
        note: payForm.note.trim() || null, created_by: currentUserId,
      })
      setPayForm({ kind: 'payment', amount: '', method: 'cash', reference: '', note: '', receipt_url: '' })
      await refreshDetail(detail.id)
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to record payment') } finally { setPaySaving(false) }
  }

  async function setOrderStatus(status: string) {
    if (!detail) return
    setError('')
    try {
      await api.put(`/purchase-orders/${detail.id}`, { status })
      await refreshDetail(detail.id)
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to update status') }
  }

  async function printOrder() {
    if (!detail) return
    const info = await loadClinicInfo().catch(() => null)
    const logoUrl = info?.logo_url ? new URL(info.logo_url, window.location.origin).href : ''
    const rows = (detail.items || []).map((i: any, idx: number) => `
      <tr><td>${idx + 1}</td><td>${esc(i.drug_name)}${i.unit ? ` <span class="muted">(${esc(i.unit)})</span>` : ''}</td>
      <td class="r">${esc(i.quantity)}</td><td class="r">${esc(naira(i.unit_price))}</td><td class="r">${esc(naira(i.total_price))}</td></tr>`).join('')
    const ledger = (detail.payments || []).map((p: any) => `
      <tr><td>${p.kind === 'refund' ? 'Refund' : 'Payment'}</td><td>${esc(methodLabel(p.method))}</td>
      <td>${esc([p.reference, p.note].filter(Boolean).join(' · ')) || '—'}</td>
      <td>${new Date(p.paid_at).toLocaleDateString()}</td><td class="r">${p.kind === 'refund' ? '-' : ''}${esc(naira(p.amount))}</td></tr>`).join('')
    const netPaid = round2Safe(num(detail.amount_paid) - num(detail.refunded_amount))
    const outstanding = detail.status === 'cancelled' ? '—' : naira(detail.outstanding)

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(detail.po_number)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;padding:32px;}
        .head{display:flex;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:14px;}
        .head img{height:56px;width:56px;object-fit:contain;border-radius:8px;}
        .hosp{font-size:20px;font-weight:800;color:#1e293b;margin:0}
        .muted{color:#64748b} .sub{font-size:12px;color:#64748b;margin-top:2px}
        h1{font-size:15px;margin:22px 0 4px;letter-spacing:.5px;text-transform:uppercase;color:#4f46e5}
        .grid{display:flex;justify-content:space-between;gap:24px;margin-top:14px;font-size:13px}
        .grid p{margin:2px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
        th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:left}
        th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:.5px;color:#64748b}
        .r{text-align:right}
        .totals{margin-top:14px;margin-left:auto;width:300px;font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:4px 0}
        .totals .grand{border-top:2px solid #cbd5e1;font-weight:800;font-size:15px;padding-top:8px}
        .sig{margin-top:56px;display:flex;justify-content:space-between;gap:50px;font-size:12px;color:#64748b}
        .sig div{border-top:1px solid #94a3b8;padding-top:6px;flex:1;text-align:center}
        @media print{body{padding:14px}}
      </style></head><body>
      <div class="head">
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ''}
        <div>
          <p class="hosp">${esc(info?.hospital_name || 'Hospital')}</p>
          ${info?.address ? `<p class="sub">${esc(info.address)}</p>` : ''}
          ${info?.phone_number ? `<p class="sub">Tel: ${esc(info.phone_number)}</p>` : ''}
        </div>
      </div>
      <h1>Purchase Order</h1>
      <div class="grid">
        <div>
          <p><strong>PO No:</strong> ${esc(detail.po_number)}</p>
          <p><strong>Date:</strong> ${new Date(detail.ordered_at).toLocaleString()}</p>
          ${detail.expected_at ? `<p><strong>Expected:</strong> ${esc(String(detail.expected_at).slice(0, 10))}</p>` : ''}
          <p><strong>Status:</strong> ${esc(statusMeta(detail.status).label)}</p>
          ${detail.created_by_name ? `<p><strong>Raised by:</strong> ${esc(detail.created_by_name)}</p>` : ''}
        </div>
        <div>
          <p><strong>Supplier:</strong> ${esc(detail.supplier || '—')}</p>
          ${detail.supplier_address ? `<p><strong>Address:</strong> ${esc(detail.supplier_address)}</p>` : ''}
          ${detail.supplier_phone ? `<p><strong>Tel:</strong> ${esc(detail.supplier_phone)}</p>` : ''}
        </div>
      </div>
      ${detail.notes ? `<p class="sub" style="margin-top:10px"><strong>Notes:</strong> ${esc(detail.notes)}</p>` : ''}
      <table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">No items</td></tr>'}</tbody></table>
      <div class="totals">
        <div><span>Subtotal</span><span>${esc(naira(detail.subtotal))}</span></div>
        <div><span>Discount</span><span>-${esc(naira(detail.discount))}</span></div>
        <div><span>Tax</span><span>+${esc(naira(detail.tax))}</span></div>
        <div class="grand"><span>Total</span><span>${esc(naira(detail.total))}</span></div>
        <div><span>Paid</span><span>${esc(naira(netPaid))}</span></div>
        ${num(detail.refunded_amount) > 0 ? `<div><span>Refunded</span><span>${esc(naira(detail.refunded_amount))}</span></div>` : ''}
        <div><span>Outstanding</span><span>${esc(outstanding)}</span></div>
      </div>
      ${ledger ? `<h1 style="margin-top:26px">Payments &amp; Refunds</h1>
        <table><thead><tr><th>Type</th><th>Method</th><th>Reference / note</th><th>Date</th><th class="r">Amount</th></tr></thead><tbody>${ledger}</tbody></table>` : ''}
      <div class="sig"><div>Prepared by</div><div>Approved by</div><div>Supplier</div></div>
      </body></html>`

    const w = window.open('', '_blank', 'width=900,height=720')
    if (!w) { setError('Allow pop-ups to print the purchase order'); return }
    w.document.open(); w.document.write(html); w.document.close()
    w.focus()
    setTimeout(() => { try { w.print() } catch { /* user can print manually */ } }, 300)
  }

  function openPayTarget(order: any) {
    setPayTarget(order)
    setPayTargetForm({ amount: '', method: 'cash', reference: '', note: '', receipt_url: '' })
    setPayTargetError('')
  }

  async function submitPayTarget() {
    if (!payTarget) return
    const outstanding = round2Safe(num(payTarget.outstanding))
    const amount = parseFloat(payTargetForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setPayTargetError('Enter an amount greater than zero'); return }
    if (amount > outstanding + 0.005) { setPayTargetError(`Amount exceeds the outstanding balance (${naira(outstanding)})`); return }
    setPayTargetSaving(true); setPayTargetError('')
    try {
      const wantsRef = needsReference(payTargetForm.method)
      await api.post(`/purchase-orders/${payTarget.id}/payments`, {
        kind: 'payment', amount, method: payTargetForm.method || null,
        reference: wantsRef ? (payTargetForm.reference.trim() || null) : null,
        receipt_url: wantsRef ? (payTargetForm.receipt_url || null) : null,
        note: payTargetForm.note.trim() || null, created_by: currentUserId,
      })
      setPayTarget(null)
      await load()
    } catch (e: any) { setPayTargetError(e?.response?.data?.message || 'Failed to record payment') } finally { setPayTargetSaving(false) }
  }

  async function handleTargetReceipt(file?: File) {
    if (!file) return
    setUploadingTarget(true); setPayTargetError('')
    try { const path = await uploadReceipt(file); setPayTargetForm((p) => ({ ...p, receipt_url: path })) }
    catch { setPayTargetError('Receipt upload failed') } finally { setUploadingTarget(false) }
  }

  async function handleInitReceipt(file?: File) {
    if (!file) return
    setUploadingInit(true); setFormError('')
    try { setPaymentReceipt(await uploadReceipt(file)) }
    catch { setFormError('Receipt upload failed') } finally { setUploadingInit(false) }
  }
  async function handlePayReceipt(file?: File) {
    if (!file) return
    setUploadingPay(true); setError('')
    try { const path = await uploadReceipt(file); setPayForm((p) => ({ ...p, receipt_url: path })) }
    catch { setError('Receipt upload failed') } finally { setUploadingPay(false) }
  }

  async function confirmReceive() {
    if (!receiveTarget) return
    setConfirmBusy(true); setError('')
    try {
      await api.post(`/purchase-orders/${receiveTarget.id}/receive`, { performed_by: currentUserId })
      setReceiveTarget(null)
      if (detail?.id === receiveTarget.id) await refreshDetail(receiveTarget.id).catch(() => {})
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to receive order') } finally { setConfirmBusy(false) }
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setConfirmBusy(true); setError('')
    try {
      await api.post(`/purchase-orders/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() || null, performed_by: currentUserId })
      setCancelTarget(null); setCancelReason('')
      if (detail?.id === cancelTarget.id) await refreshDetail(cancelTarget.id).catch(() => {})
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to cancel order') } finally { setConfirmBusy(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setConfirmBusy(true); setError('')
    try {
      await api.delete(`/purchase-orders/${deleteTarget.id}`)
      setDeleteTarget(null)
      if (detail?.id === deleteTarget.id) setDetail(null)
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete order') } finally { setConfirmBusy(false) }
  }

  const canManage = currentRole === 'Admin' || currentRole === 'Pharmacist'
  const detailOutstanding = detail ? round2Safe(num(detail.outstanding)) : 0
  const detailHeld = detail ? round2Safe(num(detail.amount_paid) - num(detail.refunded_amount)) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Truck size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Purchase Orders</h1>
            <p className="text-sm text-slate-500">Order stock from suppliers · track payments, receipts and refunds</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <Plus size={16} /> New Purchase Order
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Orders', value: stats.total, cls: 'text-slate-700' },
          { label: 'Outstanding', value: naira(stats.outstanding), cls: 'text-amber-600' },
          { label: 'Paid', value: naira(stats.paid), cls: 'text-emerald-600' },
          { label: 'Received', value: stats.received, cls: 'text-indigo-600' },
          { label: 'Cancelled', value: stats.cancelled, cls: 'text-rose-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-lg font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO #, supplier, item…"
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['all', 'All'], ['pending', 'Pending'], ['partially_paid', 'Partially paid'], ['paid', 'Paid'], ['received', 'Received'], ['cancelled', 'Cancelled']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === k ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertTriangle size={15} /> {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">{orders.length === 0 ? 'No purchase orders yet' : 'Nothing matches your filters'}</p>
          {orders.length === 0 && (
            <button onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
              <Plus size={16} /> Create your first order
            </button>
          )}
        </div>
      ) : (
        <>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">PO #</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ordered</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paged.map((o) => {
                  const meta = statusMeta(o.status)
                  const overpaid = num(o.amount_paid) - num(o.refunded_amount) > num(o.total)
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.po_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{o.supplier || '—'}</p>
                        {o.supplier_address && <p className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin size={10} />{o.supplier_address}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {concise((o.items || []).map((i: any) => i.drug_name)) || '—'}
                        <span className="text-[10px] text-slate-400 ml-1">({(o.items || []).length})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{naira(o.total)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{naira(num(o.amount_paid) - num(o.refunded_amount))}{num(o.refunded_amount) > 0 && <span className="block text-[10px] text-rose-500">refunded {naira(o.refunded_amount)}</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {o.status === 'cancelled' ? <span className="text-slate-400">—</span> : overpaid ? <span className="text-blue-600">overpaid {naira(num(o.amount_paid) - num(o.refunded_amount) - num(o.total))}</span> : <span className={num(o.outstanding) > 0 ? 'text-amber-600' : 'text-emerald-600'}>{naira(o.outstanding)}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-semibold ${meta.cls}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(o.ordered_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDetail(o)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600" title="View"><Eye size={14} /></button>
                          {canManage && o.status !== 'received' && o.status !== 'cancelled' && (
                            <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Edit"><Edit2 size={14} /></button>
                          )}
                          {canManage && o.status !== 'cancelled' && num(o.outstanding) > 0 && (
                            <button onClick={() => openPayTarget(o)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="Record payment"><Banknote size={14} /></button>
                          )}
                          {canManage && o.status !== 'received' && o.status !== 'cancelled' && (
                            <>
                              <button onClick={() => setReceiveTarget(o)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="Receive stock"><CheckCircle size={14} /></button>
                              <button onClick={() => { setCancelTarget(o); setCancelReason('') }} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Cancel order"><Ban size={14} /></button>
                            </>
                          )}
                          {canManage && o.status !== 'received' && num(o.amount_paid) === 0 && (
                            <button onClick={() => setDeleteTarget(o)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500" title="Delete"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination — 25 per page */}
        {visible.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-slate-400">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visible.length)} of {visible.length}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Page {safePage} <span className="text-slate-400 font-medium">/ {totalPages}</span>
                </span>
                <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
        </>
      )}

      {/* Create / edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { if (!saving) { setFormOpen(false); resetForm() } }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Truck size={18} className="text-indigo-500" />{editingId ? 'Edit Purchase Order' : 'New Purchase Order'}</h2>
              <button onClick={() => { setFormOpen(false); resetForm() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Supplier</label>
                  <input value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} placeholder="e.g. PharmaCorp Ltd" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Supplier phone</label>
                  <input value={form.supplier_phone} onChange={(e) => setForm((p) => ({ ...p, supplier_phone: e.target.value }))} placeholder="e.g. 0803 000 0000" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Supplier address</label>
                  <input value={form.supplier_address} onChange={(e) => setForm((p) => ({ ...p, supplier_address: e.target.value }))} placeholder="e.g. 12 Broad Street, Lagos" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Expected delivery</label>
                  <input type="date" value={form.expected_at} onChange={(e) => setForm((p) => ({ ...p, expected_at: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                  <AutoTextarea value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} placeholder="Optional"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</label>
                  {!editingReceived && (
                    <div className="flex items-center gap-2">
                      <select value="" onChange={(e) => { if (e.target.value) addFromInventory(e.target.value) }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-primary outline-none max-w-[220px]">
                        <option value="">Add from inventory…</option>
                        {inventory.map((i) => <option key={i.id} value={i.id}>{i.drug_name}</option>)}
                      </select>
                      <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900"><Plus size={12} /> Add item</button>
                    </div>
                  )}
                </div>
                {editingReceived && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                    <CheckCircle size={13} /> This order is received — items are locked. You can still update supplier, notes, discount or tax.
                  </div>
                )}
                <datalist id="po-item-names">
                  {inventory.map((i) => <option key={i.id} value={i.drug_name} />)}
                </datalist>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase">
                      <th className="px-3 py-2 font-medium">Item / drug</th>
                      <th className="px-3 py-2 font-medium w-24">Unit</th>
                      <th className="px-3 py-2 font-medium w-24">Qty</th>
                      <th className="px-3 py-2 font-medium w-32">Unit price (₦)</th>
                      <th className="px-3 py-2 font-medium w-32 text-right">Line total</th>
                      <th className="w-10" />
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((l) => {
                        const lineTotal = (parseInt(l.quantity || '0', 10) || 0) * (parseFloat(l.unit_price || '0') || 0)
                        return (
                          <tr key={l.key}>
                            <td className="px-3 py-2"><input list="po-item-names" value={l.drug_name} disabled={editingReceived} onChange={(e) => onItemNameChange(l.key, e.target.value)} placeholder="Search inventory or type a new item" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none disabled:bg-slate-50 disabled:text-slate-500" /></td>
                            <td className="px-3 py-2"><input value={l.unit} disabled={editingReceived} onChange={(e) => updateLine(l.key, { unit: e.target.value })} placeholder="unit" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none disabled:bg-slate-50 disabled:text-slate-500" /></td>
                            <td className="px-3 py-2"><input type="number" min={1} value={l.quantity} disabled={editingReceived} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none disabled:bg-slate-50 disabled:text-slate-500" /></td>
                            <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unit_price} disabled={editingReceived} onChange={(e) => updateLine(l.key, { unit_price: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none disabled:bg-slate-50 disabled:text-slate-500" /></td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">{naira(lineTotal)}</td>
                            <td className="px-2 py-2 text-center">{!editingReceived && <button onClick={() => removeLine(l.key)} disabled={items.length === 1} className="p-1 rounded hover:bg-rose-50 text-rose-500 disabled:opacity-30"><Trash2 size={13} /></button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Discount (₦)</label>
                  <input type="number" min={0} step="0.01" value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Tax / VAT (₦)</label>
                  <input type="number" min={0} step="0.01" value={form.tax} onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none" /></div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
                  <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{naira(formTotals.subtotal)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{naira(formTotals.discount)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Tax</span><span>+{naira(formTotals.tax)}</span></div>
                  <div className="flex justify-between font-bold text-slate-800 mt-1 border-t border-slate-200 pt-1"><span>Total</span><span>{naira(formTotals.total)}</span></div>
                </div>
              </div>

              {editingId && !editingReceived && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Order status</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Auto — from payments</option>
                    <option value="pending">Pending payment</option>
                    <option value="partially_paid">Partially paid</option>
                    <option value="paid">Paid</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Recording a new payment switches this back to automatic.</p>
                </div>
              )}

              {!editingId && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Initial payment (optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="number" min={0} step="0.01" value={initialPayment}
                      onChange={(e) => {
                        const raw = e.target.value
                        const parsed = parseFloat(raw)
                        setInitialPayment(raw !== '' && Number.isFinite(parsed) && parsed > formTotals.total ? String(formTotals.total) : raw)
                      }}
                      placeholder={`Amount paid (max ${naira(formTotals.total)})`} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none" />
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                      {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  {needsReference(paymentMethod) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Reference" className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3.5 py-2.5 text-sm text-slate-500 cursor-pointer hover:bg-slate-50">
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleInitReceipt(e.target.files?.[0])} />
                        {uploadingInit ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {paymentReceipt ? 'Receipt attached' : 'Upload receipt'}
                      </label>
                    </div>
                  )}
                  {paymentReceipt && <p className="text-[11px] text-emerald-600">Receipt: <a href={paymentReceipt} target="_blank" rel="noreferrer" className="underline">view</a></p>}
                </div>
              )}

              {formError && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {formError}</p>}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => { setFormOpen(false); resetForm() }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={saveOrder} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {editingId ? 'Save changes' : 'Create order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Truck size={18} className="text-indigo-500" /> {detail.po_number}</h2>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><CalendarDays size={11} /> {new Date(detail.ordered_at).toLocaleString()}{detail.created_by_name ? ` · by ${detail.created_by_name}` : ''}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Supplier</p>
                  <p className="font-medium text-slate-800">{detail.supplier || '—'}</p>
                  {detail.supplier_address && <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} />{detail.supplier_address}</p>}
                  {detail.supplier_phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} />{detail.supplier_phone}</p>}
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
                  {canManage && detail.status !== 'received' && detail.status !== 'cancelled' ? (
                    <select value={detail.status} onChange={(e) => setOrderStatus(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium bg-white focus:ring-2 focus:ring-primary outline-none">
                      <option value="pending">Pending payment</option>
                      <option value="partially_paid">Partially paid</option>
                      <option value="paid">Paid</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-semibold ${statusMeta(detail.status).cls}`}>{statusMeta(detail.status).label}</span>
                  )}
                  {detail.expected_at && <p className="text-xs text-slate-500">Expected: {String(detail.expected_at).slice(0, 10)}</p>}
                  {detail.notes && <p className="text-xs text-slate-500 flex items-start gap-1"><FileText size={11} className="mt-0.5" />{detail.notes}</p>}
                  {detail.status === 'cancelled' && detail.cancel_reason && <p className="text-xs text-rose-600">Reason: {detail.cancel_reason}</p>}
                </div>
              </div>

              {/* Items */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase">
                    <th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Unit price</th><th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">Received</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(detail.items || []).map((i: any) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 text-slate-700">{i.drug_name}{i.unit ? <span className="text-slate-400"> · {i.unit}</span> : ''}</td>
                        <td className="px-3 py-2 text-right">{i.quantity}</td>
                        <td className="px-3 py-2 text-right">{naira(i.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-medium">{naira(i.total_price)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{i.received_quantity || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-1">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{naira(detail.subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{naira(detail.discount)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Tax</span><span>+{naira(detail.tax)}</span></div>
                <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1"><span>Total</span><span>{naira(detail.total)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{naira(num(detail.amount_paid) - num(detail.refunded_amount))}</span></div>
                {num(detail.refunded_amount) > 0 && <div className="flex justify-between text-rose-600"><span>Refunded</span><span>{naira(detail.refunded_amount)}</span></div>}
                <div className="flex justify-between font-semibold">
                  <span>Outstanding</span>
                  {detail.status === 'cancelled' ? <span className="text-slate-400">—</span>
                    : num(detail.amount_paid) - num(detail.refunded_amount) > num(detail.total)
                      ? <span className="text-blue-600">overpaid {naira(num(detail.amount_paid) - num(detail.refunded_amount) - num(detail.total))}</span>
                      : <span className={num(detail.outstanding) > 0 ? 'text-amber-600' : 'text-emerald-600'}>{naira(detail.outstanding)}</span>}
                </div>
              </div>

              {/* Ledger */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payments &amp; refunds</p>
                {(detail.payments || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No payments recorded yet.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                    {(detail.payments || []).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.kind === 'refund' ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {p.kind === 'refund' ? <RotateCcw size={12} /> : <Banknote size={12} />}{p.kind === 'refund' ? 'Refund' : 'Payment'}
                        </span>
                        <span className="text-xs text-slate-400 flex-1 px-3 truncate">
                          {[methodLabel(p.method), p.reference, p.note].filter(Boolean).join(' · ') || '—'}
                          {p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noreferrer" className="ml-1 text-emerald-600 underline">receipt</a>}
                        </span>
                        <span className={`font-medium ${p.kind === 'refund' ? 'text-rose-600' : 'text-slate-800'}`}>{p.kind === 'refund' ? '-' : ''}{naira(p.amount)}</span>
                        <span className="text-[11px] text-slate-400 ml-3 whitespace-nowrap">{new Date(p.paid_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {canManage && detail.status !== 'cancelled' && (detailOutstanding > 0 || detailHeld > 0) && (
                  <div className="mt-3 rounded-xl border border-slate-200 p-3.5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex gap-1.5">
                        {detailOutstanding > 0 && (
                          <button onClick={() => setPayForm((p) => ({ ...p, kind: 'payment' }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${payForm.kind === 'payment' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Record payment</button>
                        )}
                        {detailHeld > 0 && (
                          <button onClick={() => setPayForm((p) => ({ ...p, kind: 'refund' }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${payForm.kind === 'refund' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Record refund</button>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {payForm.kind === 'payment' ? `Outstanding ${naira(detailOutstanding)}` : `Held ${naira(detailHeld)}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="number" min={0} step="0.01" value={payForm.amount}
                        onChange={(e) => {
                          const raw = e.target.value
                          const max = payForm.kind === 'payment' ? detailOutstanding : detailHeld
                          const parsed = parseFloat(raw)
                          setPayForm((p) => ({ ...p, amount: (raw !== '' && Number.isFinite(parsed) && parsed > max) ? String(max) : raw }))
                        }}
                        placeholder={payForm.kind === 'payment' ? `Amount (max ${naira(detailOutstanding)})` : `Refund amount (max ${naira(detailHeld)})`}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary outline-none" />
                      <select value={payForm.method} onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                        {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    {needsReference(payForm.method) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} placeholder="Reference"
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 cursor-pointer hover:bg-slate-50">
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handlePayReceipt(e.target.files?.[0])} />
                          {uploadingPay ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                          {payForm.receipt_url ? 'Receipt attached' : 'Upload receipt'}
                        </label>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <AutoTextarea value={payForm.note} onChange={(v) => setPayForm((p) => ({ ...p, note: v }))} placeholder="Note (optional)"
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <button onClick={submitPayment} disabled={paySaving}
                        className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${payForm.kind === 'refund' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                        {paySaving ? <Loader2 size={14} className="animate-spin" /> : payForm.kind === 'refund' ? <RotateCcw size={14} /> : <Banknote size={14} />} Save
                      </button>
                    </div>
                    {payForm.receipt_url && <a href={payForm.receipt_url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 underline">View attached receipt</a>}
                  </div>
                )}
              </div>

              {detailLoading && <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Refreshing…</p>}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3 flex-shrink-0">
              <div className="flex gap-2">
                {canManage && detail.status !== 'received' && detail.status !== 'cancelled' && (
                  <>
                    <button onClick={() => setReceiveTarget(detail)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><CheckCircle size={14} /> Receive stock</button>
                    <button onClick={() => { setCancelTarget(detail); setCancelReason('') }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50"><Ban size={14} /> Cancel</button>
                  </>
                )}
                {canManage && detail.status !== 'received' && num(detail.amount_paid) === 0 && (
                  <button onClick={() => setDeleteTarget(detail)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50"><Trash2 size={14} /> Delete</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printOrder} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"><Printer size={14} /> Print</button>
                <button onClick={() => setDetail(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick record payment from the list */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!payTargetSaving) setPayTarget(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Banknote size={18} className="text-emerald-500" /> Record Payment</h2>
              <button onClick={() => setPayTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm flex items-center justify-between gap-3">
                <span className="text-slate-500 truncate">{payTarget.po_number}{payTarget.supplier ? ` · ${payTarget.supplier}` : ''}</span>
                <span className="font-semibold text-amber-600 whitespace-nowrap">Outstanding {naira(payTarget.outstanding)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Amount (₦)</label>
                  <input type="number" min={0} step="0.01" value={payTargetForm.amount}
                    onChange={(e) => {
                      const raw = e.target.value
                      const parsed = parseFloat(raw)
                      const max = round2Safe(num(payTarget.outstanding))
                      setPayTargetForm((f) => ({ ...f, amount: (raw !== '' && Number.isFinite(parsed) && parsed > max) ? String(max) : raw }))
                    }}
                    placeholder={`Max ${naira(payTarget.outstanding)}`}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
                  <select value={payTargetForm.method} onChange={(e) => setPayTargetForm((f) => ({ ...f, method: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              {needsReference(payTargetForm.method) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={payTargetForm.reference} onChange={(e) => setPayTargetForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Reference"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3.5 py-2.5 text-sm text-slate-500 cursor-pointer hover:bg-slate-50">
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleTargetReceipt(e.target.files?.[0])} />
                    {uploadingTarget ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    {payTargetForm.receipt_url ? 'Receipt attached' : 'Upload receipt'}
                  </label>
                </div>
              )}
              <AutoTextarea value={payTargetForm.note} onChange={(v) => setPayTargetForm((f) => ({ ...f, note: v }))} placeholder="Note (optional)"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              {payTargetForm.receipt_url && <a href={payTargetForm.receipt_url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 underline">View attached receipt</a>}
              {payTargetError && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {payTargetError}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={submitPayTarget} disabled={payTargetSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {payTargetSaving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />} Record payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive confirm */}
      {receiveTarget && (
        <ConfirmModal
          tone="emerald" icon={<CheckCircle size={22} className="text-emerald-600" />}
          title="Receive this order?" busy={confirmBusy}
          body={<><strong>{receiveTarget.po_number}</strong> · {(receiveTarget.items || []).length} item(s) will be added to pharmacy stock and marked received.</>}
          confirmLabel="Receive stock"
          onCancel={() => setReceiveTarget(null)} onConfirm={confirmReceive}
        />
      )}

      {/* Cancel confirm */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!confirmBusy) setCancelTarget(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3"><Ban size={22} className="text-amber-600" /></div>
              <h2 className="text-base font-semibold text-slate-800">Cancel this order?</h2>
              <p className="text-sm text-slate-500 mt-1"><strong>{cancelTarget.po_number}</strong> will be marked cancelled. Record any refund separately.</p>
              <AutoTextarea value={cancelReason} onChange={setCancelReason} placeholder="Reason (optional)"
                className="w-full mt-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="px-6 pb-6 flex justify-center gap-3">
              <button onClick={() => setCancelTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Keep order</button>
              <button onClick={confirmCancel} disabled={confirmBusy} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {confirmBusy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Cancel order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          tone="rose" icon={<Trash2 size={22} className="text-rose-600" />}
          title="Delete this order?" busy={confirmBusy}
          body={<><strong>{deleteTarget.po_number}</strong> and its items will be permanently removed. Only unpaid, unreceived orders can be deleted.</>}
          confirmLabel="Delete order"
          onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function ConfirmModal({ tone, icon, title, body, confirmLabel, busy, onCancel, onConfirm }: {
  tone: 'emerald' | 'rose' | 'amber'
  icon: ReactNode
  title: string
  body: ReactNode
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const btn = tone === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : tone === 'amber' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
  const ring = tone === 'rose' ? 'bg-rose-100' : tone === 'amber' ? 'bg-amber-100' : 'bg-emerald-100'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!busy) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className={`mx-auto w-12 h-12 rounded-full ${ring} flex items-center justify-center mb-3`}>{icon}</div>
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{body}</p>
        </div>
        <div className="px-6 pb-6 flex justify-center gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${btn}`}>
            {busy && <Loader2 size={14} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
