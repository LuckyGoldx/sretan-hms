import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Loader2, Search, CheckCircle, XCircle, Clock, X, Wallet, Receipt, ChevronLeft, ChevronRight,
  Plus, Trash2, Tag, RefreshCw, Eye,
} from 'lucide-react'

const currentUser: any = (() => { try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch {} return null })()
const isAdmin = currentUser?.role === 'Admin'
const LIMIT = 20

const today = new Date().toISOString().slice(0, 10)
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

export default function ExpenseTracker() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'expenses' | 'categories'>('expenses')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<any>({})
  const [categories, setCategories] = useState<any[]>([])

  const [status, setStatus] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [catInUse, setCatInUse] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [customDay, setCustomDay] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const dateRange = getDateRange(datePreset, customDay, customFrom, customTo)

  const [detail, setDetail] = useState<any | null>(null)
  const [rejectFor, setRejectFor] = useState<any | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')

  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const canApprove = ['Paypoint', 'Finance', 'Admin'].includes(currentUser?.role)

  async function load() {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      p.append('scope', 'all'); p.append('viewer_role', currentUser?.role || '')
      p.append('page', String(page)); p.append('limit', String(LIMIT))
      if (status) p.append('status', status)
      if (categoryFilter) p.append('category', categoryFilter)
      if (search) p.append('search', search)
      if (dateRange.from) p.append('date_from', dateRange.from)
      if (dateRange.to) p.append('date_to', dateRange.to)
      const r = await api.get(`/expenses?${p.toString()}`)
      setRows(r.data?.rows || []); setTotal(r.data?.total || 0); setTotalAmount(Number(r.data?.total_amount) || 0)
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load expenses.'); setRows([]); setTotal(0) } finally { setLoading(false) }
  }
  async function loadStats() {
    try {
      const p = new URLSearchParams()
      p.append('scope', 'all'); p.append('viewer_role', currentUser?.role || '')
      if (categoryFilter) p.append('category', categoryFilter)
      if (dateRange.from) p.append('date_from', dateRange.from)
      if (dateRange.to) p.append('date_to', dateRange.to)
      const r = await api.get(`/expenses/stats?${p.toString()}`); setStats(r.data || {})
    } catch {}
  }
  async function loadCategories() {
    try { const r = await api.get('/expense-categories?include_inactive=true'); setCategories(r.data || []) } catch {}
  }
  async function loadCatInUse() {
    try { const r = await api.get(`/expenses/categories-in-use?scope=all&viewer_role=${currentUser?.role || ''}`); setCatInUse(r.data || []) } catch {}
  }
  useEffect(() => { loadCategories(); loadCatInUse() }, [])
  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, categoryFilter, search, dateRange.from, dateRange.to])
  // Cards follow the category/date filters (Approved This Month stays fixed).
  useEffect(() => { loadStats() }, [categoryFilter, dateRange.from, dateRange.to])

  async function decide(e: any, action: 'approve' | 'reject', reason?: string) {
    setBusyId(e.id); setError('')
    try {
      await api.put(`/expenses/${e.id}/${action}`, { actor_id: currentUser?.id, actor_role: currentUser?.role, reason: reason || null })
      setRejectFor(null); setRejectReason(''); setDetail(null)
      await load(); await loadStats()
    } catch (err: any) { setError(err?.response?.data?.message || `Failed to ${action}.`) } finally { setBusyId(null) }
  }

  async function openDetail(e: any) { try { const r = await api.get(`/expenses/${e.id}`); setDetail(r.data) } catch { setDetail(e) } }

  async function addCategory() {
    if (!newCategory.trim()) return
    try { await api.post('/expense-categories', { name: newCategory.trim(), created_by: currentUser?.id, actor_role: currentUser?.role }); setNewCategory(''); await loadCategories() }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to add category.') }
  }
  async function toggleCategory(c: any) {
    try { await api.put(`/expense-categories/${c.id}`, { is_active: !c.is_active, actor_role: currentUser?.role }); await loadCategories() }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to update category.') }
  }
  async function deleteCategory(c: any) {
    if (!confirm(`Delete category "${c.name}"?`)) return
    try { await api.delete(`/expense-categories/${c.id}?actor_role=${currentUser?.role}`); await loadCategories() }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete category.') }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-500' }
    return `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${map[s] || 'bg-slate-100 text-slate-500'}`
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Wallet size={22} className="text-amber-600" /></div>
          <div><h1 className="text-xl font-bold text-slate-800">Expense Tracker</h1><p className="text-sm text-slate-500">Track, approve and reject staff expenses.</p></div>
        </div>
        <button onClick={() => { load(); loadStats(); loadCatInUse() }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50"><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-amber-600">{money(stats.pending_amount)}</p><p className="text-xs text-slate-400">Pending ({stats.pending_count || 0})</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-emerald-600">{money(stats.approved_amount)}</p><p className="text-xs text-slate-400">Approved ({stats.approved_count || 0})</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-rose-600">{money(stats.rejected_amount)}</p><p className="text-xs text-slate-400">Rejected ({stats.rejected_count || 0})</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-2xl font-bold text-slate-800">{money(stats.month_approved)}</p><p className="text-xs text-slate-400">Approved This Month</p></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('expenses')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'expenses' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Wallet size={14} /> Expenses</button>
        {isAdmin && <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'categories' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Tag size={14} /> Categories</button>}
      </div>

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">{error}</div>}

      {tab === 'expenses' ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search ref, staff, description, payee..."
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-primary" />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
            </select>
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="">All Categories</option>
              {catInUse.map((c: any) => <option key={c.category} value={c.category}>{c.category} ({c.count})</option>)}
            </select>
            <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none">
              <option value="all">All Time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom_day">Custom Day</option><option value="custom">Custom Range</option>
            </select>
            {datePreset === 'custom_day' && <input type="date" value={customDay} onChange={(e) => { setCustomDay(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" />}
            {datePreset === 'custom' && (<>
              <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="From" />
              <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none" title="To" />
            </>)}
            <span className="text-xs text-slate-400 ml-auto">{total} record{total !== 1 ? 's' : ''} · {money(totalAmount)}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center"><Receipt size={44} className="text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-400">No expenses match your filters.</p></div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-5 py-3">Reference</th><th className="px-5 py-3">Staff</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((e) => {
                      const own = e.staff_id === currentUser?.id
                      const canAct = canApprove && e.status === 'pending' && (!own || isAdmin)
                      return (
                        <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(e)}>
                          <td className="px-5 py-3 font-mono text-primary text-xs">{e.reference || '—'}</td>
                          <td className="px-5 py-3"><p className="text-slate-800 font-medium">{e.staff_name || '—'}</p><p className="text-[10px] text-slate-400">{e.staff_role || ''}</p></td>
                          <td className="px-5 py-3 text-xs text-slate-500">{(e.expense_date || '').slice(0, 10)}</td>
                          <td className="px-5 py-3 text-slate-600">{e.category || '—'}</td>
                          <td className="px-5 py-3 text-slate-600 max-w-[240px] truncate">{e.description}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(e.amount)}</td>
                          <td className="px-5 py-3"><span className={statusBadge(e.status)}>{e.status}</span></td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              {canAct ? (
                                <button onClick={(ev) => { ev.stopPropagation(); openDetail(e) }} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 inline-flex items-center gap-1"><CheckCircle size={11} /> Approve</button>
                              ) : (
                                <button onClick={(ev) => { ev.stopPropagation(); openDetail(e) }} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Eye size={11} /> View</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex gap-2">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={addCategory} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90"><Plus size={14} /> Add</button>
          </div>
          <div className="divide-y divide-slate-50 rounded-xl border border-slate-100">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <div><p className="text-sm text-slate-800">{c.name}</p>{!c.is_active && <p className="text-[10px] text-slate-400">Inactive</p>}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleCategory(c)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">{c.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => deleteCategory(c)} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-medium hover:bg-rose-100 inline-flex items-center gap-1"><Trash2 size={11} /> Delete</button>
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">No categories yet.</p>}
          </div>
          <p className="text-[11px] text-slate-400">Categories with recorded expenses cannot be deleted — deactivate them instead. Active categories appear in every user's dropdown.</p>
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
              <div className="flex justify-between"><span className="text-slate-500">Staff</span><span className="text-slate-700">{detail.staff_name || '—'} <span className="text-[10px] text-slate-400">{detail.staff_role || ''}</span></span></div>
              <div className="flex justify-between"><span className="text-slate-500">Department</span><span className="text-slate-700">{detail.department_name || '—'}</span></div>
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
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Close</button>
              {detail.status === 'pending' && canApprove && (detail.staff_id !== currentUser?.id || isAdmin) && (
                <>
                  <button onClick={() => { setRejectFor(detail); setRejectReason('') }} className="px-5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-sm font-medium hover:bg-rose-100 inline-flex items-center gap-2"><XCircle size={14} /> Reject</button>
                  <button onClick={() => decide(detail, 'approve')} disabled={busyId === detail.id} className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2">{busyId === detail.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRejectFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><XCircle size={16} className="text-rose-500" /> Reject Expense</h2>
              <button onClick={() => setRejectFor(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">Rejecting <strong className="text-slate-700">{rejectFor.staff_name}</strong>'s {money(rejectFor.amount)} expense. A reason is required.</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejection..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400 resize-y" />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setRejectFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium bg-white">Cancel</button>
              <button onClick={() => decide(rejectFor, 'reject', rejectReason)} disabled={!rejectReason.trim() || busyId === rejectFor.id} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
