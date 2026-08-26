import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Pill, Package, AlertTriangle, ClipboardList, Clock, Loader2, ArrowRight, ShoppingCart, Truck, CheckCircle, ChevronRight, Boxes, Stethoscope, Banknote,
} from 'lucide-react'

interface PendingRx {
  id: string
  drug_name: string
  dosage?: string
  quantity?: number
  instructions?: string
  is_paid?: boolean
  doctor_name?: string
  patient_name?: string
  hospital_number?: string
  created_at?: string
}

interface InventoryItem {
  id: string
  drug_name: string
  stock_count: number
  reorder_level: number
  expiry_date?: string
  batch_number?: string
}

export default function PharmacyDashboard() {
  const navigate = useNavigate()
  const [readyRx, setReadyRx] = useState<PendingRx[]>([])
  const [paidCount, setPaidCount] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [lowStock, setLowStock] = useState<InventoryItem[]>([])
  const [expiring, setExpiring] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [rxRes, invRes, expRes] = await Promise.all([
        api.get('/prescriptions?status=pending').catch(() => ({ data: [] })),
        api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
        api.get('/inventory/expiring?category=pharmacy').catch(() => ({ data: [] })),
      ])
      const inv = (invRes.data || []) as InventoryItem[]
      const allRx = (rxRes.data || []) as any[]
      const paidRx = allRx.filter((rx: any) => rx.is_paid)
      setPaidCount(paidRx.length)
      setUnpaidCount(allRx.length - paidRx.length)
      const recent = paidRx.slice(0, 8)
      const enriched = await Promise.all(
        recent.map(async (rx: any) => {
          try {
            const encResp = await api.get<any>(`/encounters/${rx.encounter_id}`)
            const patResp = await api.get<any>(`/patients/${encResp.data.patient_id}`)
            return { ...rx, patient_name: patResp.data.full_name, hospital_number: patResp.data.hospital_number }
          } catch { return { ...rx, patient_name: 'Unknown' } }
        })
      )
      setReadyRx(enriched)
      setLowStock(inv.filter((i: any) => i.stock_count <= i.reorder_level))
      setExpiring(expRes.data || [])
    } catch {} finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 10000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  }

  const stats = [
    { label: 'Ready to Dispense', count: paidCount, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100', route: '/dispensing' },
    { label: 'Unpaid Prescriptions', count: unpaidCount, icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-100', route: '/dispensing/unpaid' },
    { label: 'Low Stock Items', count: lowStock.length, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-100', route: '/pharmacy-inventory' },
    { label: 'Expiring Soon', count: expiring.length, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100', route: '/pharmacy-expiry' },
  ]

  const quickActions = [
    { title: 'Dispensing', desc: 'Fill paid prescriptions', icon: ClipboardList, route: '/dispensing', color: 'emerald' },
    { title: 'Unpaid Prescriptions', desc: 'Review unpaid orders to dispense', icon: Banknote, route: '/dispensing/unpaid', color: 'amber' },
    { title: 'Pharmacy Inventory', desc: 'Manage stock and add items', icon: Boxes, route: '/pharmacy-inventory', color: 'blue' },
    { title: 'Purchase Orders', desc: 'Replenish stock from suppliers', icon: Truck, route: '/purchase-orders', color: 'indigo' },
    { title: 'Expiry Monitor', desc: 'Track expiring medications', icon: Clock, route: '/pharmacy-expiry', color: 'rose' },
    { title: 'Walk-in Sales', desc: 'OTC sales at the counter', icon: ShoppingCart, route: '/walk-in-sales', color: 'amber' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Pill size={22} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Pharmacy Dashboard</h1>
            <p className="text-sm text-slate-500">Operational overview of pharmacy activity</p>
          </div>
        </div>
        <button onClick={() => navigate('/dispensing')}
          className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
          <ClipboardList size={15} /> Open Dispensing
        </button>
      </div>

      {expiring.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-500 text-white shadow-sm">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium flex-1">{expiring.length} item{expiring.length !== 1 ? 's' : ''} expiring within 30 days.</p>
          <button onClick={() => navigate('/pharmacy-expiry')} className="text-sm font-semibold underline">Review</button>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-500 text-white shadow-sm">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium flex-1">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} at or below reorder level.</p>
          <button onClick={() => navigate('/pharmacy-inventory')} className="text-sm font-semibold underline">Review</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((c) => {
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ready to Dispense (Paid) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CheckCircle size={16} className="text-emerald-500" /> Ready to Dispense (Paid)</h3>
            {unpaidCount > 0 ? (
              <button onClick={() => navigate('/dispensing/unpaid')} className="flex items-center gap-1 text-xs text-amber-600 font-medium hover:underline">
                View {unpaidCount} unpaid <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={() => navigate('/dispensing')} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                View All <ChevronRight size={14} />
              </button>
            )}
          </div>
          {readyRx.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400">
              <CheckCircle size={36} className="text-emerald-300 mb-2" />
              <p className="text-sm font-medium">No paid prescriptions awaiting dispensing</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {readyRx.map((rx) => (
                <button key={rx.id} onClick={() => navigate('/dispensing')}
                  className="w-full flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{rx.drug_name}</p>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle size={10} /> Paid</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{rx.dosage} &middot; Qty: {rx.quantity}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Patient: {rx.patient_name || 'Unknown'}{rx.hospital_number ? ` · ${rx.hospital_number}` : ''}</p>
                    {rx.doctor_name && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {rx.doctor_name}</p>}
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((m) => {
                const Icon = m.icon
                return (
                  <button key={m.title} onClick={() => navigate(m.route)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-slate-50 text-center hover:border-slate-200 hover:shadow-sm transition-all">
                    <Icon size={18} className="text-primary" />
                    <span className="text-xs font-medium text-slate-700 leading-tight">{m.title}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Low Stock</h3>
                <button onClick={() => navigate('/pharmacy-inventory')} className="text-xs text-primary font-medium hover:underline">Manage</button>
              </div>
              <div className="divide-y divide-slate-50">
                {lowStock.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.drug_name}</p>
                      {item.batch_number && <p className="text-[10px] text-slate-400">Batch {item.batch_number}</p>}
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex-shrink-0 ${item.stock_count <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.stock_count} / {item.reorder_level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
