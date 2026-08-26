import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../hooks/useAxios'
import {
  ShoppingCart, Search, Loader2, Plus, X, CheckCircle, Trash2, Package, User, CreditCard, Building2, Wallet, Minus, ArrowLeft, Printer, AlertTriangle, Clock, FileDown, Undo2, Percent, Eye, Users, Shield,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { buildReceiptHtml, generateReceiptNumber, openPrint, receiptDate, receiptTime } from '../utils/print'

const PAGE_SIZE = 30
const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
const currentStaffName: string = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).name || '' } catch {} return '' })()

interface CartItem {
  drug_name: string
  quantity: number
  unit_price: number
  stock_count: number
}

interface Sale {
  id: string
  drug_name: string
  quantity: number
  unit_price: number
  total_amount: number
  customer_name?: string
  payment_method: string
  notes?: string
  sold_by_name?: string
  sold_at: string
}

interface Receipt {
  items: CartItem[]
  customer: string
  payment: string
  total: number
  discount: number
  date: string
}

function isSameDay(iso: string): boolean {
  var d = new Date(iso)
  var now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isExpiringSoon(iso?: string): boolean {
  if (!iso) return false
  var expiry = new Date(iso)
  var now = new Date()
  var threshold = new Date(); threshold.setDate(threshold.getDate() + 30)
  return expiry >= now && expiry <= threshold
}

export default function WalkInSales() {
  const navigate = useNavigate()
  const [inventory, setInventory] = useState<any[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [drugSearch, setDrugSearch] = useState('')
  const [discountState, setDiscountState] = useState(0)
  const [showDiscount, setShowDiscount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [salesTab, setSalesTab] = useState<'today' | 'history'>('today')
  const [salesSearch, setSalesSearch] = useState('')
  const [salesPage, setSalesPage] = useState(0)
  const [viewSale, setViewSale] = useState<Sale | null>(null)
  const [showCartModal, setShowCartModal] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [printNotice, setPrintNotice] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [insuranceInfo, setInsuranceInfo] = useState<any>(null)
  const [insuranceLoading, setInsuranceLoading] = useState(false)
  const [billToInsurance, setBillToInsurance] = useState(false)
  const printWinRef = useRef<Window | null>(null)

  function closeReceipt() {
    if (printWinRef.current) { try { printWinRef.current.close() } catch {} }
    printWinRef.current = null
    setPrintNotice('')
    setReceipt(null)
  }

  const reloadData = useCallback(async () => {
    try {
      const [invRes, salesRes] = await Promise.all([
        api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
        api.get('/otc-sales').catch(() => ({ data: [] })),
      ])
      setInventory(invRes.data || [])
      setSales(salesRes.data || [])
    } catch {}
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        await reloadData()
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [reloadData])

  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return }
    var t = setTimeout(async () => {
      try { var r = await api.get(`/patients/search?q=${encodeURIComponent(patientSearch)}`); setPatientResults(r.data || []) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [patientSearch])

  async function fetchInsurance(patientId: string) {
    setInsuranceLoading(true)
    try {
      const res = await api.get(`/insurance/active-case/${patientId}`)
      setInsuranceInfo(res.data?.hasActiveCase ? res.data.case : null)
      if (!res.data?.hasActiveCase) setBillToInsurance(false)
    } catch { setInsuranceInfo(null); setBillToInsurance(false) } finally { setInsuranceLoading(false) }
  }

  const filteredDrugs = inventory.filter((i: any) =>
    i.drug_name.toLowerCase().includes(drugSearch.toLowerCase())
  )
  const lowStockItems = inventory.filter((i: any) => i.stock_count <= i.reorder_level)
  const expiringItems = inventory.filter((i: any) => isExpiringSoon(i.expiry_date))

  const todaySales = sales.filter((s) => isSameDay(s.sold_at))
  const tabSales = salesTab === 'today' ? todaySales : sales

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const discountApplied = showDiscount ? Math.min(Math.max(discountState || 0, 0), cartSubtotal) : 0
  const cartTotal = cartSubtotal - discountApplied
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const filteredSales = tabSales.filter((s) => {
    if (!salesSearch) return true
    var q = salesSearch.toLowerCase()
    return (s.drug_name || '').toLowerCase().includes(q) || (s.customer_name || '').toLowerCase().includes(q)
  })
  const totalSalesPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE))
  const safeSalesPage = Math.min(salesPage, totalSalesPages - 1)
  const pagedSales = filteredSales.slice(safeSalesPage * PAGE_SIZE, (safeSalesPage + 1) * PAGE_SIZE)

  function addToCart(drug: any) {
    setCart((prev) => {
      const existing = prev.find((c) => c.drug_name === drug.drug_name)
      if (existing) {
        if (existing.quantity >= drug.stock_count) return prev
        return prev.map((c) => c.drug_name === drug.drug_name ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { drug_name: drug.drug_name, quantity: 1, unit_price: parseFloat(drug.price) || 0, stock_count: drug.stock_count }]
    })
  }

  function updateQty(name: string, delta: number) {
    setCart((prev) => prev.map((c) => {
      if (c.drug_name !== name) return c
      const newQty = c.quantity + delta
      if (newQty <= 0) return null as any
      if (newQty > c.stock_count) return c
      return { ...c, quantity: newQty }
    }).filter(Boolean) as CartItem[])
  }

  function removeFromCart(name: string) {
    setCart((prev) => prev.filter((c) => c.drug_name !== name))
  }

  function updatePrice(name: string, price: number) {
    setCart((prev) => prev.map((c) => c.drug_name === name ? { ...c, unit_price: price } : c))
  }

  function clearCart() { setCart([]); setCustomerName(''); setPaymentMethod('cash'); setError(''); setDiscountState(0); setShowDiscount(false); setSelectedPatient(null); setPatientSearch(''); setPatientResults([]); setInsuranceInfo(null); setBillToInsurance(false) }

  async function handleCheckout() {
    if (cart.length === 0) { setError('Cart is empty'); return }
    setSubmitting(true); setError('')
    const soldItems = [...cart]
    const receiptCustomer = selectedPatient ? selectedPatient.full_name : customerName.trim()
    const receiptPayment = billToInsurance ? `Insurance: ${insuranceInfo?.provider_name || ''}` : paymentMethod
    const factor = cartSubtotal > 0 ? cartTotal / cartSubtotal : 1
    try {
      if (billToInsurance && insuranceInfo && selectedPatient) {
        const items = cart.map((i) => ({ service_type: 'pharmacy', service_id: null, description: i.drug_name, quantity: i.quantity, unit_price: i.unit_price }))
        await api.post('/insurance/bill-to-insurance', {
          patientId: selectedPatient.id,
          caseId: insuranceInfo.id,
          items,
          source: 'paypoint',
          created_by: currentUserId,
        })
        setReceipt({
          items: soldItems,
          customer: receiptCustomer || 'Walk-in Customer',
          payment: receiptPayment,
          total: cartTotal,
          discount: discountApplied,
          date: new Date().toISOString(),
        })
        setShowCartModal(false)
        clearCart()
        await reloadData()
      } else {
      for (const item of cart) {
        var lineTotal = item.unit_price * item.quantity
        var adjustedTotal = Math.round(lineTotal * factor * 100) / 100
        var adjustedUnit = item.quantity > 0 ? Math.round((adjustedTotal / item.quantity) * 100) / 100 : 0
        await api.post('/otc-sales', {
          drug_name: item.drug_name,
          quantity: item.quantity,
          unit_price: adjustedUnit,
          customer_name: receiptCustomer || null,
          payment_method: receiptPayment,
          notes: null,
          sold_by: currentUserId,
        })
      }
      setReceipt({ items: soldItems, customer: receiptCustomer, payment: receiptPayment, total: cartTotal, discount: discountApplied, date: new Date().toISOString() })
      setShowCartModal(false)
      clearCart()
      await reloadData()
      }
    } catch (err: any) { setError(err.response?.data?.message || 'Checkout failed') } finally { setSubmitting(false) }
  }

  function reAddSale(sale: Sale) {
    var inv = inventory.find((i: any) => i.drug_name === sale.drug_name)
    addToCart({ drug_name: sale.drug_name, price: Number(sale.unit_price), stock_count: inv ? inv.stock_count : 9999 })
  }

  function printThermal(sale: Sale) {
    if (printWinRef.current) { try { printWinRef.current.close() } catch {} }
    var unit = Number(sale.unit_price) || 0
    var total = Number(sale.total_amount) || 0
    var d = sale.sold_at ? new Date(sale.sold_at) : new Date()
    var receiptNo = 'MMH-' + String(sale.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()
    var html = buildReceiptHtml({
      receiptNumber: receiptNo,
      date: receiptDate(d),
      time: receiptTime(d),
      staff: sale.sold_by_name || currentStaffName,
      customer: sale.customer_name || 'Walk-in Customer',
      paymentMethod: sale.payment_method ? sale.payment_method.toUpperCase() : '',
      lines: [{ item: sale.drug_name, quantity: sale.quantity, price: unit, total }],
      total,
      notes: sale.notes || '',
    })
    var win = openPrint(html, 300, 520)
    if (!win) { setPrintNotice('Print window was blocked — please allow pop-ups for this site, then try again.'); return }
    printWinRef.current = win
    setPrintNotice('')
  }

  function exportCSV() {
    if (filteredSales.length === 0) return
    var header = ['Drug', 'Quantity', 'Unit Price', 'Total', 'Customer', 'Payment', 'Sold By', 'Time']
    var rows = filteredSales.map((s: Sale) => [s.drug_name, s.quantity, s.unit_price, s.total_amount, s.customer_name || '', s.payment_method, s.sold_by_name || '', new Date(s.sold_at).toLocaleString()])
    var csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = `otc-sales-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function printReceipt() {
    if (!receipt) return
    if (printWinRef.current) { try { printWinRef.current.close() } catch {} }
    var d = new Date(receipt.date)
    var html = buildReceiptHtml({
      receiptNumber: generateReceiptNumber('MMH'),
      date: receiptDate(d),
      time: receiptTime(d),
      staff: currentStaffName,
      customer: receipt.customer || 'Walk-in Customer',
      paymentMethod: receipt.payment ? receipt.payment.toUpperCase() : '',
      lines: receipt.items.map((i) => ({
        item: i.drug_name,
        quantity: i.quantity,
        price: Number(i.unit_price),
        total: Number(i.unit_price) * i.quantity,
      })),
      discount: receipt.discount,
      total: receipt.total,
    })
    var win = openPrint(html, 300, 560)
    if (!win) { setPrintNotice('Print window was blocked — please allow pop-ups for this site, then try again.'); return }
    printWinRef.current = win
    setPrintNotice('')
  }

  const paymentIcons: Record<string, typeof Wallet> = { cash: Wallet, card: CreditCard, transfer: Building2 }

  function CartItemsList() {
    if (cart.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
        <ShoppingCart size={36} className="text-slate-300 mb-2" />
        <p className="text-sm">Cart is empty</p>
        <p className="text-xs mt-1">Add drugs from inventory or scan</p>
      </div>
    )
    return cart.map((item) => (
      <div key={item.drug_name} className="px-5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-800 truncate flex-1">{item.drug_name}</p>
          <button onClick={() => removeFromCart(item.drug_name)} className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-rose-500 transition-colors ml-2"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex items-center gap-1">
            <button onClick={() => updateQty(item.drug_name, -1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"><Minus size={12} /></button>
            <span className="w-8 text-center text-sm font-semibold text-slate-800">{item.quantity}</span>
            <button onClick={() => updateQty(item.drug_name, 1)} disabled={item.quantity >= item.stock_count}
              className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors disabled:opacity-30"><Plus size={12} /></button>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <input type="number" step="0.01" min={0} value={item.unit_price}
              onChange={(e) => updatePrice(item.drug_name, parseFloat(e.target.value) || 0)}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs text-right focus:ring-2 focus:ring-primary outline-none" />
          </div>
          <span className="text-sm font-bold text-slate-800 w-16 text-right">₦{(item.unit_price * item.quantity).toFixed(2)}</span>
        </div>
      </div>
    ))
  }

  function CartFooter() {
    return (
      <div className="border-t border-slate-100 p-4 space-y-3 flex-shrink-0">
        {!selectedPatient ? (
          <div className="relative">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-slate-400 flex-shrink-0" />
              <input type="text" placeholder="Search registered patient (name, # or phone)..." value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setPatientResults([]) }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
            </div>
            {patientResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-30 max-h-44 overflow-y-auto">
                {patientResults.map((p: any) => (
                  <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(''); setPatientResults([]); setBillToInsurance(false); fetchInsurance(p.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={12} className="text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-medium text-slate-800 truncate">{p.full_name}</p>
                        {p.primary_provider && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[8px] font-semibold text-emerald-700 whitespace-nowrap">
                            <Shield size={8} /> {p.primary_provider}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">{p.hospital_number} {p.phone ? `· ${p.phone}` : ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={12} className="text-primary" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-slate-800 truncate">{selectedPatient.full_name}</p>
                  {selectedPatient.primary_provider && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[8px] font-semibold text-emerald-700 whitespace-nowrap">
                      <Shield size={8} /> {selectedPatient.primary_provider}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">{selectedPatient.hospital_number}</p>
              </div>
            </div>
            <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); setInsuranceInfo(null); setBillToInsurance(false) }}
              className="text-[10px] text-rose-500 font-medium hover:text-rose-600 flex-shrink-0">Change</button>
          </div>
        )}
        {!selectedPatient && (
          <div className="flex items-center gap-2">
            <User size={14} className="text-slate-400" />
            <input type="text" placeholder="Walk-in customer name (optional)" value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </div>
        )}
        {selectedPatient && (
          insuranceLoading ? (
            <div className="flex items-center justify-center gap-2 py-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Checking insurance...</div>
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
        {billToInsurance ? (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <span className="font-semibold text-emerald-700 flex items-center gap-2"><Building2 size={14} /> Insurance</span>
            <span className="font-bold text-emerald-700 truncate">{insuranceInfo?.provider_name}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'transfer'] as const).map((m) => {
              const Icon = paymentIcons[m]
              return (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                    paymentMethod === m ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  <Icon size={16} /> {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              )
            })}
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={showDiscount}
            onChange={(e) => { setShowDiscount(e.target.checked); if (!e.target.checked) setDiscountState(0) }}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
          Apply discount
        </label>
        {showDiscount && (
          <div className="flex items-center gap-2">
            <Percent size={14} className="text-slate-400 flex-shrink-0" />
            <input type="number" min={0} step="0.01" placeholder="Discount (₦)" value={discountState > 0 ? discountState : ''}
              onChange={(e) => setDiscountState(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">{cart.length} item(s) &middot; {cartCount} units</p>
            {discountApplied > 0 && <p className="text-xs text-rose-500 mt-0.5">Discount −₦{discountApplied.toFixed(2)}</p>}
            {error && <p className="text-xs text-rose-600 mt-0.5">{error}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-xl font-bold text-slate-800">₦{cartTotal.toFixed(2)}</p>
          </div>
        </div>
        <button onClick={handleCheckout} disabled={submitting || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 hover:scale-[1.01] transition-all disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {submitting ? 'Processing...' : (billToInsurance ? `Bill ₦${cartTotal.toFixed(2)} to Insurance` : `Complete Sale — ₦${cartTotal.toFixed(2)}`)}
        </button>
      </div>
    )
  }

  function CartContentDesktop() {
    return (
      <>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={16} /> Cart ({cart.length})</h2>
          {cart.length > 0 && <button onClick={clearCart} className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1"><Trash2 size={12} /> Clear</button>}
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-50">{CartItemsList()}</div>
        {cart.length > 0 && CartFooter()}
      </>
    )
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><ShoppingCart size={22} className="text-emerald-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Walk-in Sales</h1>
            <p className="text-sm text-slate-500">OTC counter — sell to non-patients</p>
          </div>
        </div>
      </div>

      {printNotice && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" /> {printNotice}
        </div>
      )}

      {lowStockItems.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-500 text-white shadow-sm">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium flex-1">{lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} at or below reorder level.</p>
          <button onClick={() => navigate('/pharmacy-inventory')} className="text-sm font-semibold underline">Manage Stock</button>
        </div>
      )}
      {expiringItems.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-500 text-white shadow-sm">
          <Clock size={20} />
          <p className="text-sm font-medium flex-1">{expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring within 30 days — do not sell.</p>
          <button onClick={() => navigate('/pharmacy-expiry')} className="text-sm font-semibold underline">Review</button>
        </div>
      )}

      {/* Floating cart button — mobile only */}
      {cart.length > 0 && (
        <button onClick={() => setShowCartModal(true)}
          className="fixed bottom-6 right-6 z-40 lg:hidden w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
          <ShoppingCart size={24} />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">{cartCount}</span>
        </button>
      )}

      {/* Sales Panel — Cart + Inventory always visible */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-140px)]">
          <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Package size={16} /> Inventory</h2>
              <span className="text-xs text-slate-400">{filteredDrugs.length} items</span>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search drugs..." value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
            {filteredDrugs.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Package size={36} className="text-slate-300 mb-2" />
                <p className="text-sm">No drugs found</p>
              </div>
            ) : filteredDrugs.map((drug: any) => {
              var low = drug.stock_count <= drug.reorder_level
              var expiring = isExpiringSoon(drug.expiry_date)
              var canAdd = drug.stock_count > 0
              return (
                <div key={drug.id} role="button" tabIndex={0}
                  onClick={() => canAdd && addToCart(drug)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) addToCart(drug) }}
                  title={canAdd ? 'Click to add to cart' : 'Out of stock'}
                  className={`px-5 py-3.5 flex items-center justify-between transition-colors ${canAdd ? 'cursor-pointer hover:bg-emerald-50/50 active:bg-emerald-50' : 'cursor-not-allowed opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{drug.drug_name}</p>
                    <p className="text-xs text-slate-400">Stock: {drug.stock_count} &middot; Batch: {drug.batch_number || '—'}</p>
                    {(low || expiring) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {low && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-semibold">LOW STOCK</span>}
                        {expiring && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-semibold">EXPIRING SOON</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${
                      low ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>{drug.stock_count} left</span>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${canAdd ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300'}`}>
                      <Plus size={16} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cart — Desktop: side panel, hidden on mobile */}
        <div className="hidden lg:flex lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex-col max-h-[calc(100vh-140px)]">
          {CartContentDesktop()}
        </div>
      </div>

      {/* Cart Modal — Mobile/Tablet */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setShowCartModal(false)}>
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCartModal(false)} />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl border border-slate-100 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={16} /> Cart ({cart.length})</h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1"><Trash2 size={12} /> Clear</button>
                )}
                <button onClick={() => setShowCartModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
              </div>
            </div>
          <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-50">
              {CartItemsList()}
            </div>
            {cart.length > 0 && CartFooter()}
          </div>
        </div>
      )}

      {/* Sales History — Today / History tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4 border-b border-slate-100">
          <button onClick={() => { setSalesTab('today'); setSalesSearch(''); setSalesPage(0) }}
            className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${salesTab === 'today' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Sales Today <span className="ml-1 text-xs font-medium text-slate-400">{todaySales.length}</span>
          </button>
          <button onClick={() => { setSalesTab('history'); setSalesSearch(''); setSalesPage(0) }}
            className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${salesTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Sales History <span className="ml-1 text-xs font-medium text-slate-400">{sales.length}</span>
          </button>
        </div>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={16} /> {salesTab === 'today' ? 'Sales Today' : 'Sales History'}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search drug or customer..." value={salesSearch}
                onChange={(e) => { setSalesSearch(e.target.value); setSalesPage(0) }}
                className="rounded-xl border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none w-48" />
            </div>
            <button onClick={exportCSV} disabled={filteredSales.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <FileDown size={13} /> Export CSV
            </button>
          </div>
        </div>
        {tabSales.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <ShoppingCart size={36} className="text-slate-300 mb-2" />
            <p className="text-sm">{salesTab === 'today' ? 'No sales today' : 'No sales recorded yet'}</p>
            <span className="mt-2 text-xs text-slate-400">Add items from the inventory above</span>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm font-medium">No sales match "{salesSearch}"</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Drug</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Qty</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Unit Price</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Total</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Payment</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Sold By</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Time</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pagedSales.map((s: Sale) => {
                    const PayIcon = paymentIcons[s.payment_method] || Wallet
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{s.drug_name}</td>
                        <td className="px-5 py-3">{s.quantity}</td>
                        <td className="px-5 py-3 text-slate-600">₦{Number(s.unit_price).toFixed(2)}</td>
                        <td className="px-5 py-3 font-semibold text-slate-800">₦{Number(s.total_amount).toFixed(2)}</td>
                        <td className="px-5 py-3 text-slate-600">{s.customer_name || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-1 text-xs text-slate-600"><PayIcon size={12} /> {s.payment_method}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">{s.sold_by_name || '—'}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">{new Date(s.sold_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => reAddSale(s)} title="Sell same again"
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors">
                              <Undo2 size={14} />
                            </button>
                            <button onClick={() => setViewSale(s)} title="View sale details"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                              <Eye size={13} /> View
                            </button>
                            <button onClick={() => printThermal(s)} title="Print receipt (thermal printer)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                              <Printer size={13} /> Print
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs text-slate-400 whitespace-nowrap">Showing {pagedSales.length} of {filteredSales.length} sale(s) · ₦{filteredSales.reduce((s, x) => s + Number(x.total_amount), 0).toFixed(2)} total</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => setSalesPage(Math.max(0, safeSalesPage - 1))} disabled={safeSalesPage === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
                  Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Page {safeSalesPage + 1} <span className="text-slate-400 font-medium">/ {totalSalesPages}</span>
                </span>
                <button onClick={() => setSalesPage(Math.min(totalSalesPages - 1, safeSalesPage + 1))} disabled={safeSalesPage >= totalSalesPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeReceipt}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-600 text-white text-center px-6 py-6 rounded-t-2xl flex-shrink-0">
              <CheckCircle size={40} className="mx-auto mb-2" />
              <h2 className="text-lg font-bold">Sale Complete</h2>
              <p className="text-sm text-emerald-100">Receipt generated</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
              <div className="flex items-center justify-between text-sm text-slate-500 pb-3 border-b border-slate-100">
                <span>{new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {receipt.customer && <span className="font-medium text-slate-700">Customer: {receipt.customer}</span>}
              </div>
              <div className="divide-y divide-slate-50">
                {receipt.items.map((item) => (
                  <div key={item.drug_name} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate">{item.drug_name}</p>
                      <p className="text-xs text-slate-400">{item.quantity} × ₦{Number(item.unit_price).toFixed(2)}</p>
                    </div>
                    <span className="font-semibold text-slate-800 ml-3">₦{(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {receipt.discount > 0 && (
                <div className="flex items-center justify-between text-sm text-rose-600">
                  <span>Discount</span><span>−₦{receipt.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-400">
                    {receipt.items.reduce((s, i) => s + i.quantity, 0)} units
                    <span className="mx-1">·</span>
                    {receipt.payment}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-xl font-bold text-slate-800">₦{receipt.total.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-3 flex-shrink-0">
              <button onClick={closeReceipt}
                className="py-2.5 px-6 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                Done
              </button>
              <button onClick={printReceipt}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 hover:scale-[1.01] transition-all flex items-center gap-2">
                <Printer size={15} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Details Modal */}
      {viewSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewSale(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={18} className="text-primary" /> Sale Details</h3>
              <button onClick={() => setViewSale(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Drug</p>
                  <p className="text-sm font-semibold text-slate-800">{viewSale.drug_name}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Quantity</p>
                  <p className="text-sm font-semibold text-slate-800">×{viewSale.quantity}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Unit Price</p>
                  <p className="text-sm font-semibold text-slate-800">₦{Number(viewSale.unit_price).toFixed(2)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-sm font-bold text-emerald-700">₦{Number(viewSale.total_amount).toFixed(2)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Customer</p>
                  <p className="text-sm font-semibold text-slate-800">{viewSale.customer_name || 'Walk-in'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Payment</p>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700">
                    {(() => { const MIcon = paymentIcons[viewSale.payment_method] || Wallet; return <><MIcon size={12} />{viewSale.payment_method?.toUpperCase()}</> })()}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-1">
                <div className="flex justify-between text-xs text-slate-500"><span>Sold By</span><span className="font-medium text-slate-700">{viewSale.sold_by_name || '—'}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Time</span><span className="font-medium text-slate-700">{viewSale.sold_at ? new Date(viewSale.sold_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
                <div className="flex justify-between text-xs text-slate-500 gap-4"><span>Notes</span><span className="font-medium text-slate-700 text-right">{viewSale.notes || '—'}</span></div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => printThermal(viewSale)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 hover:scale-[1.01] transition-all flex items-center justify-center gap-2">
                <Printer size={15} /> Print Receipt
              </button>
              <button onClick={() => setViewSale(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
