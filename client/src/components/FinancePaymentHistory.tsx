import { useState, useEffect, useMemo } from 'react'
import api from '../hooks/useAxios'
import {
  Search, Loader2, Receipt, FileText, CreditCard, Landmark, Smartphone, Banknote, X, Printer, ArrowLeft, Calendar, ChevronDown,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type DateFilter = 'all' | 'today' | 'yesterday' | 'this-week' | 'this-month' | 'this-year' | 'custom-range' | 'custom-date'

const FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom-date', label: 'Custom Date' },
  { value: 'custom-range', label: 'Custom Range' },
]

function getDateRange(filter: DateFilter): { start: Date; end: Date } | null {
  var now = new Date()
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (filter === 'today') return { start, end: now }
  if (filter === 'yesterday') { start.setDate(start.getDate() - 1); var end = new Date(start); end.setHours(23, 59, 59, 999); return { start, end } }
  if (filter === 'this-week') { start.setDate(start.getDate() - start.getDay()); return { start, end: now } }
  if (filter === 'this-month') { start.setDate(1); return { start, end: now } }
  if (filter === 'this-year') { start = new Date(now.getFullYear(), 0, 1); return { start, end: now } }
  return null
}

export default function FinancePaymentHistory() {
  const navigate = useNavigate()
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await api.get('/payments')
      setPayments(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function loadDetail(id: string) {
    try { const res = await api.get(`/payments/${id}`); setSelectedPayment(res.data) } catch {}
  }

  var dateRange = dateFilter === 'custom-range'
    ? (customFrom && customTo ? { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') } : null)
    : dateFilter === 'custom-date'
      ? (customFrom ? { start: new Date(customFrom), end: new Date(customFrom + 'T23:59:59') } : null)
      : getDateRange(dateFilter)

  var dateFiltered = dateRange
    ? payments.filter((p: any) => {
        var pd = new Date(p.created_at)
        return pd >= dateRange!.start && pd <= dateRange!.end
      })
    : payments

  const filtered = dateFiltered.filter((p) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (p.patient_name || '').toLowerCase().includes(q) || (p.walkin_name || '').toLowerCase().includes(q) || (p.receipt_number || '').toLowerCase().includes(q) || (p.staff_name || '').toLowerCase().includes(q)
  })

  const totalRevenue = filtered.reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)
  const todayCount = filtered.filter((p: any) => { var d = new Date(p.created_at); var t = new Date(); return d.toDateString() === t.toDateString() }).length
  const filterLabel = FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label || ''

  const methodIcon = (m: string) => {
    const map: Record<string, any> = { cash: Banknote, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || Banknote
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  var currentLabel = FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label || 'All Time'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finance/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Receipt size={22} className="text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Payment History</h1>
            <p className="text-sm text-slate-500">{filtered.length} payment{filtered.length !== 1 ? 's' : ''} {dateFilter !== 'all' ? `(${currentLabel})` : ''}</p>
          </div>
        </div>
      </div>

      {/* Stats - reflect filtered data */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-slate-800">{filtered.length}</p>
            <p className="text-xs text-slate-500">Payments {dateFilter !== 'all' ? `(${currentLabel})` : ''}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-emerald-600">₦{totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Revenue {dateFilter !== 'all' ? `(${currentLabel})` : ''}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-primary">{todayCount}</p>
            <p className="text-xs text-slate-500">Today</p>
          </div>
        </div>
      )}

      {/* Date Filter + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <button onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Calendar size={15} className="text-primary" />
            {currentLabel}
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 w-48 overflow-hidden">
              {FILTER_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => { setDateFilter(opt.value); setShowDropdown(false); if (opt.value !== 'custom-range' && opt.value !== 'custom-date') { setCustomFrom(''); setCustomTo('') } }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${dateFilter === opt.value ? 'bg-primary/5 text-primary font-medium' : 'text-slate-600'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {(dateFilter === 'custom-range' || dateFilter === 'custom-date') && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
            {dateFilter === 'custom-range' && (
              <>
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </>
            )}
          </div>
        )}

        <div className="relative flex-1 max-w-xs ml-auto">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by receipt, patient, or staff..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium">No payments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Receipt</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Patient</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Amount</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Method</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Items</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Staff</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p: any) => {
                  const Icon = methodIcon(p.payment_method)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => loadDetail(p.id)}>
                      <td className="px-5 py-3.5 font-mono text-primary font-medium text-xs">{p.receipt_number}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-800">{p.patient_name || p.walkin_name || 'Walk-in'}</p>
                        {p.hospital_number && <p className="text-[10px] text-slate-400">{p.hospital_number}</p>}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-800">₦{parseFloat(p.total_amount).toLocaleString()}</td>
                      <td className="px-5 py-3.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"><Icon size={10} />{p.payment_method?.toUpperCase()}</span></td>
                      <td className="px-5 py-3.5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">{p.item_count || '—'}</span></td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{p.staff_name || '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-5 py-3.5 text-right text-primary opacity-0 group-hover:opacity-100 transition-opacity text-xs">&rarr;</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedPayment(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Receipt size={20} className="text-blue-600" /></div>
                <div><h2 className="text-base font-semibold text-slate-800">Payment Details</h2><p className="text-xs text-slate-400 font-mono">{selectedPayment.receipt_number}</p></div>
              </div>
              <button onClick={() => setSelectedPayment(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedPayment.patient_name || selectedPayment.walkin_name || 'Walk-in'}</p>
                  {selectedPayment.hospital_number && <p className="text-xs text-slate-400 font-mono">{selectedPayment.hospital_number}</p>}
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Payment Method</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${selectedPayment.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : selectedPayment.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : selectedPayment.payment_method === 'transfer' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                    {(() => { const MIcon = methodIcon(selectedPayment.payment_method); return <><MIcon size={14} />{selectedPayment.payment_method?.toUpperCase()}</> })()}
                  </span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Items</h4>
                <div className="space-y-2">
                  {(selectedPayment.items || []).length > 0 ? selectedPayment.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{item.service_type?.replace('_', ' ')}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-slate-800">₦{(item.total_price || 0).toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">×{item.quantity || 1}</p>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate-400 text-center py-4">No items data</p>}
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Total Amount</span><span className="text-lg font-bold text-emerald-700">₦{(selectedPayment.total_amount || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-200">
                  <span>{new Date(selectedPayment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {selectedPayment.staff_name && <span>By: {selectedPayment.staff_name}</span>}
                </div>
                {selectedPayment.notes && <div className="text-xs text-slate-400 pt-1 border-t border-slate-200"><span className="text-slate-500">Notes: </span>{selectedPayment.notes}</div>}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white"><Printer size={14} /> Print</button>
              <button onClick={() => setSelectedPayment(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
