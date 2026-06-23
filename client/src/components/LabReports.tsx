import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  BarChart3, Calendar, Banknote, FlaskConical, Clock, Users,
  Loader2, TrendingUp, Activity, ArrowRight, Package,
} from 'lucide-react'

const statusColors: Record<string, { bar: string; text: string; bg: string }> = {
  ordered: { bar: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-100' },
  collected: { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-100' },
  processing: { bar: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-100' },
  completed: { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-100' },
}

const statusLabels: Record<string, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  processing: 'Processing',
  completed: 'Completed',
}

function getStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isToday(date: Date): boolean {
  const now = getStartOfDay(new Date())
  const d = getStartOfDay(date)
  return d.getTime() === now.getTime()
}

function isThisWeek(date: Date): boolean {
  const now = new Date()
  const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  return date >= getStartOfDay(weekAgo)
}

function isThisMonth(date: Date): boolean {
  const now = new Date()
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
  return date >= getStartOfDay(monthAgo)
}

export default function LabReports() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [revenueData, setRevenueData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [ordRes, revRes] = await Promise.all([
          api.get('/lab-orders').catch(() => ({ data: [] })),
          api.get('/payments/revenue/by-service?service_type=lab').catch(() => ({ data: null })),
        ])
        setOrders(ordRes.data || [])
        setRevenueData(revRes.data)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const now = new Date()

  const todayOrders = orders.filter((o) => isToday(new Date(o.created_at)))
  const weekOrders = orders.filter((o) => isThisWeek(new Date(o.created_at)))
  const monthOrders = orders.filter((o) => isThisMonth(new Date(o.created_at)))

  const daysThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = now.getDate()
  const avgDaily = daysElapsed > 0 ? (monthOrders.length / daysElapsed).toFixed(1) : '0'

  const testFrequency: Record<string, number> = {}
  orders.forEach((o) => {
    const name = o.test_name || 'Unknown'
    testFrequency[name] = (testFrequency[name] || 0) + 1
  })
  const topTests = Object.entries(testFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
  const maxTestFreq = topTests.length > 0 ? topTests[0][1] : 1

  const doctorCount: Record<string, { name: string; count: number }> = {}
  orders.forEach((o) => {
    const docName = o.doctor_name || o.referred_by || 'Unknown'
    if (!doctorCount[docName]) doctorCount[docName] = { name: docName, count: 0 }
    doctorCount[docName].count++
  })
  const topDoctors = Object.values(doctorCount).sort((a, b) => b.count - a.count)

  const unpaidCount = orders.filter((o) => o.is_paid === false).length
  const paidCount = orders.filter((o) => o.is_paid === true).length

  const statusCounts: Record<string, number> = {}
  orders.forEach((o) => {
    const s = o.status || 'ordered'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  })
  const totalOrders = orders.length
  const statusKeys = ['ordered', 'collected', 'processing', 'completed']

  const hourCounts: number[] = new Array(24).fill(0)
  orders.forEach((o) => {
    try {
      const h = new Date(o.created_at).getHours()
      hourCounts[h]++
    } catch {}
  })
  const maxHour = Math.max(...hourCounts, 1)

  const totalRevenue = revenueData?.total_revenue ?? 0
  const avgPrice = paidCount > 0 ? totalRevenue / paidCount : 0

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
          <BarChart3 size={22} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab Reports & Statistics</h1>
          <p className="text-sm text-slate-500">Analytics, trends, and financial overview for laboratory services</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={18} className="text-blue-500" />
            <span className="text-xs font-semibold text-slate-500">Tests Today</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{todayOrders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <Activity size={18} className="text-emerald-500" />
            <span className="text-xs font-semibold text-slate-500">Tests This Week</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{weekOrders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <BarChart3 size={18} className="text-purple-500" />
            <span className="text-xs font-semibold text-slate-500">Tests This Month</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{monthOrders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp size={18} className="text-amber-500" />
            <span className="text-xs font-semibold text-slate-500">Avg Daily (Month)</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{avgDaily}</p>
        </div>
      </div>

      {/* Test Frequency & Doctor Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Frequency */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-slate-700">Most Frequently Ordered Tests</h3>
          </div>
          {topTests.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-slate-400">
              <FlaskConical size={32} className="text-slate-300 mb-2" />
              <p className="text-sm">No test orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topTests.map(([name, count]) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700 font-medium truncate mr-2">{name}</span>
                    <span className="text-slate-500 font-semibold text-xs">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxTestFreq) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Doctor Request Patterns */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-slate-700">Doctor Request Patterns</h3>
          </div>
          {topDoctors.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-slate-400">
              <Users size={32} className="text-slate-300 mb-2" />
              <p className="text-sm">No doctor data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topDoctors.slice(0, 10).map((doc) => {
                const maxDocCount = topDoctors[0].count
                return (
                  <div key={doc.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700 font-medium truncate mr-2">{doc.name}</span>
                      <span className="text-slate-500 font-semibold text-xs">{doc.count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${(doc.count / maxDocCount) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button
            onClick={() => navigate('/lab/worklist')}
            className="mt-4 flex items-center gap-1 text-xs text-primary font-medium hover:underline"
          >
            View worklist <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Revenue & Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue / Financial */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Banknote size={16} className="text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-700">Revenue</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Total Revenue (Paid Tests)</p>
              <p className="text-2xl font-bold text-slate-900">₦{totalRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Average Price Per Test</p>
              <p className="text-lg font-semibold text-slate-800">₦{Math.round(avgPrice).toLocaleString()}</p>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Paid: {paidCount}</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /> Unpaid: {unpaidCount}</span>
            </div>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-slate-700">Status Distribution</h3>
          </div>
          <div className="space-y-3">
            {statusKeys.map((key) => {
              const count = statusCounts[key] || 0
              const pct = totalOrders > 0 ? (count / totalOrders) * 100 : 0
              const s = statusColors[key] || { bar: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' }
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-600">{statusLabels[key] || key}</span>
                    <span className="text-slate-500">{count} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${s.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Peak Hours Trend */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-slate-700">Peak Hours (24h Trend)</h3>
        </div>
        <div className="flex items-end gap-1 h-24">
          {hourCounts.map((count, h) => {
            const pct = maxHour > 0 ? (count / maxHour) * 100 : 0
            const isPeak = count >= maxHour * 0.8
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${isPeak ? 'bg-primary' : 'bg-primary/30'} transition-all duration-300`}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${h}:00 — ${count} orders`}
                />
                {h % 4 === 0 && <span className="text-[8px] text-slate-400">{h}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => navigate('/lab/inventory')}
          className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left hover:bg-slate-100 transition-colors">
          <Package size={20} className="text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-800">Lab Inventory</p>
            <p className="text-xs text-slate-500">View and manage lab supplies</p>
          </div>
        </button>
        <button onClick={() => navigate('/lab/worklist')}
          className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-left hover:bg-amber-100 transition-colors">
          <Activity size={20} className="text-amber-600" />
          <div>
            <p className="text-sm font-medium text-slate-800">Active Worklist</p>
            <p className="text-xs text-slate-500">View pending and active orders</p>
          </div>
        </button>
      </div>
    </div>
  )
}
