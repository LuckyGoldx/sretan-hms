import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Loader2, Plus, Receipt, X, Upload, Trash2, Pencil, CheckCircle, Clock, XCircle,
  Wallet, Calendar, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react'

const currentUser: any = (() => { try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch {} return null })()
const isAdmin = currentUser?.role === 'Admin'
const LIMIT = 20

const today = new Date().toISOString().slice(0, 10)
const emptyForm = { category_id: '', amount: '', expense_date: today, payment_method: 'cash', payee: '', description: '', receipt_url: '' }

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function getDateRange(preset: string, customDay: string, from: string, to: string): { from: string; to: string } {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today': return { from: ymd(start), to: ymd(start) }
    case 'yesterday': { const y = new Date(start); y.setDate(y.getDate() - 1); return { from: ymd(y), to: ymd(y) } }
    case 'week': { const w = new Date(start); w.setDate(w.getDate() - 6); return { from: ymd(w), to: ymd(start) } }
    case 'month': { const m = new Date(now.getFullYear(), now.getMonth(), 1); return { from: ymd(m), to: ymd(start) } }
    case 'year': { const y = new Date(now.getFullYear(), 0, 1); return { from: ymd(y), to: ymd(start) } }
    case 'custom_day': return { from: customDay, to: customDay }
    case 'custom': return { from, to }
    default: return { from: '', to: '' }
  }
}

export default function ExpensesPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [catOptions, setCatOptions] = useState<any[]>([])
  const [datePreset, setDatePreset] = useState('all')
  const [customDay, setCustomDay] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const dateRange = getDateRange(datePreset, customDay, customFrom, customTo)
  const [stats, setStats] = useState<any>({})
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<any | null>(null)

  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function loadCategories() {
    try { const r = await api.get('/expense-categories'); setCategories(r.data || []) } catch {}
  }
  async function loadRows() {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.append('staff_id', currentUser?.id || '')
      p.append('page', String(page)); p.append('limit', String(LIMIT))
      if (statusFilter) p.append('status', statusFilter)
      if (categoryFilter) p.append('category', categoryFilter)
      if (dateRange.from) p.append('date_from', dateRange.from)
      if (dateRange.to) p.append('date_to', dateRange.to)
      const r = await api.get(`/expenses?${p.toString()}`)
      setRows(r.data?.rows || []); setTotal(r.data?.total || 0)
    } catch { setRows([]); setTotal(0) } finally { setLoading(false) }
  }
  async function loadStats() {
    try {
      const p = new URLSearchParams()
      p.append('staff_id', currentUser?.id || '')
      if (categoryFilter) p.append('category', categoryFilter)
      if (dateRange.from) p.append('date_from', dateRange.from)
      if (dateRange.to) p.append('date_to', dateRange.to)
      const r = await api.get(`/expenses/stats?${p.toString()}`)
      setStats(r.data || {})
    } catch {}
  }
  async function loadCatOptions() {
    try { const r = await api.get(`/expenses/categories-in-use?staff_id=${currentUser?.id || ''}`); setCatOptions(r.data || []) } catch {}
  }
  useEffect(() => { loadCategories(); loadCatOptions() }, [])
  useEffect(() => { loadRows() }, [page, statusFilter, categoryFilter, dateRange.from, dateRange.to])
  // Cards follow the category/date filters (Approved This Month stays fixed).
  useEffect(() => { loadStats() }, [categoryFilter, dateRange.from, dateRange.to])

  function openNew() { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); setError('') }
  function openEdit(e: any) {
    setForm({ category_id: e.category_id || '', amount: String(e.amount ?? ''), expense_date: (e.expense_date || today).slice(0, 10), payment_method: e.payment_method || 'cash', payee: e.payee || '', description: e.description || '', receipt_url: e.receipt_url || '' })
    setEditingId(e.id); setShowForm(true); setError('')
  }

  async function uploadReceipt(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm((f: any) => ({ ...f, receipt_url: r.data?.path || '' }))
    } catch { setError('Receipt upload failed.') } finally { setUploading(false) }
  }

  async function save() {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a positive amount.'); return }
    if (!form.description.trim()) { setError('Enter a description.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        staff_id: currentUser?.id, actor_role: currentUser?.role,
        category_id: form.category_id || null,
        amount: amt, expense_date: form.expense_date, payment_method: form.payment_method,
        payee: form.payee || null, description: form.description.trim(), receipt_url: form.receipt_url || null,
      }
      if (editingId) await api.put(`/expenses/${editingId}`, payload)
      else await api.post('/expenses', payload)
      setShowForm(false); setForm({ ...emptyForm }); setEditingId(null)
      await loadRows(); await loadStats(); await loadCatOptions()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save expense.') } finally { setSaving(false) }
  }

  async function remove(e: any) {
    if (!confirm(`Delete this pending expense (${e.reference || ''})?`)) return
    try {
      await api.delete(`/expenses/${e.id}?staff_id=${currentUser?.id}&actor_role=${currentUser?.role}`)
      await loadRows(); await loadStats(); await loadCatOptions()
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete.') }
  }

  async function openDetail(e: any) {
    try { const r = await api.get(`/expenses/${e.id}`); setDetail(r.data) } catch { setDetail(e) }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-500',
    }
    return `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${map[s] || 'bg-slate-100 text-slate-500'}`
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Wallet size={22} className="text-amber-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">My Expenses</h1>
            <p className="text-sm text-slate-500">{isAdmin ? 'Admin expenses are auto-approved.' : 'Record an expense and submit it for approval.'}</p>
          </div>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90"><Plus size={15} /> Record Expense</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-amber-600">{money(stats.pending_amount)}</p>
          <p className="text-xs text-slate-400">Pending ({stats.pending_count || 0})</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{money(stats.approved_amount)}</p>
          <p className="text-xs text-slate-400">Approved ({stats.approved_count || 0})</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-rose-600">{money(stats.rejected_amount)}</p>
          <p className="text-xs text-slate-400">Rejected ({stats.rejected_count || 0})</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">{money(stats.month_approved)}</p>
          <p className="text-xs text-slate-400">Approved This Month</p>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Categories</option>
          {catOptions.map((c: any) => <option key={c.category} value={c.category}>{c.category} ({c.count})</option>)}
        </select>
        <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="all">All Time</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
          <option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option>
          <option value="custom_day">Custom Day</option><option value="custom">Custom Range</option>
        </select>
        {datePreset === 'custom_day' && (
          <input type="date" value={customDay} onChange={(e) => { setCustomDay(e.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" />
        )}
        {datePreset === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="From" />
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="To" />
          </>
        )}
        <span className="text-xs text-slate-400 ml-auto">{total} expense{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center"><Receipt size={44} className="text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-400">No expenses recorded yet.</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-5 py-3">Reference</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(e)}>
                    <td className="px-5 py-3 font-mono text-primary text-xs">{e.reference || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{(e.expense_date || '').slice(0, 10)}</td>
                    <td className="px-5 py-3 text-slate-600">{e.category || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 max-w-[280px] truncate">{e.description}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(e.amount)}</td>
                    <td className="px-5 py-3"><span className={statusBadge(e.status)}>{e.status}</span></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={(ev) => { ev.stopPropagation(); openDetail(e) }} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Eye size={11} /> View</button>
                        {e.status === 'pending' && (
                          <>
                            <button onClick={(ev) => { ev.stopPropagation(); openEdit(e) }} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Pencil size={11} /> Edit</button>
                            <button onClick={(ev) => { ev.stopPropagation(); remove(e) }} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-medium hover:bg-rose-100 inline-flex items-center gap-1"><Trash2 size={11} /> Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={13} /> Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={13} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg mx-4 max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Wallet size={17} className="text-amber-500" /> {editingId ? 'Edit Expense' : 'Record Expense'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {isAdmin && !editingId && <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">Admin expense — will be auto-approved.</p>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                  <select value={form.category_id} onChange={(e) => setForm((f: any) => ({ ...f, category_id: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select category...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Amount<Req /></label>
                  <input type="number" min="0" value={form.amount} onChange={(e) => setForm((f: any) => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><Calendar size={12} /> Date</label>
                  <input type="date" value={form.expense_date} onChange={(e) => setForm((f: any) => ({ ...f, expense_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm((f: any) => ({ ...f, payment_method: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
                    <option value="cash">Cash</option><option value="transfer">Transfer</option><option value="pos">POS</option><option value="card">Card</option>
                  </select></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Payee / Vendor</label>
                <input type="text" placeholder="Who was paid (optional)" value={form.payee} onChange={(e) => setForm((f: any) => ({ ...f, payee: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Description<Req /></label>
                <textarea rows={3} placeholder="What was the expense for?" value={form.description} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary resize-y" /></div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Receipt (optional)</label>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f) }} />
                <div className="flex items-center gap-2">
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {form.receipt_url ? 'Replace receipt' : 'Attach receipt'}
                  </button>
                  {form.receipt_url && <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline truncate max-w-[220px]">View attached</a>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowForm(false)} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} {editingId ? 'Save Changes' : 'Submit Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h2 className="text-base font-semibold text-slate-800">Expense Details</h2><p className="text-xs text-slate-400 font-mono">{detail.reference || ''}</p></div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-slate-800">{money(detail.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={statusBadge(detail.status)}>{detail.status}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="text-slate-700">{detail.category || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="text-slate-700">{(detail.expense_date || '').slice(0, 10)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="text-slate-700 capitalize">{detail.payment_method}</span></div>
              {detail.payee && <div className="flex justify-between"><span className="text-slate-500">Payee</span><span className="text-slate-700">{detail.payee}</span></div>}
              <div className="pt-2 border-t border-slate-100"><p className="text-slate-500 text-xs mb-1">Description</p><p className="text-slate-700">{detail.description}</p></div>
              {detail.decision_reason && <div className="pt-2 border-t border-slate-100"><p className="text-slate-500 text-xs mb-1">Decision note</p><p className={detail.status === 'rejected' ? 'text-rose-600' : 'text-slate-700'}>{detail.decision_reason}</p></div>}
              {detail.receipt_url && <a href={detail.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">View receipt</a>}
              {Array.isArray(detail.history) && detail.history.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</p>
                  <div className="space-y-2">
                    {detail.history.map((h: any) => (
                      <div key={h.id} className="flex items-start gap-2 text-xs">
                        {h.action === 'approved' ? <CheckCircle size={13} className="text-emerald-600 mt-0.5" /> : h.action === 'rejected' ? <XCircle size={13} className="text-rose-600 mt-0.5" /> : <Clock size={13} className="text-slate-400 mt-0.5" />}
                        <div><p className="text-slate-700 capitalize">{h.action}{h.actor_name ? ` · ${h.actor_name}` : ''}</p><p className="text-slate-400">{new Date(h.created_at).toLocaleString()}{h.reason ? ` · ${h.reason}` : ''}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Req() { return <span className="text-rose-500">*</span> }
