import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, Loader2, User, Banknote, CreditCard, Landmark, Smartphone, TrendingUp, Receipt, Calendar, ChevronLeft, ChevronRight, Building2, ArrowLeft, FileText, Clock, Printer, X, CheckCircle, Package, Pill, FlaskConical, Scan, Home,
} from 'lucide-react'

const PAGE_SIZE = 20

export default function FinancePatientBilling() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [billing, setBilling] = useState<any>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [detailPayment, setDetailPayment] = useState<any>(null)

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    setLoading(true)
    try { const r = await api.get('/patients'); setPatients(r.data || []) } catch {} finally { setLoading(false) }
  }

  async function loadBilling(patient: any) {
    setSelectedPatient(patient)
    setBillingLoading(true)
    setBilling(null)
    try {
      const r = await api.get(`/payments/patient-billing/${patient.id}`)
      setBilling(r.data)
    } catch {} finally { setBillingLoading(false) }
  }

  const filtered = patients.filter((p: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (p.full_name || '').toLowerCase().includes(q) || (p.hospital_number || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q)
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const methodIcon = (m: string) => {
    const map: Record<string, any> = { cash: Banknote, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || Banknote
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/finance/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Building2 size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Patient Billing Records</h1>
          <p className="text-sm text-slate-500">View comprehensive billing history for any patient</p>
        </div>
      </div>

      {!selectedPatient ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by name, hospital #, or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : paged.length === 0 ? (
            <div className="text-center py-16 text-slate-400"><User size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-medium">No patients found</p></div>
          ) : (
            <>
              <div className="divide-y divide-slate-50 max-h-[450px] overflow-y-auto">
                {paged.map((p: any) => (
                  <button key={p.id} onClick={() => loadBilling(p)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 text-left transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={16} className="text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{p.full_name}</p>
                      <p className="text-xs text-slate-400">{p.hospital_number} {p.phone ? `· ${p.phone}` : ''}</p>
                    </div>
                    <span className="text-xs text-primary font-medium">&rarr;</span>
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-30 hover:bg-white"><ChevronLeft size={14} /> Prev</button>
                  <span className="text-xs text-slate-500">Page {page + 1} of {totalPages} ({filtered.length} patients)</span>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-30 hover:bg-white">Next <ChevronRight size={14} /></button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Patient header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSelectedPatient(null); setBilling(null) }} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><User size={22} className="text-primary" /></div>
              <div>
                <p className="text-lg font-bold text-slate-800">{selectedPatient.full_name}</p>
                <p className="text-sm text-slate-400">{selectedPatient.hospital_number} · {selectedPatient.phone || 'No phone'}</p>
              </div>
            </div>
          </div>

          {billingLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : billing ? (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Banknote size={18} className="text-emerald-600" /></div>
                    <p className="text-xs text-slate-500">Total Spent</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">₦{Number(billing.stats?.total_paid || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Receipt size={18} className="text-blue-600" /></div>
                    <p className="text-xs text-slate-500">Total Payments</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{billing.stats?.payment_count || 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Calendar size={18} className="text-purple-600" /></div>
                    <p className="text-xs text-slate-500">First Payment</p>
                  </div>
                  <p className="text-base font-bold text-slate-900">{billing.stats?.first_payment ? new Date(billing.stats.first_payment).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><Clock size={18} className="text-amber-600" /></div>
                    <p className="text-xs text-slate-500">Last Payment</p>
                  </div>
                  <p className="text-base font-bold text-slate-900">{billing.stats?.last_payment ? new Date(billing.stats.last_payment).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
              </div>

              {/* Payment method breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment Method Breakdown</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Cash', amount: billing.stats?.cash_total || 0, icon: Banknote, color: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
                    { label: 'Card', amount: billing.stats?.card_total || 0, icon: CreditCard, color: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
                    { label: 'Transfer', amount: billing.stats?.transfer_total || 0, icon: Landmark, color: 'bg-purple-50 text-purple-700', bar: 'bg-purple-500' },
                    { label: 'Other', amount: (billing.stats?.total_paid || 0) - (billing.stats?.cash_total || 0) - (billing.stats?.card_total || 0) - (billing.stats?.transfer_total || 0), icon: Banknote, color: 'bg-slate-50 text-slate-700', bar: 'bg-slate-500' },
                  ].map((m) => {
                    const total = billing.stats?.total_paid || 1
                    const pct = (m.amount / total) * 100
                    const Icon = m.icon
                    return (
                      <div key={m.label} className={`rounded-xl p-4 ${m.color}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={16} />
                          <span className="text-xs font-medium">{m.label}</span>
                        </div>
                        <p className="text-lg font-bold">₦{Number(m.amount).toLocaleString()}</p>
                        <p className="text-xs opacity-70">{pct.toFixed(1)}% of total</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Payment history table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700">Payment History</h3>
                </div>
                {billing.payments && billing.payments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Receipt</th>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Amount</th>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Method</th>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Items</th>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {billing.payments.map((pmt: any) => {
                          const Icon = methodIcon(pmt.payment_method)
                          return (
                            <tr key={pmt.id} onClick={async () => {
                              try { const r = await api.get(`/payments/${pmt.id}`); setDetailPayment(r.data) } catch {}
                            }} className="cursor-pointer hover:bg-slate-50 transition-colors group">
                              <td className="px-5 py-3.5 font-mono text-primary font-medium text-xs">{pmt.receipt_number}</td>
                              <td className="px-5 py-3.5 font-bold text-slate-800">₦{Number(pmt.total_amount).toLocaleString()}</td>
                              <td className="px-5 py-3.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"><Icon size={10} />{pmt.payment_method?.toUpperCase()}</span></td>
                              <td className="px-5 py-3.5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">{pmt.item_count || '—'}</span></td>
                              <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{new Date(pmt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="px-5 py-3.5 text-xs text-slate-400 max-w-[120px] truncate">{pmt.notes || '—'}</td>
                              <td className="px-5 py-3.5 text-right text-primary opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400">
                    <Receipt size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-medium">No payment records found</p>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Payment Detail Modal */}
      {detailPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailPayment(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Receipt size={20} className="text-emerald-600" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Payment Details</h2>
                  <p className="text-xs text-slate-400 font-mono">{detailPayment.receipt_number}</p>
                </div>
              </div>
              <button onClick={() => setDetailPayment(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Patient & Payment Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold text-slate-800">{detailPayment.patient_name || detailPayment.walkin_name || 'Walk-in'}</p>
                  {detailPayment.hospital_number && <p className="text-xs text-slate-400 font-mono">{detailPayment.hospital_number}</p>}
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Payment Method</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${detailPayment.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : detailPayment.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : detailPayment.payment_method === 'transfer' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                    {(() => {
                      const MIcon = methodIcon(detailPayment.payment_method)
                      return <><MIcon size={14} />{detailPayment.payment_method?.toUpperCase()}</>
                    })()}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Items</h4>
                <div className="space-y-2">
                  {(detailPayment.items || []).length > 0 ? detailPayment.items.map((item: any, i: number) => {
                    const serviceIcon: Record<string, any> = {
                      prescription: Pill, lab: FlaskConical, radiology: Scan, folder_activation: User, admission: Home, billing: Receipt,
                    }
                    const SIcon = serviceIcon[item.service_type] || Package
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><SIcon size={16} className="text-slate-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{item.service_type?.replace('_', ' ')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-slate-800">₦{(item.total_price || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400">×{item.quantity || 1}</p>
                        </div>
                      </div>
                    )
                  }) : (
                    <p className="text-sm text-slate-400 text-center py-4">No items data</p>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                {detailPayment.notes && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Notes</span>
                    <span className="text-slate-700 max-w-[60%] text-right">{detailPayment.notes}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Amount</span>
                  <span className="text-lg font-bold text-emerald-700">₦{(detailPayment.total_amount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-200">
                  <span>{detailPayment.created_at ? new Date(detailPayment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                  {detailPayment.staff_name && <span>By: {detailPayment.staff_name}</span>}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition-colors"><Printer size={14} /> Print</button>
              <button onClick={() => setDetailPayment(null)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
