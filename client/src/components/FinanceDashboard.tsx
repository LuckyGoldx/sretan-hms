import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Banknote, TrendingUp, Receipt, Calendar, Search, Loader2, CreditCard, Landmark, Smartphone, ArrowRight, Clock, Percent, ArrowUp, ArrowDown, Users,
} from 'lucide-react'

export default function FinanceDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [serviceRevenue, setServiceRevenue] = useState<any[]>([])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(true), 10000)
    const onFocus = () => loadData(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [statsRes, paymentsRes, svcRes] = await Promise.all([
        api.get('/payments/revenue/stats').catch(() => ({ data: null })),
        api.get('/payments').catch(() => ({ data: [] })),
        api.get('/payments/revenue/by-service').catch(() => ({ data: [] })),
      ])
      setStats(statsRes.data)
      setPayments(paymentsRes.data || [])
      setServiceRevenue(svcRes.data || [])
    } catch {} finally { if (!silent) setLoading(false) }
  }

  // Compute daily revenue for last 7 days
  const last7 = Array.from({ length: 7 }, (_, i) => {
    var d = new Date(); d.setDate(d.getDate() - (6 - i))
    var dayStr = d.toDateString()
    var dayPayments = payments.filter((p: any) => new Date(p.created_at).toDateString() === dayStr)
    return {
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      revenue: dayPayments.reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0),
      count: dayPayments.length,
    }
  })
  const maxRevenue = Math.max(...last7.map((d) => d.revenue), 1)

  // Method totals from local data
  const methodTotals: Record<string, number> = {}
  payments.forEach((p: any) => {
    var m = p.payment_method || 'other'
    methodTotals[m] = (methodTotals[m] || 0) + parseFloat(p.total_amount || 0)
  })
  const grandTotal = Object.values(methodTotals).reduce((a, b) => a + b, 0) || 1

  const methodMeta: Record<string, { label: string; color: string; bar: string }> = {
    cash: { label: 'Cash', color: 'text-emerald-600', bar: 'bg-emerald-500' },
    card: { label: 'Card', color: 'text-blue-600', bar: 'bg-blue-500' },
    transfer: { label: 'Transfer', color: 'text-purple-600', bar: 'bg-purple-500' },
    pos: { label: 'POS', color: 'text-amber-600', bar: 'bg-amber-500' },
  }

  // Weekly/monthly comparison
  var thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
  var lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  var thisWeekTotal = payments.filter((p: any) => new Date(p.created_at) >= thisWeekStart).reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)
  var lastWeekTotal = payments.filter((p: any) => { var d = new Date(p.created_at); return d >= lastWeekStart && d < thisWeekStart }).reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)
  var weekChange = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 : 0

  var serviceTotal = serviceRevenue.reduce((s: number, r: any) => s + parseFloat(r.total || 0), 0) || 1
  var topServices = [...(serviceRevenue || [])].sort((a: any, b: any) => parseFloat(b.total) - parseFloat(a.total)).slice(0, 5)

  // Monthly revenue (last 6 months)
  var months: { label: string; revenue: number; count: number }[] = []
  for (var mi = 5; mi >= 0; mi--) {
    var d = new Date(); d.setMonth(d.getMonth() - mi)
    var y = d.getFullYear(), m = d.getMonth()
    var monthPayments = payments.filter((p: any) => { var pd = new Date(p.created_at); return pd.getFullYear() === y && pd.getMonth() === m })
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      revenue: monthPayments.reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0),
      count: monthPayments.length,
    })
  }
  var maxMonthRevenue = Math.max(...months.map((m) => m.revenue), 1)

  // This month vs last month
  var now = new Date()
  var thisMonthPayments = payments.filter((p: any) => { var pd = new Date(p.created_at); return pd.getFullYear() === now.getFullYear() && pd.getMonth() === now.getMonth() })
  var lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
  var lastMonthPayments = payments.filter((p: any) => { var pd = new Date(p.created_at); return pd.getFullYear() === lastMonthDate.getFullYear() && pd.getMonth() === lastMonthDate.getMonth() })
  var thisMonthRevenue = thisMonthPayments.reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)
  var lastMonthRevenue = lastMonthPayments.reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)
  var monthChange = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0

  // YTD revenue
  var ytdRevenue = payments.filter((p: any) => new Date(p.created_at).getFullYear() === now.getFullYear()).reduce((s: number, p: any) => s + parseFloat(p.total_amount || 0), 0)

  // Top patients by revenue
  var patientRevenue: Record<string, { name: string; total: number; count: number }> = {}
  payments.forEach((p: any) => {
    var name = p.patient_name || p.walkin_name || 'Walk-in'
    if (!patientRevenue[name]) patientRevenue[name] = { name, total: 0, count: 0 }
    patientRevenue[name].total += parseFloat(p.total_amount || 0)
    patientRevenue[name].count++
  })
  var topPatients = Object.values(patientRevenue).sort((a, b) => b.total - a.total).slice(0, 5)

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  const methodIcon = (m: string) => {
    const map: Record<string, any> = { cash: Banknote, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || Banknote
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-800">Finance Dashboard</h1>

      {/* Stats cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3"><Banknote size={20} className="text-emerald-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today</h3></div>
              <p className="text-2xl font-bold text-emerald-600">₦{parseFloat(stats.today_revenue || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{stats.today_count || 0} transactions</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3"><TrendingUp size={20} className="text-blue-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This Week</h3></div>
              <p className="text-2xl font-bold text-blue-600">₦{thisWeekTotal.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                {weekChange >= 0 ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-rose-500" />}
                {Math.abs(weekChange).toFixed(1)}% vs last week
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3"><Banknote size={20} className="text-purple-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Revenue</h3></div>
              <p className="text-2xl font-bold text-purple-600">₦{parseFloat(stats.total_revenue || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{stats.total_transactions || 0} total transactions</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3"><Receipt size={20} className="text-amber-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg per Transaction</h3></div>
              <p className="text-2xl font-bold text-amber-600">₦{(stats.total_transactions > 0 ? parseFloat(stats.total_revenue || 0) / stats.total_transactions : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-slate-400 mt-1">Across all payments</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 7-day Revenue Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> Revenue Trend (7 Days)</h3>
              </div>
              <div className="flex items-end gap-2 h-32">
                {last7.map((d, i) => {
                  var pct = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0
                  var isToday = i === 6
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] text-slate-400 font-medium">₦{d.revenue.toLocaleString()}</span>
                      <div
                        className={`w-full rounded-t ${isToday ? 'bg-primary' : 'bg-primary/40'} transition-all duration-300`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                        title={`${d.label}: ₦${d.revenue.toLocaleString()} (${d.count} txns)`}
                      />
                      <span className="text-[9px] text-slate-500">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Percent size={16} className="text-primary" /> Payment Methods</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(methodMeta).map(([key, meta]) => {
                  var amount = methodTotals[key] || 0
                  var pct = (amount / grandTotal) * 100
                  var Icon = methodIcon(key)
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={meta.color} />
                          <span className="font-medium text-slate-700">{meta.label}</span>
                        </div>
                        <span className="font-bold text-slate-800">₦{amount.toLocaleString()} <span className="text-xs text-slate-400 font-normal">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${meta.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Monthly Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Calendar size={16} className="text-primary" /> Monthly Revenue (6 Months)</h3>
              </div>
              <div className="flex items-end gap-2 h-32">
                {months.map((m, i) => {
                  var pct = maxMonthRevenue > 0 ? (m.revenue / maxMonthRevenue) * 100 : 0
                  var isCurrent = i === months.length - 1
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] text-slate-400 font-medium">₦{m.revenue.toLocaleString()}</span>
                      <div className={`w-full rounded-t ${isCurrent ? 'bg-primary' : 'bg-primary/30'} transition-all duration-300`} style={{ height: `${Math.max(pct, 3)}%` }} title={`${m.label}: ₦${m.revenue.toLocaleString()}`} />
                      <span className="text-[9px] text-slate-500">{m.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Daily Transaction Count Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Receipt size={16} className="text-primary" /> Daily Transactions (7 Days)</h3>
              </div>
              <div className="flex items-end gap-2 h-32">
                {last7.map((d, i) => {
                  var maxCount = Math.max(...last7.map((x) => x.count), 1)
                  var pct = (d.count / maxCount) * 100
                  var isToday = i === 6
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] text-slate-400 font-medium">{d.count}</span>
                      <div className={`w-full rounded-t ${isToday ? 'bg-amber-500' : 'bg-amber-300'} transition-all duration-300`} style={{ height: `${Math.max(pct, 3)}%` }} title={`${d.label}: ${d.count} txns`} />
                      <span className="text-[9px] text-slate-500">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Analytics Row 2: This month vs last month + YTD + Top Patients */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* This Month vs Last Month */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> Monthly Comparison</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">This Month</p>
                  <p className="text-xl font-bold text-emerald-600">₦{thisMonthRevenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{thisMonthPayments.length} transactions</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Last Month</p>
                  <p className="text-xl font-bold text-slate-700">₦{lastMonthRevenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{lastMonthPayments.length} transactions</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${monthChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {monthChange >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                  <span className="text-sm font-bold">{Math.abs(monthChange).toFixed(1)}% vs last month</span>
                </div>
              </div>
            </div>

            {/* YTD + Averages */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Banknote size={16} className="text-primary" /> Year to Date</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">YTD Revenue</p>
                  <p className="text-2xl font-bold text-blue-600">₦{ytdRevenue.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-500">Avg Daily</p>
                    <p className="text-base font-bold text-slate-800">₦{((payments.length > 0 ? ytdRevenue / payments.length : 0) * 7).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-500">Avg Weekly</p>
                    <p className="text-base font-bold text-slate-800">₦{(ytdRevenue / Math.max(Math.ceil((Date.now() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000), 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Patients */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Users size={16} className="text-primary" /> Top Patients</h3>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {topPatients.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No data</p>
                ) : topPatients.map((pt: any, i: number) => {
                  var pct = grandTotal > 0 ? (pt.total / grandTotal) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{pt.name}</p>
                        <p className="text-[10px] text-slate-400">{pt.count} visit{pt.count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">₦{pt.total.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Service Revenue & Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Receipt size={16} className="text-primary" /> Revenue by Service</h3>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {(serviceRevenue || []).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No service data</p>
                ) : serviceRevenue.map((svc: any, i: number) => {
                  var pct = (parseFloat(svc.total) / serviceTotal) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 capitalize truncate max-w-[60%]">{svc.service_type?.replace('_', ' ') || 'Unknown'}</span>
                        <span className="text-slate-500">₦{parseFloat(svc.total).toLocaleString()} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Clock size={16} className="text-primary" /> Quick Stats</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">Top Service</span>
                  <span className="text-sm font-semibold text-slate-800 capitalize">{topServices[0]?.service_type?.replace('_', ' ') || '—'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">Most Used Method</span>
                  <span className="text-sm font-semibold text-slate-800 capitalize">
                    {Object.entries(methodTotals).sort(([, a], [, b]) => b - a)[0]?.[0] || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">This Week Revenue</span>
                  <span className="text-sm font-bold text-emerald-600">₦{thisWeekTotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">Week over Week</span>
                  <span className={`text-sm font-bold flex items-center gap-1 ${weekChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {weekChange >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    {Math.abs(weekChange).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">Total Transactions</span>
                  <span className="text-sm font-bold text-slate-800">{stats.total_transactions || 0}</span>
                </div>
                <button onClick={() => navigate('/finance/payment-history')} className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                  <Receipt size={15} /> View Full Payment History
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
