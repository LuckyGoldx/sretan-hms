import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import InsuranceReceiptSplit from './InsuranceReceiptSplit'
import { printPaymentReceipt } from '../utils/print'
import { fetchActiveInsuranceCase, fetchCoverageQuote, billToInsuranceAndCollect, insurancePaymentLabel } from '../utils/insuranceBilling'
import {
  ShoppingCart, Search, Loader2, Plus, X, CheckCircle, Trash2, Banknote, CreditCard, Landmark, Smartphone, Pill, FlaskConical, Scan, Building2, Printer, User, Phone, Users,
} from 'lucide-react'

const CATEGORY_META: Record<string, { label: string; icon: any }> = {
  pharmacy: { label: 'Pharmacy', icon: Pill },
  lab: { label: 'Laboratory', icon: FlaskConical },
  radiology: { label: 'Radiology', icon: Scan },
  general: { label: 'Services', icon: Building2 },
}

export default function PaypointDashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [cart, setCart] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [catalog, setCatalog] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [mode, setMode] = useState<'search' | 'walkin'>('walkin')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [insuranceInfo, setInsuranceInfo] = useState<any>(null)
  const [insuranceInWindow, setInsuranceInWindow] = useState(true)
  const [insuranceLoading, setInsuranceLoading] = useState(false)
  const [billToInsurance, setBillToInsurance] = useState(false)
  const [coverageQuote, setCoverageQuote] = useState<any>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    async function load() {
      try {
        const [pharm, lb, rad, gen] = await Promise.all([
          api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
          api.get('/inventory?category=lab').catch(() => ({ data: [] })),
          api.get('/inventory?category=radiology').catch(() => ({ data: [] })),
          api.get('/inventory?category=general').catch(() => ({ data: [] })),
        ])
        var result: any[] = []
        var groups = [{ cat: 'pharmacy', items: pharm.data || [] }, { cat: 'lab', items: lb.data || [] }, { cat: 'radiology', items: rad.data || [] }, { cat: 'general', items: gen.data || [] }]
        const mapItem = (i: any) => ({
          name: i.drug_name,
          price: i.price,
          service_id: i.id,
          unlocks_maternity: !!i.unlocks_maternity,
          gender_restriction: i.gender_restriction || null,
          service_type: (i.service_key === 'FOLDER_ACTIVATION' || /folder activation/i.test(i.drug_name || '')) ? 'folder_activation' : undefined,
        })
        for (const g of groups) {
          var inv = g.items.filter((i: any) => i.is_active !== false && i.price > 0)
          if (inv.length === 0) continue
          if (g.cat === 'general') {
            var sub: Record<string, any[]> = {}
            for (const i of inv) { var st = i.amount_type || 'service'; if (!sub[st]) sub[st] = []; sub[st].push(i) }
            for (const [k, v] of Object.entries(sub)) result.push({ category: k.charAt(0).toUpperCase() + k.slice(1), items: v.map(mapItem) })
          } else {
            result.push({ category: CATEGORY_META[g.cat].label, items: inv.map(mapItem) })
          }
        }
        setCatalog(result)
      } catch {} finally { setLoaded(true) }
    }
    load()
  }, [])

  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return }
    var t = setTimeout(async () => {
      try { var r = await api.get(`/patients/search?q=${encodeURIComponent(patientSearch)}`); setPatientResults(r.data || []) } catch {} }, 300)
    return () => clearTimeout(t)
  }, [patientSearch])

  // Arriving from a discharge ("Settle at Paypoint") — preselect the patient.
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('patient_id')
    if (!pid) return
    let alive = true
    setMode('search')
    api.get(`/patients/${pid}`).then((r) => {
      if (!alive) return
      setSelectedPatient(r.data)
      setPatientSearch(r.data?.full_name || '')
      fetchInsurance(pid)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Insurer/patient split for the current cart, shown before billing so the
  // patient knows their co-pay upfront.
  useEffect(() => {
    if (!billToInsurance || !insuranceInfo || !selectedPatient || cart.length === 0) { setCoverageQuote(null); setQuoteLoading(false); return }
    let cancelled = false
    setQuoteLoading(true)
    fetchCoverageQuote(
      selectedPatient.id,
      cart.map((c: any) => ({ service_type: c.service_type, service_id: c.service_id, coverage_item_id: c.coverage_item_id || null, description: c.description, quantity: c.quantity, unit_price: c.unit_price }))
    )
      .then((q) => { if (!cancelled) setCoverageQuote(q) })
      .catch(() => { if (!cancelled) setCoverageQuote(null) })
      .finally(() => { if (!cancelled) setQuoteLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billToInsurance, insuranceInfo?.id, selectedPatient?.id, cart])

  async function fetchInsurance(patientId: string) {
    setInsuranceLoading(true)
    try {
      const info = await fetchActiveInsuranceCase(patientId)
      setInsuranceInfo(info.case)
      setInsuranceInWindow(info.inWindow)
      if (!info.hasActiveCase) setBillToInsurance(false)
    } catch { setInsuranceInfo(null); setInsuranceInWindow(true); setBillToInsurance(false) } finally { setInsuranceLoading(false) }
  }

  function addToCart(item: any) {
    setCart((prev) => {
      var existing = prev.find((c) => c.description === item.name)
      if (existing) return prev.map((c) => c.description === item.name ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { description: item.name, quantity: 1, unit_price: item.price, service_id: item.service_id || null, gender_restriction: item.gender_restriction || null, service_type: item.service_type || 'billing' }]
    })
  }
  const cartHasFolderActivation = cart.some((c) => c.service_type === 'folder_activation')
  const folderItem = catalog.flatMap((g: any) => g.items).find((i: any) => i.service_type === 'folder_activation')
  // Sex-specific services (Antenatal booking is female-only) require a selected
  // female patient, and maternity booking requires an activated folder. The
  // server enforces this too; disable in the UI to avoid a rejected sale.
  function itemEligible(item: any) {
    if (!item?.gender_restriction) return true
    if (!selectedPatient?.sex) return false
    if (item.gender_restriction !== selectedPatient.sex) return false
    if (item.unlocks_maternity && selectedPatient.folder_activated === false && !cartHasFolderActivation) return false
    return true
  }
  function removeFromCart(i: number) { setCart((p) => p.filter((_, idx) => idx !== i)) }
  function updateQty(i: number, q: number) { setCart((p) => p.map((c, idx) => idx === i ? { ...c, quantity: Math.max(1, q) } : c)) }
  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
  // Insurance with no co-pay collects nothing, so the method selector is hidden
  // and not required; a co-pay does require a method.
  const insuranceCoPay = billToInsurance ? Number(coverageQuote?.patient?.co_pay || 0) : 0
  const methodRequired = !billToInsurance || insuranceCoPay > 0

  async function handlePayment() {
    if (cart.length === 0) return
    if (methodRequired && !paymentMethod) { alert('Select a payment method before billing.'); return }
    if (mode === 'walkin' && !customerName.trim()) { alert('Customer name is required for walk-in sales.'); return }
    setSubmitting(true)
    try {
      if (billToInsurance && insuranceInfo && selectedPatient) {
        const items = cart.map((c) => ({ service_type: c.service_type || 'walkin_service', service_id: c.service_id || null, description: c.description, quantity: c.quantity, unit_price: c.unit_price }))
        const result = await billToInsuranceAndCollect({
          patientId: selectedPatient.id,
          caseId: insuranceInfo.id,
          caseNumber: insuranceInfo.case_number,
          providerName: insuranceInfo.provider_name,
          items,
          quote: coverageQuote,
          paymentMethod,
          createdBy: currentUser?.id,
        })
        setReceipt({
          receipt_number: result.co_pay_receipt_number || result.receipt_number,
          patient_name: selectedPatient.full_name,
          hospital_number: selectedPatient.hospital_number || null,
          total_amount: result.insurer_total + result.patient_total,
          insurance_amount: result.insurer_total,
          patient_amount: result.patient_total,
          provider_name: insuranceInfo.provider_name || result.provider_name,
          case_number: result.case_number || insuranceInfo.case_number || null,
          items: result.items.map((i) => ({
            description: i.description,
            total_price: i.line_total,
            insurance_amount: i.insurer_amount,
            patient_amount: i.patient_amount,
          })),
          payment_method: methodRequired ? paymentMethod : '',
          payment_label: insurancePaymentLabel(result.insurer_total, result.patient_total, methodRequired ? paymentMethod : ''),
          created_at: new Date().toISOString(),
        })
        setShowReceipt(true); setCart([]); setBillToInsurance(false); setInsuranceInfo(null); setCoverageQuote(null); setPaymentMethod('')
        setSelectedPatient(null); setPatientSearch('')
        return
      }
      var payload: any = {
        items: cart.map((c) => ({ service_type: c.service_type || 'walkin_service', service_id: c.service_id || null, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod, notes: null, created_by: currentUser?.id,
      }
      if (selectedPatient) {
        payload.patient_id = selectedPatient.id
      } else {
        payload.walkin_name = customerName.trim() || 'OTC Customer'
        payload.walkin_phone = customerPhone.trim() || null
      }
      const res = await api.post('/payments', payload)
      setReceipt(res.data); setShowReceipt(true); setCart([]); setPaymentMethod('')
      setSelectedPatient(null); setPatientSearch(''); setCustomerName(''); setCustomerPhone('')
    } catch (err: any) { alert(err.response?.data?.message || 'Payment failed') } finally { setSubmitting(false) }
  }

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'transfer', label: 'Transfer', icon: Landmark, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'pos', label: 'POS', icon: Smartphone, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ]

  const filteredCatalog = catalog.map((g) => ({ ...g, items: g.items.filter((i: any) => (i.name || '').toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.items.length > 0)

  function CartContent() {
    return cart.length === 0 ? (
      <p className="text-sm text-slate-400 text-center py-10">Cart is empty</p>
    ) : (
      <div className="divide-y divide-slate-50">
        {cart.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
              <div className="flex items-center gap-2 mt-1 text-xs">
                <span className="font-medium text-emerald-700">₦{item.unit_price.toLocaleString()}</span>
                <span className="text-slate-400">×</span>
                <input type="number" min={1} value={item.quantity} onChange={(e) => updateQty(i, parseInt(e.target.value) || 1)}
                  className="w-12 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center focus:ring-2 focus:ring-primary outline-none" />
                <span className="font-medium text-slate-800">= ₦{(item.unit_price * item.quantity).toLocaleString()}</span>
              </div>
            </div>
            <button onClick={() => removeFromCart(i)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500"><X size={14} /></button>
          </div>
        ))}
      </div>
    )
  }

  // Co-pay/insurer split for the current cart, shown before the cashier bills
  // so the patient knows their out-of-pocket amount upfront.
  function renderInsuranceSummary() {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 space-y-1.5">
        {quoteLoading ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700"><Loader2 size={14} className="animate-spin" /> Calculating co-pay...</div>
        ) : coverageQuote ? (
          <>
            {(coverageQuote.items || []).map((q: any, i: number) => (
              <div key={i} className="flex justify-between text-[11px] text-slate-500">
                <span className="truncate pr-2">{q.description}</span>
                <span className="text-amber-600 font-medium whitespace-nowrap">₦{Number(q.patient_amount || 0).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1.5 border-t border-emerald-100">
              <span className="text-slate-500">Patient pays{paymentMethod ? ` (${paymentMethod})` : ''}</span>
              <span className="font-bold text-amber-600">₦{Number(coverageQuote.patient?.co_pay || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Insurer billed ({coverageQuote.provider_name || insuranceInfo?.provider_name || 'HMO'})</span>
              <span className="font-bold text-emerald-600">₦{Number(coverageQuote.insurer?.covered || 0).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-amber-600">Unable to load coverage. Please retry or bill without insurance.</p>
        )}
      </div>
    )
  }

  function CartFooter() {
    return (
      <div className="space-y-3">
        {selectedPatient && (
          insuranceLoading ? (
            <div className="flex items-center justify-center gap-2 py-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Checking insurance...</div>
          ) : insuranceInfo && !insuranceInWindow ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              Coverage for {insuranceInfo.provider_name} is expired or outside its window — the insurer cannot be billed.
            </div>
          ) : insuranceInfo ? (
            <button onClick={() => setBillToInsurance(!billToInsurance)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                billToInsurance ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}>
              <Building2 size={14} />
              {billToInsurance ? `Billing to ${insuranceInfo.provider_name}` : `Bill to Insurance (${insuranceInfo.provider_name})`}
            </button>
          ) : null
        )}
        {billToInsurance && renderInsuranceSummary()}
        {billToInsurance && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <span className="font-semibold text-emerald-700 flex items-center gap-2"><Building2 size={14} /> Insurance</span>
            <span className="font-bold text-emerald-700 truncate">{insuranceInfo?.provider_name}</span>
          </div>
        )}
        {methodRequired && (
          <div>
            <p className="text-[10px] font-medium text-slate-400 mb-1.5">{billToInsurance ? 'Co-pay payment method' : 'Payment method'}</p>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => {
                const Icon = m.icon
                return (
                  <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${paymentMethod === m.value ? m.color + ' ring-2 ring-primary/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <Icon size={14} />{m.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{cart.reduce((s, c) => s + c.quantity, 0)} units</span>
          <span className="text-lg font-bold text-slate-800">₦{total.toLocaleString()}</span>
        </div>
        <button onClick={handlePayment} disabled={submitting || cart.length === 0 || (methodRequired && !paymentMethod) || (billToInsurance && quoteLoading)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {submitting ? 'Processing...' : (billToInsurance ? (insuranceCoPay > 0 ? `Collect ₦${insuranceCoPay.toLocaleString()} + Bill Insurance` : 'Bill to Insurance') : `Pay ₦${total.toLocaleString()}`)}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><ShoppingCart size={22} className="text-emerald-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
            <p className="text-sm text-slate-500">Sales for registered patients or walk-in customers</p>
          </div>
        </div>
      </div>

      {/* Mode toggle + Patient section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => { setMode('search'); setSelectedPatient(null); setPatientSearch(''); setPatientResults([]); setInsuranceInfo(null); setBillToInsurance(false); setPaymentMethod(''); setCoverageQuote(null) }}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${mode === 'search' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            <Users size={14} className="inline mr-1" />Registered Patient</button>
          <button onClick={() => { setMode('walkin'); setSelectedPatient(null); setCustomerName(''); setCustomerPhone(''); setInsuranceInfo(null); setBillToInsurance(false); setPaymentMethod(''); setCoverageQuote(null) }}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${mode === 'walkin' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            <User size={14} className="inline mr-1" />Walk-in Customer</button>
        </div>

        {mode === 'search' ? (
          <div>
            {!selectedPatient ? (
              <div className="relative">
                <input type="text" placeholder="Search patient by name, hospital #, or phone..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                {patientResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 max-h-48 overflow-y-auto">
                    {patientResults.map((p: any) => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(p.full_name); setPatientResults([]); setBillToInsurance(false); setPaymentMethod(''); fetchInsurance(p.id) }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><User size={15} className="text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
                            {p.primary_provider && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-semibold text-emerald-700 whitespace-nowrap">
                                <Building2 size={9} /> {p.primary_provider}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{p.hospital_number} {p.phone ? `· ${p.phone}` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><User size={18} className="text-primary" /></div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{selectedPatient.full_name}</p>
                      {selectedPatient.primary_provider && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-semibold text-emerald-700 whitespace-nowrap">
                          <Building2 size={9} /> {selectedPatient.primary_provider}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{selectedPatient.hospital_number} {selectedPatient.phone ? `· ${selectedPatient.phone}` : ''}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); setInsuranceInfo(null); setBillToInsurance(false); setPaymentMethod(''); setCoverageQuote(null) }} className="text-xs text-rose-500 font-medium hover:text-rose-600">Change</button>
              </div>
            )}
            {selectedPatient?.folder_activated === false && (
              <div className="mt-3 pt-3 border-t border-amber-100 flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium text-amber-700">Folder not activated — add the Folder Activation fee to bill antenatal / book a pregnancy.</p>
                {cartHasFolderActivation
                  ? <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">Folder fee added</span>
                  : folderItem && (
                    <button onClick={() => addToCart(folderItem)} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-medium whitespace-nowrap hover:bg-amber-700">Bill and Activate folder first</button>
                  )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
              <User size={18} className="text-primary flex-shrink-0" />
              <input type="text" placeholder="Customer name * (required)" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="flex-1 text-sm outline-none bg-transparent" />
            </div>
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
              <Phone size={18} className="text-primary flex-shrink-0" />
              <input type="text" placeholder="Phone number (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                className="flex-1 text-sm outline-none bg-transparent" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Inventory browser */}
        <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-140px)]">
          <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-50">
            {!loaded ? <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
            : filteredCatalog.length === 0 ? <div className="flex flex-col items-center py-16 text-slate-400"><ShoppingCart size={36} className="text-slate-300 mb-2" /><p className="text-sm">No items found</p></div>
            : filteredCatalog.map((group) => (
              <div key={group.category}>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{group.category}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-3">
                  {group.items.map((item: any) => {
                    const eligible = itemEligible(item)
                    const needsFolder = item.unlocks_maternity && selectedPatient?.folder_activated === false && !cartHasFolderActivation
                    return (
                      <button key={item.name} onClick={() => eligible && addToCart(item)} disabled={!eligible}
                        title={!eligible ? (needsFolder ? 'Bill and Activate folder first' : `Select a ${item.gender_restriction?.toLowerCase()} patient to bill this item`) : undefined}
                        className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${!eligible ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : cart.find((c) => c.description === item.name) ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-primary'}`}>
                        <p className="truncate">{item.name}</p>
                        <p className="font-bold mt-0.5">₦{item.price.toLocaleString()}</p>
                        {!eligible && <p className="text-[9px] font-medium mt-0.5">{needsFolder ? 'Bill and Activate folder first' : `${item.gender_restriction} only`}</p>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart — desktop */}
        <div className="hidden lg:flex lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex-col max-h-[500px]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-slate-800"><ShoppingCart size={16} className="inline mr-2" />Cart ({cart.length})</h2>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-rose-500"><Trash2 size={12} className="inline mr-1" />Clear</button>}
          </div>
          <div className="overflow-y-auto flex-1 min-h-0"><CartContent /></div>
          {cart.length > 0 && <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0"><CartFooter /></div>}
        </div>
      </div>

      {/* Mobile cart button */}
      {cart.length > 0 && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 z-40 lg:hidden w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">{cart.length}</span>
        </button>
      )}

      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setShowCart(false)}>
          <div className="fixed inset-0 bg-black/30" />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl border border-slate-100 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-semibold"><ShoppingCart size={16} className="inline mr-2" />Cart ({cart.length})</h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-rose-500"><Trash2 size={12} className="inline mr-1" />Clear</button>}
                <button onClick={() => setShowCart(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0"><CartContent /></div>
            {cart.length > 0 && <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0" onClick={(e) => e.stopPropagation()}><CartFooter /></div>}
          </div>
        </div>
      )}

      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center border-b flex-shrink-0"><div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto mb-3"><CheckCircle size={28} className="text-emerald-600" /></div>
              <h2 className="text-lg font-semibold">Payment Successful</h2><p className="text-xs text-slate-400">#{receipt.receipt_number}</p></div>
            <div className="p-6 space-y-2 overflow-y-auto flex-1">
              <p className="text-sm font-semibold text-center">{receipt.patient_name || receipt.walkin_name || 'OTC Customer'}</p>
              {(receipt.items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm"><span>{item.description}</span><span className="font-medium">₦{(item.total_price || 0).toLocaleString()}</span></div>
              ))}
              {receipt.insurance_amount != null || receipt.insurance_provider_name ? (
                <div className="pt-2"><InsuranceReceiptSplit receipt={receipt} /></div>
              ) : (
                <div className="flex justify-between font-bold pt-3 border-t"><span>Total</span><span>₦{(receipt.total_amount || 0).toLocaleString()}</span></div>
              )}
              <div className="flex justify-between text-xs text-slate-400 pt-2"><span>{(receipt.payment_label || receipt.payment_method || '').toUpperCase()}</span><span>{new Date(receipt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => printPaymentReceipt(receipt)} className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium"><Printer size={14} /> Print</button>
              <button onClick={() => setShowReceipt(false)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
