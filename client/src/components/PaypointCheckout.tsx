import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, X, Loader2, Receipt, Plus, Trash2, Printer, CreditCard, Building2, Landmark, Smartphone, CheckCircle, ArrowLeft, User, DollarSign, FileText, Clock, Package,
} from 'lucide-react'

interface CartItem {
  service_type: string
  service_id: string | null
  description: string
  quantity: number
  unit_price: number
  needsPrice?: boolean
}

const SERVICE_CATALOG = [
  { category: 'Consultation', items: [
    { name: 'General Consultation', price: 5000 },
    { name: 'Specialist Consultation', price: 10000 },
    { name: 'Follow-up Visit', price: 3000 },
    { name: 'Emergency Consultation', price: 8000 },
  ]},
  { category: 'Pharmacy', items: [
    { name: 'Over-the-Counter Drugs', price: 0 },
    { name: 'Medical Consumables', price: 0 },
  ]},
  { category: 'Laboratory', items: [
    { name: 'Malaria Test', price: 3000 },
    { name: 'Blood Sugar (RBS/FBS)', price: 2000 },
    { name: 'Urinalysis', price: 2500 },
    { name: 'Widal Test', price: 3500 },
    { name: 'Pregnancy Test', price: 2000 },
    { name: 'HIV Test', price: 2500 },
    { name: 'Hepatitis B Test', price: 4000 },
    { name: 'CBC (Full Blood Count)', price: 5000 },
    { name: 'Lipid Profile', price: 8000 },
    { name: 'LFT (Liver Function)', price: 7000 },
    { name: 'RFT (Kidney Function)', price: 7000 },
    { name: 'Electrolytes', price: 6000 },
    { name: 'Thyroid Function', price: 10000 },
    { name: 'PSA (Prostate)', price: 8000 },
  ]},
  { category: 'Radiology', items: [
    { name: 'Chest X-Ray', price: 7000 },
    { name: 'Limb X-Ray', price: 6000 },
    { name: 'Abdominal Ultrasound', price: 15000 },
    { name: 'Obstetric Ultrasound', price: 12000 },
    { name: 'CT Scan (per region)', price: 50000 },
    { name: 'MRI (per region)', price: 80000 },
    { name: 'ECG', price: 5000 },
    { name: 'Echocardiogram', price: 25000 },
  ]},
  { category: 'Procedures', items: [
    { name: 'Injection / IV Line', price: 3000 },
    { name: 'Dressing (Small)', price: 3000 },
    { name: 'Dressing (Large)', price: 5000 },
    { name: 'Suture / Stitch Removal', price: 5000 },
    { name: 'Catheter Insertion', price: 7000 },
    { name: 'NG Tube Insertion', price: 8000 },
    { name: 'Wound Toilet & Suturing', price: 15000 },
    { name: 'Incision & Drainage', price: 12000 },
    { name: 'Circumcision', price: 25000 },
  ]},
  { category: 'Maternity', items: [
    { name: 'Antenatal Visit', price: 5000 },
    { name: 'Delivery (Normal)', price: 50000 },
    { name: 'Delivery (Caesarean)', price: 150000 },
    { name: 'Postnatal Visit', price: 5000 },
    { name: 'Immunization', price: 3000 },
    { name: 'Family Planning', price: 5000 },
  ]},
  { category: 'Admission', items: [
    { name: 'Ward Admission (per day)', price: 15000 },
    { name: 'Private Room (per day)', price: 30000 },
    { name: 'ICU (per day)', price: 80000 },
  ]},
  { category: 'Miscellaneous', items: [
    { name: 'Medical Certificate', price: 5000 },
    { name: 'Report / Document', price: 3000 },
    { name: 'Medical Record Retrieval', price: 2000 },
    { name: 'Ambulance Service', price: 25000 },
    { name: 'Health Screening (Basic)', price: 15000 },
    { name: 'Health Screening (Comprehensive)', price: 35000 },
  ]},
]

export default function PaypointCheckout() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tab, setTab] = useState<'new' | 'orders'>('new')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [walkinName, setWalkinName] = useState('')
  const [walkinPhone, setWalkinPhone] = useState('')
  const [mode, setMode] = useState<'patient' | 'walkin'>('patient')
  const [payments, setPayments] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [customItemName, setCustomItemName] = useState('')
  const [customItemPrice, setCustomItemPrice] = useState('')

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
  }, [])

  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      try { const r = await api.get(`/patients/search?q=${encodeURIComponent(search)}`); setSearchResults(r.data || []) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (tab === 'orders') loadPayments()
  }, [tab, selectedPatient])

  async function loadPayments() {
    setPaymentsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedPatient) params.set('patient_id', selectedPatient.id)
      const res = await api.get(`/payments?${params}`)
      setPayments(res.data || [])
    } catch {} finally { setPaymentsLoading(false) }
  }

  async function selectPatient(p: any) {
    setSelectedPatient(p)
    setSearch(p.full_name)
    setSearchResults([])
    setLoading(true)
    try {
      const res = await api.get(`/payments/pending/${p.id}`)
      setPendingItems(res.data?.items || [])
    } catch {} finally { setLoading(false) }
    setCart([])
    setMode('patient')
  }

  function addToCart(item: any) {
    setCart((prev) => {
      if (prev.find((c) => c.service_id === item.service_id && c.service_type === item.service_type)) return prev
      return [...prev, { ...item, unit_price: 0 }]
    })
  }

  function removeFromCart(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)) }

  function updatePrice(idx: number, price: number) { setCart((prev) => prev.map((c, i) => i === idx ? { ...c, unit_price: price } : c)) }

  function updateQty(idx: number, qty: number) { setCart((prev) => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, qty) } : c)) }

  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)

  async function handlePayment() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      var payload: any = {
        items: cart.map((c) => ({ service_type: c.service_type, service_id: c.service_id, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod, notes: notes || null, created_by: currentUser?.id,
      }
      if (mode === 'patient' && selectedPatient) { payload.patient_id = selectedPatient.id }
      else { payload.walkin_name = walkinName || 'Walk-in Customer'; payload.walkin_phone = walkinPhone || null }
      const res = await api.post('/payments', payload)
      setReceipt(res.data)
      setShowReceipt(true)
      setCart([]); setNotes('')
      if (mode === 'patient' && selectedPatient) {
        const pending = await api.get(`/payments/pending/${selectedPatient.id}`)
        setPendingItems(pending.data?.items || [])
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Payment failed')
    } finally { setSubmitting(false) }
  }

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: DollarSign, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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
    const map: Record<string, any> = { cash: DollarSign, card: CreditCard, transfer: Landmark, pos: Smartphone }
    return map[m] || DollarSign
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Receipt size={24} className="text-emerald-500" /> Paypoint</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/finance')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Finance Dashboard</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('new')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'new' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}><Receipt size={15} className="inline mr-1" />New Payment</button>
        <button onClick={() => setTab('orders')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'orders' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}><FileText size={15} className="inline mr-1" />Payment Orders</button>
      </div>

      {tab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Patient Search & Pending Items */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search patient by name or hospital number..." value={search}
                    onChange={(e) => { setSearch(e.target.value); setSelectedPatient(null); setPendingItems([]); setCart([]) }}
                    className="w-full rounded-xl border border-slate-200 pl-11 pr-12 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => { setMode('patient'); setSearch(''); setSelectedPatient(null); setPendingItems([]); setCart([]) }}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${mode === 'patient' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                  <User size={14} className="inline mr-1" />Patient</button>
                <button onClick={() => { setMode('walkin'); setSearch(''); setSelectedPatient(null); setPendingItems([]); setCart([]) }}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${mode === 'walkin' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                  <User size={14} className="inline mr-1" />Walk-in</button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map((p: any) => (
                    <button key={p.id} onClick={() => selectPatient(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left border border-slate-100">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><User size={15} className="text-primary" /></div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{p.full_name}</p><p className="text-xs text-slate-400">{p.hospital_number} &middot; {p.sex}</p></div>
                      <span className="text-xs text-slate-400">{p.status?.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
              {mode === 'walkin' && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Customer Name *</label>
                      <input type="text" placeholder="Walk-in customer" value={walkinName} onChange={(e) => setWalkinName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                    <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                      <input type="text" placeholder="Phone" value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  </div>
                  {/* Service Catalog */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Service Catalog</h4>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {SERVICE_CATALOG.map((group) => (
                        <div key={group.category}>
                          <p className="text-xs font-semibold text-slate-600 mb-1.5">{group.category}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {group.items.map((svc) => (
                              <button key={svc.name} onClick={() => addToCart({ service_type: 'walkin_service', service_id: null, description: svc.name, quantity: 1, unit_price: svc.price })}
                                className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${cart.find((c) => c.description === svc.name) ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-primary'}`}>
                                <p className="truncate">{svc.name}</p>
                                <p className="font-bold mt-0.5">₦{svc.price.toLocaleString()}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-400 mb-2">Or add a custom item:</p>
                      <div className="flex items-center gap-2">
                        <input type="text" placeholder="Item name..." value={customItemName}
                          onChange={(e) => setCustomItemName(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <input type="number" placeholder="Price" value={customItemPrice}
                          onChange={(e) => setCustomItemPrice(e.target.value)}
                          className="w-28 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <button onClick={() => { if (customItemName && parseFloat(customItemPrice) > 0) { addToCart({ service_type: 'walkin_service', service_id: null, description: customItemName, quantity: 1, unit_price: parseFloat(customItemPrice) }); setCustomItemName(''); setCustomItemPrice('') } }}
                          className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors flex-shrink-0"><Plus size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : pendingItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Unpaid Services</h3>
                <div className="space-y-2">
                  {pendingItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{item.description}</p>
                        <p className="text-xs text-slate-400 capitalize">{item.service_type.replace('_', ' ')}</p>
                      </div>
                      {cart.find((c) => c.service_id === item.service_id && c.service_type === item.service_type) ? (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Added</span>
                      ) : (
                        <button onClick={() => addToCart(item)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"><Plus size={12} /> Add</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cart.length === 0 && pendingItems.length === 0 && mode === 'patient' && selectedPatient && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400">
                <CheckCircle size={40} className="mx-auto mb-3 text-emerald-300" />
                <p className="text-sm font-medium">All services are paid</p>
                <p className="text-xs mt-1">No pending payments for this patient.</p>
              </div>
            )}
          </div>

          {/* Right: Cart & Checkout */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment Cart</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">{mode === 'walkin' ? 'Select items from the service catalog below.' : 'Cart is empty. Add items from unpaid services.'}</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cart.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-medium text-slate-700 flex-1 truncate">{item.description}</p>
                        <button onClick={() => removeFromCart(i)} className="p-0.5 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex-shrink-0"><Trash2 size={12} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><label className="text-[10px] text-slate-400">Price</label>
                          <input type="number" min={0} step={50} placeholder="0.00" value={item.unit_price || ''}
                            onChange={(e) => updatePrice(i, parseFloat(e.target.value) || 0)}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
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
                  <p className="text-lg font-bold text-slate-800 text-right">₦{total.toLocaleString()}</p>
                  <div><label className="block text-xs font-medium text-slate-500 mb-2">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map((m) => {
                        const Icon = m.icon
                        return (
                          <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${paymentMethod === m.value ? m.color + ' ring-2 ring-primary/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                            <Icon size={14} /> {m.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                    <textarea rows={2} placeholder="Optional..." value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                  <button onClick={handlePayment} disabled={submitting || total <= 0}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
                    {submitting ? 'Processing...' : `Complete Payment — ₦${total.toLocaleString()}`}
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FileText size={16} className="text-primary" /> Payment Orders</h3>
              <div className="relative w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search by receipt, patient, staff..." value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            {selectedPatient && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <User size={15} className="text-primary" />
                <span className="text-sm font-medium text-slate-700">{selectedPatient.full_name}</span>
                <span className="text-xs text-slate-400">{selectedPatient.hospital_number}</span>
                <button onClick={() => { setSelectedPatient(null); setSearch(''); setPayments([]) }}
                  className="ml-auto text-xs text-slate-400 hover:text-rose-500"><X size={14} /></button>
              </div>
            )}
            {paymentsLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : filteredOrders.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                {selectedPatient ? 'No payments for this patient' : 'Search and select a patient first, or go to Finance Dashboard for all payments'}
              </p>
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
                    {filteredOrders.map((p: any) => {
                      const Icon = methodIcon(p.payment_method)
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-mono text-primary">{p.receipt_number}</td>
                          <td className="px-4 py-3"><p className="text-sm font-medium text-slate-800">{p.patient_name || p.walkin_name || 'Walk-in'}</p>{p.hospital_number && <p className="text-xs text-slate-400">{p.hospital_number}</p>}</td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-800">₦{parseFloat(p.total_amount).toLocaleString()}</td>
                          <td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"><Icon size={10} />{p.payment_method?.toUpperCase()}</span></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{p.staff_name || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={async () => { try { const r = await api.get(`/payments/${p.id}`); setReceipt(r.data); setShowReceipt(true) } catch {} }}
                              className="text-xs text-primary font-medium hover:underline">Receipt</button>
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
