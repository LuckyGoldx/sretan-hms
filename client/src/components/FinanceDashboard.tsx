import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  DollarSign, TrendingUp, Receipt, Calendar, ArrowLeft, Search, X, Loader2, FileText, Printer, CreditCard, Landmark, Smartphone,
} from 'lucide-react'

export default function FinanceDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [recentPayments, setRecentPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [statsRes, paymentsRes] = await Promise.all([
        api.get('/payments/revenue/stats').catch(() => ({ data: null })),
        api.get('/payments').catch(() => ({ data: [] })),
      ])
      setStats(statsRes.data)
      setRecentPayments(paymentsRes.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function loadPaymentDetail(id: string) {
    try {
      const res = await api.get(`/payments/${id}`)
      setSelectedPayment(res.data)
    } catch {}
  }

  const filtered = recentPayments.filter((p) => {
    if (search && !p.patient_name?.toLowerCase().includes(search.toLowerCase()) && !p.receipt_number?.toLowerCase().includes(search.toLowerCase()) && !p.staff_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const methodIcon = (m: string) => {
    const map: Record<string, any> = { cash: DollarSign, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || DollarSign
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/paypoint')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div><h1 className="text-xl font-bold text-slate-800">Finance Dashboard</h1><p className="text-sm text-slate-400">Revenue tracking and payment history</p></div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3"><DollarSign size={18} className="text-emerald-500" /><h3 className="text-sm font-semibold text-slate-700">Today's Revenue</h3></div>
            <p className="text-2xl font-bold text-emerald-600">₦{parseFloat(stats.today_revenue || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{stats.today_count || 0} transactions</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3"><TrendingUp size={18} className="text-blue-500" /><h3 className="text-sm font-semibold text-slate-700">Total Revenue</h3></div>
            <p className="text-2xl font-bold text-blue-600">₦{parseFloat(stats.total_revenue || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{stats.total_transactions || 0} transactions</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3"><Receipt size={18} className="text-purple-500" /><h3 className="text-sm font-semibold text-slate-700">Payment Methods</h3></div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Cash</span><span className="font-medium">₦{parseFloat(stats.cash_total || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Card</span><span className="font-medium">₦{parseFloat(stats.card_total || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Transfer</span><span className="font-medium">₦{parseFloat(stats.transfer_total || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>POS</span><span className="font-medium">₦{parseFloat(stats.pos_total || 0).toLocaleString()}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3"><Calendar size={18} className="text-amber-500" /><h3 className="text-sm font-semibold text-slate-700">Quick Filter</h3></div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none mb-1" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none" />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Payment History</h3>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by patient or receipt..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No payments found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Staff</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p: any) => {
                  const Icon = methodIcon(p.payment_method)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-mono text-primary">{p.receipt_number}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{p.patient_name || p.walkin_name || 'Walk-in'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-800">₦{parseFloat(p.total_amount).toLocaleString()}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"><Icon size={10} />{p.payment_method?.toUpperCase()}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{p.staff_name || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => loadPaymentDetail(p.id)} className="text-xs text-primary font-medium hover:underline">View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedPayment(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><FileText size={18} className="inline text-primary mr-2" />Receipt #{selectedPayment.receipt_number}</h2>
              <button onClick={() => setSelectedPayment(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center pb-3 border-b border-slate-100">
                <p className="text-lg font-bold text-slate-800">{selectedPayment.patient_name || selectedPayment.walkin_name || 'Walk-in Customer'}</p>
                {selectedPayment.hospital_number && <p className="text-xs text-slate-400">#{selectedPayment.hospital_number}</p>}
              </div>
              <div className="space-y-2">
                {(selectedPayment.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="text-slate-600 flex-1 truncate">{item.description}</span>
                    <span className="text-slate-800 font-medium ml-4">₦{(item.total_price || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-base font-bold text-slate-800 pt-3 border-t border-slate-100">
                <span>Total</span>
                <span>₦{parseFloat(selectedPayment.total_amount || 0).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
                <div><span className="block text-slate-400">Payment Method</span><span className="font-medium text-slate-700">{selectedPayment.payment_method?.toUpperCase()}</span></div>
                <div><span className="block text-slate-400">Date & Time</span><span className="font-medium text-slate-700">{new Date(selectedPayment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div><span className="block text-slate-400">Processed By</span><span className="font-medium text-slate-700">{selectedPayment.staff_name || '—'}</span></div>
                {selectedPayment.notes && <div className="col-span-2"><span className="block text-slate-400">Notes</span><span className="font-medium text-slate-700">{selectedPayment.notes}</span></div>}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setSelectedPayment(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
