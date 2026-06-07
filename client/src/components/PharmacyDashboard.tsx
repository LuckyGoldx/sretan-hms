import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Pill, Package, AlertTriangle, ClipboardList, Clock, Loader2, ArrowRight
} from 'lucide-react'

export default function PharmacyDashboard() {
  const navigate = useNavigate()
  const [pendingRx, setPendingRx] = useState(0)
  const [lowStock, setLowStock] = useState(0)
  const [expiring, setExpiring] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [rxRes, invRes, expRes] = await Promise.all([
          api.get('/prescriptions?status=pending').catch(() => ({ data: [] })),
          api.get('/inventory').catch(() => ({ data: [] })),
          api.get('/inventory/expiring').catch(() => ({ data: [] })),
        ])
        const inv = invRes.data || []
        setPendingRx(rxRes.data?.length || 0)
        setLowStock(inv.filter((i: any) => i.stock_count <= i.reorder_level).length)
        setExpiring(expRes.data?.length || 0)
        setTotalItems(inv.length)
      } catch {} finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  }

  const cards = [
    { label: 'Pending Prescriptions', count: pendingRx, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-100', route: '/dispensing' },
    { label: 'Low Stock Items', count: lowStock, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100', route: '/inventory' },
    { label: 'Expiring Soon', count: expiring, icon: Clock, color: 'text-rose-600', bg: 'bg-rose-100', route: '/expiry' },
    { label: 'Total Inventory', count: totalItems, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-100', route: '/inventory' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Pill size={22} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pharmacy Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of pharmacy operations</p>
        </div>
      </div>

      {expiring > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-500 text-white shadow-sm">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium flex-1">{expiring} item{expiring !== 1 ? 's' : ''} expiring within 30 days.</p>
          <button onClick={() => navigate('/expiry')} className="text-sm font-semibold underline">Review</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.label}
              onClick={() => navigate(c.route)}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 text-left hover:shadow-md hover:border-slate-200 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={24} className={c.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold text-slate-900">{c.count}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Dispensing', desc: 'Fill pending prescriptions', icon: ClipboardList, route: '/dispensing', color: 'emerald' },
          { title: 'Inventory', desc: 'Manage stock and add items', icon: Package, route: '/inventory', color: 'blue' },
          { title: 'Expiry Monitor', desc: 'Track expiring medications', icon: Clock, route: '/expiry', color: 'rose' },
        ].map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.title}
              onClick={() => navigate(m.route)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <div className={`w-11 h-11 rounded-xl bg-${m.color}-100 flex items-center justify-center mb-4`}>
                <Icon size={22} className={`text-${m.color}-600`} />
              </div>
              <h3 className="font-semibold text-slate-800">{m.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{m.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
