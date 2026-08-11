import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, X, Loader2, Receipt, Plus, Trash2, Printer, CreditCard, Building2, Landmark, Smartphone, CheckCircle, ArrowLeft, User, Banknote, FileText, Clock, Package, FlaskConical, Scan, Pill, Home, ShoppingCart, Shield,
} from 'lucide-react'

interface CartItem {
  service_type: string
  service_id: string | null
  description: string
  quantity: number
  unit_price: number
  needsPrice?: boolean
}

const CATEGORY_META: Record<string, { label: string; module?: string; icon: any }> = {
  pharmacy: { label: 'Pharmacy', module: 'pharmacy', icon: Pill },
  lab: { label: 'Laboratory', module: 'lab', icon: FlaskConical },
  radiology: { label: 'Radiology', module: 'radiology', icon: Scan },
  general: { label: 'Services', icon: Building2 },
}

const serviceIcons: Record<string, any> = {
  folder_activation: User, prescription: Pill, lab: FlaskConical, radiology: Scan, admission: Home,
}

export default function PaypointCheckout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const tab = location.pathname === '/paypoint/history' ? 'orders' : 'new'
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [pendingSummary, setPendingSummary] = useState<any[]>([])
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [payments, setPayments] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [inventoryCatalog, setInventoryCatalog] = useState<any[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [allFilter, setAllFilter] = useState('')
  const [detailItem, setDetailItem] = useState<any | null>(null)
  const [showCartModal, setShowCartModal] = useState(false)
  const [insuranceInfo, setInsuranceInfo] = useState<any>(null)
  const [billToInsurance, setBillToInsurance] = useState(false)
  const [coPayAmount, setCoPayAmount] = useState(0)
  const [coPayLoading, setCoPayLoading] = useState(false)
  const [insuredCoverage, setInsuredCoverage] = useState<any>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
  }, [])

  useEffect(() => { loadPendingSummary() }, [])

  useEffect(() => {
    if (tab === 'orders') loadPayments()
  }, [tab])

  async function loadPendingSummary() {
    try { const r = await api.get('/payments/pending-summary'); setPendingSummary(r.data || []) } catch {}
  }

  async function loadPayments() {
    setPaymentsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedPatient) params.set('patient_id', selectedPatient.id)
      const res = await api.get(`/payments?${params}`)
      setPayments(res.data || [])
    } catch {} finally { setPaymentsLoading(false) }
  }

  async function selectAndLoadPending(p: any) {
    setSelectedPatient(p)
    setBillToInsurance(false)
    setCoPayAmount(0)
    try {
      // Check if patient has active insurance
      try {
        const insRes = await api.get(`/insurance/active-case/${p.id}`)
        setInsuranceInfo(insRes.data?.hasActiveCase ? insRes.data.case : null)
        // Fetch co-pay amount
        if (insRes.data?.hasActiveCase) {
          try {
            const coRes = await api.get(`/insurance/co-pay/${p.id}`)
            setCoPayAmount(coRes.data?.co_pay_amount || 0)
          } catch { setCoPayAmount(0) }
        }
      } catch { setInsuranceInfo(null); setCoPayAmount(0) }
      const res = await api.get(`/payments/pending/${p.id}`)
      var items = res.data?.items || []
      setInsuredCoverage(res.data?.insured || null)
      setPendingItems(items)
      setCart(items.map(function(item: any) { return { ...item } }))
    } catch {}
  }

  function addToCart(item: any) {
    setCart((prev) => {
      if (prev.find((c) => c.service_id === item.service_id && c.service_type === item.service_type)) {
        return prev
      }
      return [...prev, { ...item }]
    })
  }

  function removeFromCart(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)) }
  function updateQty(idx: number, qty: number) { setCart((prev) => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, qty) } : c)) }

  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)

  async function handlePayment() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      if (billToInsurance && insuranceInfo && selectedPatient) {
        // Split checkout: collect co-pay + bill remaining to insurance
        const items = cart.map((c) => ({
          service_type: c.service_type,
          description: c.description,
          quantity: c.quantity,
          unit_price: c.unit_price,
        }))
        const totalBill = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
        const patientCoPay = Math.min(coPayAmount, totalBill)
        const insuranceBilled = totalBill - patientCoPay

        // Collect co-pay from patient
        let coPayReceipt = null
        if (patientCoPay > 0) {
          try {
            const coRes = await api.post('/insurance/co-pay/pay', {
              patientId: selectedPatient.id,
              caseId: insuranceInfo.id,
              amount: patientCoPay,
              paymentMethod: paymentMethod,
            })
            coPayReceipt = coRes.data.receipt_number
          } catch (err: any) {
            alert('Co-pay collection failed: ' + (err.response?.data?.message || err.message))
            setSubmitting(false)
            return
          }
        }

        // Bill remaining to insurance
        let insuranceRes = null
        if (insuranceBilled > 0) {
          try {
            insuranceRes = await api.post('/insurance/bill-to-insurance', {
              patientId: selectedPatient.id,
              caseId: insuranceInfo.id,
              items,
              source: 'paypoint',
              created_by: currentUser?.id,
            })
          } catch (err: any) {
            alert('Insurance billing failed: ' + (err.response?.data?.message || err.message))
            setSubmitting(false)
            return
          }
        }

        setReceipt({
          receipt_number: coPayReceipt || `INS-${insuranceInfo.case_number}`,
          patient_name: selectedPatient.full_name,
          hospital_number: selectedPatient.hospital_number,
          total_amount: totalBill,
          co_pay_amount: patientCoPay,
          insurance_amount: insuranceBilled,
          items: items.map((c: any) => ({ description: c.description, total_price: (c.quantity || 1) * (c.unit_price || 0) })),
          payment_method: `Split: Co-pay ₦${patientCoPay.toLocaleString()} (${paymentMethod}) + Insurance ₦${insuranceBilled.toLocaleString()} to ${insuranceInfo.provider_name}`,
          created_at: new Date().toISOString(),
          staff_name: currentUser?.name,
        })
        setShowReceipt(true); setCart([]); setNotes('')
        setBillToInsurance(false); setCoPayAmount(0)
        if (selectedPatient) {
          const pending = await api.get(`/payments/pending/${selectedPatient.id}`)
          setPendingItems(pending.data?.items || [])
        }
        loadPendingSummary()
      } else {
        var payload: any = {
          items: cart.map((c) => ({ service_type: c.service_type, service_id: c.service_id, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
          payment_method: paymentMethod, notes: notes || null, created_by: currentUser?.id,
        }
        if (selectedPatient) { payload.patient_id = selectedPatient.id }
        const res = await api.post('/payments', payload)
        setReceipt(res.data); setShowReceipt(true); setCart([]); setNotes('')
        if (selectedPatient) {
          const pending = await api.get(`/payments/pending/${selectedPatient.id}`)
          setPendingItems(pending.data?.items || [])
        }
        loadPendingSummary()
      }
    } catch (err: any) { alert(err.response?.data?.message || 'Payment failed')
    } finally { setSubmitting(false) }
  }

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'transfer', label: 'Transfer', icon: Landmark, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'pos', label: 'POS', icon: Smartphone, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ]

  const filteredOrders = payments.filter((p) => {
    if (!ordersSearch) return true
    var q = ordersSearch.toLowerCase()
    return (p.receipt_number?.toLowerCase().includes(q) || p.patient_name?.toLowerCase().includes(q) || p.walkin_name?.toLowerCase().includes(q) || p.staff_name?.toLowerCase().includes(q))
  })

  const methodIcon = (m: string) => {
    const map: Record<string, any> = { cash: Banknote, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || Banknote
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Payment History</h1>

      {tab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {!selectedPatient ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs text-slate-400 mb-3">{pendingSummary.length} patient(s) with pending payments</p>
                {pendingSummary.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <CheckCircle size={40} className="mx-auto mb-3 text-emerald-300" />
                    <p className="text-sm font-medium">All patients are settled</p>
                    <p className="text-xs mt-1">No pending payments across any module.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingSummary.map((p: any) => (
                      <button key={p.patient_id} onClick={() => selectAndLoadPending({ id: p.patient_id, full_name: p.full_name, hospital_number: p.hospital_number })}
                        className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0"><User size={18} className="text-amber-600" /></div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                              <p className="text-xs text-slate-400">{p.hospital_number}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {(p.services || []).map((svc: any) => {
                              const Icon = serviceIcons[svc.service_type] || Package
                              return (
                                <div key={svc.service_type} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-100">
                                  <Icon size={12} className="text-rose-500" />
                                  <span className="text-xs font-medium text-rose-600">{svc.item_count}</span>
                                </div>
                              )
                            })}
                            <span className="text-xs text-primary font-medium ml-2">&rarr;</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setSelectedPatient(null); setPendingItems([]); setCart([]); setInsuranceInfo(null); setBillToInsurance(false) }} className="p-1.5 rounded-lg hover:bg-slate-100"><ArrowLeft size={16} className="text-slate-500" /></button>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><User size={16} className="text-primary" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{selectedPatient.full_name}</p>
                      <p className="text-xs text-slate-400">{selectedPatient.hospital_number}</p>
                    </div>
                  </div>
                  {insuranceInfo && (
                    <button onClick={() => setBillToInsurance(!billToInsurance)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-all ${
                        billToInsurance
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}>
                      <Shield size={14} />
                      {billToInsurance ? `Billing to ${insuranceInfo.provider_name}` : `Bill to Insurance (${insuranceInfo.provider_name})`}
                    </button>
                  )}
                </div>
                {billToInsurance && insuranceInfo && (
                  <div className="mb-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                    <strong>Billing to insurance:</strong> {insuranceInfo.provider_name} · Case {insuranceInfo.case_number}
                    {insuranceInfo.auth_code && <span> · Auth: {insuranceInfo.auth_code}</span>}
                    {coPayAmount > 0 && (
                      <span className="block mt-1">
                        Split: Patient co-pay <strong>₦{coPayAmount.toLocaleString()}</strong> + Insurance covers the rest
                      </span>
                    )}
                  </div>
                )}
                {pendingItems.length > 0 ? (
                  <div className="space-y-2">
                    {pendingItems.map((item, i) => (
                      <div key={i} className={`px-4 py-3 rounded-xl border ${item.coverage_pct > 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700 truncate">{item.description}</p>
                            <p className="text-xs text-slate-400 capitalize">
                              {item.service_type.replace('_', ' ')}
                              {item.unit_price > 0 ? ` · ₦${Number(item.unit_price).toLocaleString()}` : ''}
                              {item.original_price ? ` (was ₦${Number(item.original_price).toLocaleString()})` : ''}
                            </p>
                            {item.coverage_pct > 0 && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                                  <Shield size={10} /> {item.coverage_pct}% covered
                                </span>
                                {item.patient_owes > 0 && (
                                  <span className="text-[10px] text-amber-600 font-medium">Patient pays ₦{Number(item.patient_owes).toLocaleString()}</span>
                                )}
                                {item.insurance_covered > 0 && (
                                  <span className="text-[10px] text-emerald-600 font-medium">Insurance covers ₦{Number(item.insurance_covered).toLocaleString()}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {item.unit_price > 0 ? (
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 flex-shrink-0 ml-3"><CheckCircle size={12} /> ₦{Number(item.unit_price).toLocaleString()}</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium flex-shrink-0 ml-3">Set price</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400">
                    <CheckCircle size={30} className="mx-auto mb-2 text-emerald-300" />
                    <p className="text-xs font-medium">All services paid</p>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Right: Cart & Checkout — desktop */}
          <div className="hidden lg:block space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><ShoppingCart size={16} /> Payment Cart ({cart.length})</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Select a patient to view pending items.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cart.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-medium text-slate-700 flex-1 truncate">{item.description}</p>
                        <button onClick={() => removeFromCart(i)} className="p-0.5 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex-shrink-0"><X size={12} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><label className="text-[10px] text-slate-400">Price</label>
                          <div className="w-full rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-700">₦{(item.unit_price || 0).toLocaleString()}</div>
                        </div>
                        <div className="w-16"><label className="text-[10px] text-slate-400">Qty</label>
                          <input type="number" min={1} value={item.quantity}
                            onChange={(e) => updateQty(i, parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                        <div className="min-w-[60px] text-right"><label className="text-[10px] text-slate-400">Total</label>
                          <p className="text-sm font-bold text-slate-800">₦{(item.unit_price * item.quantity).toLocaleString()}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {cart.length > 0 && (
                <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((m) => {
                      const PMIcon = m.icon
                      return (
                        <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${paymentMethod === m.value ? m.color + ' ring-2 ring-primary/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <PMIcon size={14} />{m.label}
                        </button>
                      )
                    })}
                  </div>
                  <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{cart.length} item(s)</span>
                    <span className="text-lg font-bold text-slate-800">₦{total.toLocaleString()}</span>
                  </div>
                  <button onClick={handlePayment} disabled={submitting || cart.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    {submitting ? 'Processing...' : `Pay ₦${total.toLocaleString()}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FileText size={16} className="text-primary" /> Payment History</h3>
              <div className="relative w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search receipt, patient, or staff..." value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            {paymentsLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium">No payment orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Receipt</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Cashier</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredOrders.map((p: any) => {
                      const Icon = methodIcon(p.payment_method)
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-primary font-medium">{p.receipt_number}</td>
                          <td className="px-4 py-3"><p className="font-medium text-slate-800">{p.patient_name || p.walkin_name || 'Walk-in'}</p>{p.hospital_number && <p className="text-xs text-slate-400">{p.hospital_number}</p>}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">{p.item_count || '—'}</span></td>
                          <td className="px-4 py-3 font-bold text-slate-800">₦{parseFloat(p.total_amount).toLocaleString()}</td>
                          <td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"><Icon size={10} />{p.payment_method?.toUpperCase()}</span></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{p.staff_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={async () => { try { const r = await api.get(`/payments/${p.id}`); setReceipt(r.data); setShowReceipt(true) } catch {} }}
                              className="text-xs text-primary font-medium hover:underline whitespace-nowrap">View Receipt</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3"><CheckCircle size={28} className="text-emerald-600" /></div>
              <h2 className="text-lg font-semibold text-slate-800">Payment Successful</h2>
              <p className="text-xs text-slate-400 mt-1">Receipt #{receipt.receipt_number}</p>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-center pb-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800">{receipt.patient_name || receipt.walkin_name || 'Walk-in Customer'}</p>
                {receipt.hospital_number && <p className="text-xs text-slate-400">#{receipt.hospital_number}</p>}
              </div>
              <div className="space-y-2">
                {(receipt.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600 flex-1 truncate">{item.description}</span>
                    <span className="font-medium text-slate-800 ml-4">₦{(item.total_price || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-800 pt-3 border-t border-slate-100">
                <span>Total</span><span>₦{(receipt.total_amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pt-2">
                <span>Payment: {receipt.payment_method?.toUpperCase()}</span>
                <span>{new Date(receipt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {receipt.staff_name && <p className="text-xs text-slate-400 text-center pt-1">Processed by: {receipt.staff_name}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"><Printer size={14} /> Print</button>
              <button onClick={() => setShowReceipt(false)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
