import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Search, Loader2, ClipboardList, CheckCircle, Stethoscope, ChevronLeft, ChevronRight, Banknote, Calendar, Phone, AlertTriangle, Pill, User,
} from 'lucide-react'

const PAGE_SIZE = 30

interface UnpaidRx {
  id: string
  drug_name: string
  dosage?: string
  quantity?: number
  instructions?: string
  is_paid: boolean
  created_at?: string
  patient_id?: string
  full_name?: string
  hospital_number?: string
  phone?: string
  doctor_name?: string
  unit_price: number
}

export default function UnpaidOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<UnpaidRx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get<UnpaidRx[]>('/prescriptions/unpaid')
      setOrders(data || [])
    } catch {} finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 15000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [load])

  const filtered = orders.filter((rx) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (rx.drug_name || '').toLowerCase().includes(q)
      || (rx.dosage || '').toLowerCase().includes(q)
      || (rx.full_name || '').toLowerCase().includes(q)
      || (rx.hospital_number || '').toLowerCase().includes(q)
      || (rx.phone || '').toLowerCase().includes(q)
      || (rx.doctor_name || '').toLowerCase().includes(q)
  })

  const todayCount = filtered.filter((rx) => { var d = rx.created_at ? new Date(rx.created_at) : null; if (!d) return false; var t = new Date(); return d.toDateString() === t.toDateString() }).length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Banknote size={22} className="text-amber-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Unpaid Prescriptions</h1>
          <p className="text-sm text-slate-500">All unpaid orders awaiting payment before dispensing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><ClipboardList size={18} className="text-amber-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unpaid Prescriptions</h3></div>
          <p className="text-2xl font-bold text-slate-800">{filtered.length}</p>
          <p className="text-xs text-slate-400 mt-1">Awaiting payment</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3"><Calendar size={18} className="text-blue-500" /><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Added Today</h3></div>
          <p className="text-2xl font-bold text-blue-600">{todayCount}</p>
          <p className="text-xs text-slate-400 mt-1">New today</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search drug, patient, hospital #, phone, doctor..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
          {orders.length === 0 ? (
            <>
              <CheckCircle size={48} className="mx-auto mb-3 text-emerald-300" />
              <p className="text-sm font-medium">No unpaid prescriptions</p>
              <p className="text-xs mt-1">All pending prescriptions have been paid.</p>
            </>
          ) : (
            <>
              <Search size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium">No prescriptions match "{search}"</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((rx) => (
            <div key={rx.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={15} className="text-primary" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{rx.full_name || 'Unknown'}</p>
                    {rx.hospital_number && <p className="text-[10px] text-slate-400">{rx.hospital_number}</p>}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">
                  Unpaid
                </span>
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-800 leading-tight">{rx.drug_name}</p>
                  {rx.dosage && <p className="text-xs text-slate-500 mt-0.5">{rx.dosage}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">Qty: ×{rx.quantity || 1}</p>
                  {rx.instructions && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{rx.instructions}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {rx.unit_price > 0 ? (
                    <>
                      <p className="text-sm font-bold text-emerald-700">₦{(rx.unit_price * (rx.quantity || 1)).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">₦{rx.unit_price.toLocaleString()} × {rx.quantity || 1}</p>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium"><AlertTriangle size={11} /> No price</span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1 min-w-0">
                  <Stethoscope size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{rx.doctor_name || '—'}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                  <Calendar size={11} className="text-slate-400" />
                  <span>{rx.created_at ? new Date(rx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
              </div>

              {rx.phone && (
                <p className="mt-2 text-[10px] text-slate-400 flex items-center gap-1"><Phone size={9} /> {rx.phone}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap">Showing {paged.length} of {filtered.length} prescription(s)</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap">
              Page {safePage + 1} <span className="text-slate-400 font-medium">/ {totalPages}</span>
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <AlertTriangle size={14} />
          These prescriptions must be paid at Paypoint (or billed to insurance during dispensing) before they can be dispensed.
          <button onClick={() => navigate('/dispensing')} className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 flex-shrink-0">
            <Pill size={12} /> Go to Dispensing
          </button>
        </div>
      )}
    </div>
  )
}
