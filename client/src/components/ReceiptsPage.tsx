import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { printPaymentReceipt, printDepositReceipt } from '../utils/print'
import {
  Receipt, Search, Loader2, ArrowLeft, Printer, X, ChevronLeft, ChevronRight,
  Banknote, CreditCard, Landmark, Smartphone, User, Package, BadgeCheck, Shield,
} from 'lucide-react'

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

export default function ReceiptsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [depositCount, setDepositCount] = useState(0)
  const [serviceCount, setServiceCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [customDay, setCustomDay] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [method, setMethod] = useState('')
  const [type, setType] = useState<'all' | 'deposit' | 'service'>('all')
  const dateRange = getDateRange(datePreset, customDay, customFrom, customTo)

  const [selected, setSelected] = useState<any | null>(null)

  const money = (n: any) => `₦${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // An insurance receipt is one that carries a co-pay split or a case/provider.
  const insuranceReceipt = !!selected && !selected.is_deposit && !!(
    selected.insurance_case_id || selected.insurance_provider_name ||
    (selected.items || []).some((it: any) => it.service_type === 'insurance_co_pay')
  )
  const insurancePaid = selected ? Number(selected.insurance_amount || 0) : 0
  const patientPaid = selected ? Number(selected.total_amount || 0) : 0
  const methodLabel = insuranceReceipt
    ? (insurancePaid > 0 && patientPaid > 0
        ? `INSURANCE + ${String(selected?.payment_method || 'cash').toUpperCase()}`
        : 'INSURANCE')
    : String(selected?.payment_method || '').toUpperCase()

  async function load() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.append('page', String(page)); params.append('limit', String(LIMIT))
      if (search) params.append('search', search)
      if (dateRange.from) params.append('date_from', dateRange.from)
      if (dateRange.to) params.append('date_to', dateRange.to)
      if (method) params.append('method', method)
      if (type !== 'all') params.append('type', type)
      const res = await api.get(`/payments?${params.toString()}`)
      const data = res.data
      if (Array.isArray(data)) { setRows(data); setTotal(data.length) }
      else {
        setRows(data?.rows || []); setTotal(data?.total || 0)
        setTotalAmount(Number(data?.total_amount) || 0)
        setDepositCount(data?.deposit_count || 0); setServiceCount(data?.service_count || 0)
      }
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load receipts.'); setRows([]); setTotal(0) } finally { setLoading(false) }
  }

  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, method, type, dateRange.from, dateRange.to])

  async function openDetail(p: any) {
    try { const r = await api.get(`/payments/${p.id}`); setSelected(r.data) } catch { setSelected(p) }
  }
  function printReceipt(p: any) {
    if (!p) return
    if (p.is_deposit) printDepositReceipt(p, p.covered_items)
    else printPaymentReceipt(p)
  }

  const methodIcon = (m: string) => ({ cash: Banknote, card: CreditCard, transfer: Landmark, pos: Smartphone } as Record<string, any>)[m] || Banknote
  // Co-pay receipts were collected in cash/POS/etc; show the composed label so
  // the row reads "INSURANCE" or "INSURANCE + CASH".
  const methodDisplay = (p: any) => {
    const ins = Number(p.insurance_amount || 0)
    if (ins > 0) return Number(p.total_amount || 0) > 0 ? `INSURANCE + ${String(p.payment_method || 'cash').toUpperCase()}` : 'INSURANCE'
    return String(p.payment_method || '').toUpperCase()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Receipt size={22} className="text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Receipts</h1>
            <p className="text-sm text-slate-500">All receipts issued — payments, deposits and receipts of every service.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">{total}</p><p className="text-xs text-slate-400">Receipts {type !== 'all' ? `(${type})` : ''}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-700">{money(totalAmount)}</p><p className="text-xs text-slate-400">Total collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-teal-700">{depositCount}</p><p className="text-xs text-slate-400">Deposit receipts</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-blue-700">{serviceCount}</p><p className="text-xs text-slate-400">Service receipts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(['all', 'service', 'deposit'] as const).map((t) => (
            <button key={t} onClick={() => { setType(t); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${type === t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t === 'all' ? 'All' : t === 'service' ? 'Services' : 'Deposits'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search receipt no., patient, staff..." 
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Methods</option>
          <option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Transfer</option><option value="pos">POS</option>
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
      </div>

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Receipt size={44} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No receipts match your filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-5 py-3">Receipt No.</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Patient / Customer</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((p) => {
                  const Icon = methodIcon(p.payment_method)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(p)}>
                      <td className="px-5 py-3 font-mono text-primary font-medium text-xs">{p.receipt_number}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <p className="text-slate-800 font-medium">{p.patient_name || p.walkin_name || 'Walk-in Customer'}</p>
                        {p.hospital_number && <p className="text-xs text-slate-400 font-mono">{p.hospital_number}</p>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{p.item_count}</td>
                      <td className="px-5 py-3 text-xs text-slate-600 inline-flex items-center gap-1"><Icon size={12} /> {methodDisplay(p)}</td>
                      <td className="px-5 py-3">
                        {p.is_deposit
                          ? <span className="inline-flex px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">Deposit</span>
                          : <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">Service</span>}
                        {p.insurance_provider_name && (
                          <span className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold w-fit max-w-[140px]">
                            <Shield size={10} className="flex-shrink-0" /><span className="truncate">{p.insurance_provider_name}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(p.total_amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={(e) => { e.stopPropagation(); openDetail(p) }} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">View</button>
                          <button onClick={(e) => { e.stopPropagation(); openDetail(p) }} className="px-2.5 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 inline-flex items-center gap-1"><Printer size={12} /> Receipt</button>
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
              <span className="text-xs text-slate-400">Page {page} of {totalPages} · {total} receipt{total !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={13} /> Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={13} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{selected.is_deposit ? 'Deposit Receipt' : 'Payment Receipt'}</h2>
                  <p className="text-xs text-slate-400 font-mono">{selected.receipt_number}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1"><User size={13} /> {selected.patient_name || selected.walkin_name || 'Walk-in Customer'}</p>
                    {selected.hospital_number && <p className="text-slate-400 font-mono">{selected.hospital_number}</p>}
                  </div>
                  <div className="text-right text-slate-500 space-y-0.5">
                    <p>{new Date(selected.created_at).toLocaleString()}</p>
                    <p>Method: <strong className="text-slate-700">{methodLabel}</strong></p>
                    {selected.staff_name && <p>By: {selected.staff_name}</p>}
                  </div>
                </div>
              </div>

              {selected.is_deposit && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-800 flex items-center gap-2">
                  <BadgeCheck size={14} /> Deposit received on account — the items below are the bills it settled.
                </div>
              )}

              {!selected.is_deposit && insuranceReceipt && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Shield size={14} className="flex-shrink-0" /> Billed to {selected.insurance_provider_name || 'insurance'}
                    {selected.insurance_case_number ? ` · ${selected.insurance_case_number}` : ''}
                  </p>
                  <div className="flex justify-between"><span>Insurance paid</span><span className="font-bold">{money(insurancePaid)}</span></div>
                  <div className="flex justify-between"><span>Patient paid</span><span className="font-bold">{money(patientPaid)}</span></div>
                  <div className="flex justify-between border-t border-emerald-200 pt-1.5"><span>Total billed</span><span className="font-bold">{money(insurancePaid + patientPaid)}</span></div>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Package size={12} /> {selected.is_deposit ? 'Items covered by this deposit' : 'Items'}</p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-50">
                  {((selected.is_deposit ? selected.covered_items : selected.items) || []).length === 0 && (
                    <p className="px-4 py-4 text-center text-xs text-slate-400">{selected.is_deposit ? 'Held as credit on account — not yet applied to a specific bill.' : 'No item lines'}</p>
                  )}
                  {((selected.is_deposit ? selected.covered_items : selected.items) || []).map((it: any, i: number) => {
                    const lineTotal = Number(it.line_total) > 0 ? Number(it.line_total) : Number(it.total_price ?? it.amount ?? 0)
                    const insShare = Number(it.insurance_amount) || 0
                    const patShare = Number(it.total_price ?? it.amount ?? 0)
                    return (
                      <div key={i} className="px-4 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 pr-3">{it.description}</span>
                          <span className="font-medium text-slate-700 whitespace-nowrap">{money(lineTotal)}</span>
                        </div>
                        {(insShare > 0 || insuranceReceipt) && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Insurance {money(insShare)} · Patient {money(patShare)}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-800">
                <span>{insuranceReceipt ? 'Patient paid' : 'Total'}</span><span>{money(selected.total_amount)}</span>
              </div>
              {selected.notes && <p className="text-xs text-slate-400">{selected.notes}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium">Close</button>
              <button onClick={() => printReceipt(selected)} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90"><Printer size={14} /> Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
