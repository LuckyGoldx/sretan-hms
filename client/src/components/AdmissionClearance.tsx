import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Loader2, ShieldCheck, Receipt, Banknote, CheckCircle, AlertTriangle, X, ShieldAlert,
  RefreshCw, Search, ChevronLeft, ChevronRight, History, Printer,
} from 'lucide-react'
import AdmissionBillModal from './AdmissionBillModal'
import { printDepositReceipt } from '../utils/print'

const currentUser: any = (() => { try { const u = localStorage.getItem('sretan_user'); return u ? JSON.parse(u) : null } catch {} return null })()
const isAdmin = currentUser?.role === 'Admin'
const LIMIT = 25

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function getDateRange(preset: string, customDay: string, from: string, to: string): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
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

export default function AdmissionClearance() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [customDay, setCustomDay] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const dateRange = getDateRange(datePreset, customDay, customFrom, customTo)

  const [bill, setBill] = useState<any | null>(null)
  const [depositReceipt, setDepositReceipt] = useState<any | null>(null)
  const [depositFor, setDepositFor] = useState<any | null>(null)
  const [depositForm, setDepositForm] = useState({ amount: '', method: 'cash', notes: '' })
  const [overrideFor, setOverrideFor] = useState<any | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function load() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(LIMIT))
      if (search) params.append('search', search)
      if (dateRange.from) params.append('date_from', dateRange.from)
      if (dateRange.to) params.append('date_to', dateRange.to)
      const endpoint = tab === 'history' ? '/admissions/clearance-history' : '/admissions/pending-clearance'
      const res = await api.get(`${endpoint}?${params.toString()}`)
      if (Array.isArray(res.data)) { setRows(res.data); setTotal(res.data.length) }
      else { setRows(res.data?.rows || []); setTotal(res.data?.total || 0) }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load clearances.')
      setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }

  // Debounced reload on tab / page / search / date changes.
  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, search, dateRange.from, dateRange.to])

  function changeTab(next: 'pending' | 'history') {
    if (next === tab) return
    setTab(next); setPage(1); setSearch(''); setError('')
  }

  function openBill(r: any, isFinal = false) {
    const b = r.balance || {}
    setBill({
      title: isFinal ? 'Final Settlement Statement' : 'Interim Bill',
      patientName: r.patient_name,
      hospitalNumber: r.hospital_number,
      wardName: r.ward_name,
      items: isFinal
        ? (r.final_bill_items || []).map((i: any) => ({ description: i.description, amount: Number(i.amount) || 0 }))
        : (b.items || []).map((i: any) => ({ description: i.description, amount: Number(i.amount) || 0 })),
      chargesTotal: isFinal ? (Number(r.final_bill_total) || 0) : (b.charges_total ?? b.total ?? 0),
      depositsHeld: isFinal ? 0 : (b.deposits_held ?? 0),
      outstanding: isFinal ? (Number(r.balance_at_clearance) || 0) : (b.outstanding ?? 0),
      isFinal,
      dischargedAt: r.discharged_at || null,
      clearedBy: r.cleared_by_name || r.discharged_by_name || null,
    })
  }

  async function submitDeposit() {
    if (!depositFor) return
    const amt = parseFloat(depositForm.amount)
    if (!amt || amt <= 0) { setError('Enter a positive deposit amount.'); return }
    setBusyId(depositFor.id)
    try {
      const res = await api.post(`/admissions/${depositFor.id}/deposit`, { amount: amt, method: depositForm.method, notes: depositForm.notes || null, created_by: currentUser?.id })
      const target = depositFor
      setDepositFor(null); setDepositForm({ amount: '', method: 'cash', notes: '' })
      // Show the receipt (Finance records it as a payment).
      if (res.data?.payment_id) {
        const base = { receipt_number: res.data.receipt_number, total_amount: amt, payment_method: depositForm.method, patient_name: target?.patient_name, covered_items: res.data.covered_items || [] }
        try { const pay = await api.get(`/payments/${res.data.payment_id}`); setDepositReceipt({ ...pay.data, covered_items: res.data.covered_items || [] }) }
        catch { setDepositReceipt(base) }
      }
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to record deposit.') } finally { setBusyId(null) }
  }

  async function clearAdmission(r: any, override: boolean) {
    if (override && !overrideReason.trim()) { setError('An override reason is required.'); return }
    setBusyId(r.id); setError('')
    try {
      await api.post(`/admissions/${r.id}/clear`, { cleared_by: currentUser?.id, override, override_reason: override ? overrideReason.trim() : null })
      setOverrideFor(null); setOverrideReason('')
      await load()
    } catch (e: any) {
      const data = e?.response?.data
      setError(data?.message || 'Failed to clear admission.')
      if (data?.balance) openBill({ ...r, balance: data.balance })
    } finally { setBusyId(null) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><ShieldCheck size={22} className="text-amber-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Financial Clearance</h1>
            <p className="text-sm text-slate-500">Settle, apply deposits, confirm payer, then clear. Review completed clearances below.</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50"><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => changeTab('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ShieldCheck size={14} /> Pending {tab === 'pending' && total > 0 ? `(${total})` : ''}
        </button>
        <button onClick={() => changeTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === 'history' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <History size={14} /> History
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient name or hospital number..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom_day">Custom Day</option>
          <option value="custom">Custom Range</option>
        </select>
        {datePreset === 'custom_day' && (
          <input type="date" value={customDay} onChange={(e) => { setCustomDay(e.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" />
        )}
        {datePreset === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" title="From" />
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1) }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" title="To" />
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          {tab === 'pending' ? <CheckCircle size={44} className="text-slate-300 mx-auto mb-3" /> : <History size={44} className="text-slate-300 mx-auto mb-3" />}
          <p className="text-sm text-slate-400">{tab === 'pending' ? 'No admissions are pending financial clearance.' : 'No cleared admissions match your filters.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {tab === 'pending' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-5 py-3">Patient</th>
                    <th className="px-5 py-3">Ward / Bed</th>
                    <th className="px-5 py-3">Requested</th>
                    <th className="px-5 py-3 text-right">Charges</th>
                    <th className="px-5 py-3 text-right">Deposits</th>
                    <th className="px-5 py-3 text-right">Outstanding</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => {
                    const b = r.balance || {}
                    const clearable = r.can_clear
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{r.patient_name || 'Unknown'}</p>
                          <p className="text-xs text-slate-400 font-mono">{r.hospital_number || ''}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{r.ward_name}{r.bed_number ? ` · ${r.bed_number}` : ''}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {r.discharge_requested_at ? new Date(r.discharge_requested_at).toLocaleString() : '—'}
                          {r.discharge_requested_by_name && <p className="text-[10px] text-slate-400">by {r.discharge_requested_by_name}</p>}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">{money(b.charges_total ?? b.total)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600">{b.deposits_held > 0 ? money(b.deposits_held) : '—'}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${clearable ? 'text-emerald-600' : 'text-rose-600'}`}>{money(b.outstanding)}</td>
                        <td className="px-5 py-3">
                          {b.insured
                            ? <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">Insured · {b.insurance_provider}</span>
                            : clearable
                              ? <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Ready</span>
                              : <span className="inline-flex px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">Funds due</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            <button onClick={() => openBill(r)} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Receipt size={12} /> Bill</button>
                            <button onClick={() => { setDepositFor(r); setDepositForm({ amount: String(b.outstanding || ''), method: 'cash', notes: '' }) }} className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100 text-xs font-medium hover:bg-teal-100 inline-flex items-center gap-1"><Banknote size={12} /> Deposit</button>
                            {clearable ? (
                              <button onClick={() => clearAdmission(r, false)} disabled={busyId === r.id} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">{busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Clear</button>
                            ) : isAdmin ? (
                              <button onClick={() => { setOverrideFor(r); setOverrideReason('') }} disabled={busyId === r.id} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-medium hover:bg-rose-100 disabled:opacity-50 inline-flex items-center gap-1"><ShieldAlert size={12} /> Override</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-5 py-3">Patient</th>
                    <th className="px-5 py-3">Ward</th>
                    <th className="px-5 py-3">Admitted</th>
                    <th className="px-5 py-3">Discharged</th>
                    <th className="px-5 py-3">Cleared by</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Final bill</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.patient_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.hospital_number || ''}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.ward_name}{r.bed_number ? ` · ${r.bed_number}` : ''}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.admitted_at ? new Date(r.admitted_at).toLocaleString() : '—'}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.discharged_at ? new Date(r.discharged_at).toLocaleString() : '—'}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{r.cleared_by_name || r.discharged_by_name || '—'}</td>
                      <td className="px-5 py-3">
                        {r.clearance_status === 'overridden'
                          ? <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold" title={r.override_reason || ''}>Overridden</span>
                          : <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Cleared</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700 font-medium">{money(r.final_bill_total)}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openBill(r, true)} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"><Receipt size={12} /> Final Bill</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Page {page} of {totalPages} · {total} record{total !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft size={13} /> Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bill && <AdmissionBillModal {...bill} onClose={() => setBill(null)} />}

      {depositFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDepositFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Banknote size={16} className="text-teal-500" /> Record Deposit</h2>
              <button onClick={() => setDepositFor(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">For <strong className="text-slate-700">{depositFor.patient_name}</strong> · Outstanding {money(depositFor.balance?.outstanding)}</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Amount (₦)</label>
                <input type="number" min="0" value={depositForm.amount} onChange={(e) => setDepositForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
                <select value={depositForm.method} onChange={(e) => setDepositForm((f) => ({ ...f, method: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                  <option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Transfer</option><option value="pos">POS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <input value={depositForm.notes} onChange={(e) => setDepositForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setDepositFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium bg-white">Cancel</button>
              <button onClick={submitDeposit} disabled={busyId === depositFor.id} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
                {busyId === depositFor.id && <Loader2 size={13} className="animate-spin" />} Save Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setOverrideFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShieldAlert size={16} className="text-rose-500" /> Override &amp; Clear</h2>
              <button onClick={() => setOverrideFor(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">Clearing <strong className="text-slate-700">{overrideFor.patient_name}</strong> with an outstanding balance of {money(overrideFor.balance?.outstanding)}. This is recorded for audit.</p>
              <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={3}
                placeholder="Reason — LAMA/absconding risk accepted, emergency, waiver, corporate guarantee…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400 resize-y" />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setOverrideFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium bg-white">Cancel</button>
              <button onClick={() => clearAdmission(overrideFor, true)} disabled={busyId === overrideFor.id || !overrideReason.trim()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">Override &amp; Clear</button>
            </div>
          </div>
        </div>
      )}

      {depositReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDepositReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2"><CheckCircle size={24} className="text-emerald-600" /></div>
                <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold tracking-wide">DEPOSIT RECEIPT</span>
                <p className="text-lg font-bold text-slate-800 mt-2">{money(depositReceipt.total_amount)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Receipt {depositReceipt.receipt_number || '—'}</p>
                <p className="text-xs text-slate-500 mt-1">{depositReceipt.patient_name || ''} · {String(depositReceipt.payment_method || '').toUpperCase()}</p>
              </div>
              {(depositReceipt.covered_items || []).length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Items covered by this deposit</p>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-50 max-h-44 overflow-y-auto">
                    {depositReceipt.covered_items.map((it: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-slate-600 pr-3">{it.description}</span>
                        <span className="font-medium text-slate-700 whitespace-nowrap">{money(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-[11px] text-slate-400 text-center">Held as credit on account — not yet applied to a specific bill.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setDepositReceipt(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium bg-white">Close</button>
              <button onClick={() => printDepositReceipt(depositReceipt, depositReceipt.covered_items)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2"><Printer size={14} /> Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
