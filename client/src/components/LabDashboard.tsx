import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  FlaskConical, FileText, CheckCircle, Clock, History, BarChart3, Loader2,
  ArrowRight, Users, Banknote, RefreshCw, Activity, ClipboardList,
} from 'lucide-react'

const statusStyles: Record<string, string> = {
  ordered: 'bg-blue-100 text-blue-700',
  collected: 'bg-amber-100 text-amber-700',
  processing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

const statusLabels: Record<string, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  processing: 'Processing',
  completed: 'Completed',
}

export default function LabDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ ordered: 0, collected: 0, processing: 0, completed: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [awaitingCollection, setAwaitingCollection] = useState(0)
  const [paypointPending, setPaypointPending] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [statsRes, ordRes] = await Promise.all([
          api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
          api.get('/lab-orders').catch(() => ({ data: [] })),
        ])
        const s = statsRes.data || { ordered: 0, collected: 0, processing: 0, completed: 0 }
        setStats(s)

        const orders = ordRes.data || []
        setRecentOrders(orders
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
        )
        setUnpaidCount(orders.filter((o: any) => o.is_paid === false).length)
        setAwaitingCollection(orders.filter((o: any) => o.status === 'completed' && !o.results_collected_at).length)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    api.get('/lab-orders/paypoint-conversions?status=pending')
      .then((r) => setPaypointPending(r.data?.length || 0))
      .catch(() => {})
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  const statCards = [
    { label: 'Ordered', count: stats.ordered, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Collected', count: stats.collected, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Processing', count: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Completed', count: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  ]

  const quickActions = [
    { title: 'Worklist', desc: 'Manage lab orders and samples', icon: FileText, route: '/lab/worklist', color: 'blue' },
    { title: 'Results', desc: 'View and enter test results', icon: CheckCircle, route: '/lab/results', color: 'emerald' },
    { title: 'Orders', desc: 'Pending and completed orders', icon: Clock, route: '/lab/orders', color: 'amber' },
    { title: 'History', desc: 'Completed lab test history', icon: History, route: '/lab/history', color: 'slate' },
    { title: 'Catalog', desc: 'Manage test catalog and panels', icon: FlaskConical, route: '/lab/catalog', color: 'purple' },
    { title: 'Reports', desc: 'Lab analytics and reports', icon: BarChart3, route: '/lab/reports', color: 'rose' },
  ]

  const integrationCards = [
    {
      title: 'Pending Doctor Requests',
      desc: 'Tests ordered, awaiting sample collection',
      count: stats.ordered,
      icon: ClipboardList,
      route: '/lab/worklist',
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      title: 'Awaiting Nurse Collection',
      desc: 'Completed results not yet collected by patient',
      count: awaitingCollection,
      icon: Activity,
      route: '/lab/worklist',
      color: 'text-sky-600',
      bg: 'bg-sky-100',
    },
    {
      title: 'Unpaid Lab Orders',
      desc: 'Orders pending payment clearance',
      count: unpaidCount,
      icon: Banknote,
      route: '/lab/orders',
      color: 'text-rose-600',
      bg: 'bg-rose-100',
    },
    {
      title: 'Paypoint Conversions',
      desc: 'Pending paypoint conversion requests',
      count: paypointPending,
      icon: RefreshCw,
      route: '/lab/orders',
      color: 'text-violet-600',
      bg: 'bg-violet-100',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <FlaskConical size={22} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of laboratory operations and orders</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickActions.map((a) => {
          const Icon = a.icon
          return (
            <button key={a.title} onClick={() => navigate(a.route)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left hover:shadow-md hover:border-slate-300 transition-all group">
              <div className={`w-11 h-11 rounded-xl bg-${a.color}-100 flex items-center justify-center mb-4`}>
                <Icon size={22} className={`text-${a.color}-600`} />
              </div>
              <h3 className="font-semibold text-slate-800">{a.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{a.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {integrationCards.map((c) => {
          const Icon = c.icon
          return (
            <button key={c.title} onClick={() => navigate(c.route)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={24} className={c.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-2xl font-bold ${c.color}`}>{c.count}</p>
                  <p className="text-xs text-slate-500">{c.title}</p>
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
              </div>
              <p className="text-xs text-slate-400 mt-3">{c.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity size={16} className="text-purple-500" /> Recent Activity
          </h3>
          <button onClick={() => navigate('/lab/worklist')}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No recent lab activity</p>
        ) : (
          <div className="space-y-0">
            {recentOrders.map((o: any, idx: number) => (
              <div key={o.id} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                <div className="relative flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    o.status === 'ordered' ? 'bg-blue-100' :
                    o.status === 'collected' ? 'bg-amber-100' :
                    o.status === 'processing' ? 'bg-purple-100' :
                    'bg-emerald-100'
                  }`}>
                    <FlaskConical size={14} className={
                      o.status === 'ordered' ? 'text-blue-600' :
                      o.status === 'collected' ? 'text-amber-600' :
                      o.status === 'processing' ? 'text-purple-600' :
                      'text-emerald-600'
                    } />
                  </div>
                  {idx < recentOrders.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 mt-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{o.test_name}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{o.patient_name || 'Walk-in Patient'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
