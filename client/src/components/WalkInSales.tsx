import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  ShoppingCart, Search, Loader2, Plus, X, CheckCircle, Trash2, Package, Banknote, User, CreditCard, Building2, Wallet, Minus, ArrowLeft, Printer
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

interface CartItem {
  drug_name: string
  quantity: number
  unit_price: number
  stock_count: number
}

export default function WalkInSales() {
  const navigate = useNavigate()
  const [inventory, setInventory] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [drugSearch, setDrugSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [showCartModal, setShowCartModal] = useState(false)
  const [receipt, setReceipt] = useState<{ items: CartItem[]; customer: string; payment: string; total: number; date: string } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [invRes, salesRes] = await Promise.all([
          api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
          api.get('/otc-sales').catch(() => ({ data: [] })),
        ])
        setInventory(invRes.data || [])
        setSales(salesRes.data || [])
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const filteredDrugs = inventory.filter((i: any) =>
    i.drug_name.toLowerCase().includes(drugSearch.toLowerCase())
  )

  const todaySales = sales.filter((s: any) =>
    new Date(s.sold_at).toISOString().slice(0, 10) === filterDate
  )
  const totalToday = todaySales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0)
  const cartTotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  function addToCart(drug: any) {
    setCart((prev) => {
      const existing = prev.find((c) => c.drug_name === drug.drug_name)
      if (existing) {
        if (existing.quantity >= drug.stock_count) return prev
        return prev.map((c) => c.drug_name === drug.drug_name ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { drug_name: drug.drug_name, quantity: 1, unit_price: drug.price || 0, stock_count: drug.stock_count }]
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

  function clearCart() { setCart([]); setCustomerName(''); setPaymentMethod('cash'); setNotes(''); setError('') }

  async function handleCheckout() {
    if (cart.length === 0) { setError('Cart is empty'); return }
    setSubmitting(true); setError('')
    const soldItems = [...cart]
    const receiptCustomer = customerName.trim()
    const receiptPayment = paymentMethod
    try {
      for (const item of cart) {
        await api.post('/otc-sales', {
          drug_name: item.drug_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          customer_name: receiptCustomer || null,
          payment_method: receiptPayment,
          notes: notes.trim() || null,
          sold_by: currentUserId,
        })
      }
      setReceipt({ items: soldItems, customer: receiptCustomer, payment: receiptPayment, total: cartTotal, date: new Date().toISOString() })
      setShowCartModal(false)
      clearCart()
      const [invRes, salesRes] = await Promise.all([
        api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
        api.get('/otc-sales').catch(() => ({ data: [] })),
      ])
      setInventory(invRes.data || [])
      setSales(salesRes.data || [])
    } catch (err: any) { setError(err.response?.data?.message || 'Checkout failed') } finally { setSubmitting(false) }
  }

  const paymentIcons: Record<string, typeof Wallet> = { cash: Wallet, card: CreditCard, transfer: Building2 }

  function CartItemsList() {
    if (cart.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
        <ShoppingCart size={36} className="text-slate-300 mb-2" />
        <p className="text-sm">Cart is empty</p>
        <p className="text-xs mt-1">Add drugs from inventory</p>
      </div>
    )
    return cart.map((item) => (
      <div key={item.drug_name} className="px-5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-800 truncate flex-1">{item.drug_name}</p>
          <button onClick={() => removeFromCart(item.drug_name)} className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-rose-500 transition-colors ml-2"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-3 mt-2">
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
        <div className="flex items-center gap-2">
          <User size={14} className="text-slate-400" />
          <input type="text" placeholder="Customer name (optional)" value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
        </div>
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
        <input type="text" placeholder="Sale notes (optional)" value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">{cart.length} item(s) &middot; {cartCount} units</p>
            {error && <p className="text-xs text-rose-600 mt-0.5">{error}</p>}
          </div>
          <div className="text-right"><p className="text-xs text-slate-400">Total</p><p className="text-xl font-bold text-slate-800">₦{cartTotal.toFixed(2)}</p></div>
        </div>
        <button onClick={handleCheckout} disabled={submitting || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 hover:scale-[1.01] transition-all disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {submitting ? 'Processing...' : `Complete Sale — ₦${cartTotal.toFixed(2)}`}
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
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50"><CartItemsList /></div>
        {cart.length > 0 && <CartFooter />}
      </>
    )
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><ShoppingCart size={22} className="text-emerald-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Walk-in Sales</h1>
            <p className="text-sm text-slate-500">OTC counter — sell to non-patients</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{todaySales.length}</p>
          <p className="text-xs text-slate-500">Sales Today</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-slate-800">₦{totalToday.toFixed(2)}</p>
          <p className="text-xs text-slate-500">Revenue Today</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="w-full text-sm outline-none cursor-pointer" />
        </div>
      </div>

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
          {/* Inventory Browser — full width on mobile, 3 cols on desktop */}
          <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[600px]">
            <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Package size={16} /> Inventory</h2>
                <span className="text-xs text-slate-400">{filteredDrugs.length} items</span>
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search drugs..." value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {filteredDrugs.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-slate-400">
                  <Package size={36} className="text-slate-300 mb-2" />
                  <p className="text-sm">No drugs found</p>
                </div>
              ) : filteredDrugs.map((drug: any) => (
                <div key={drug.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{drug.drug_name}</p>
                    <p className="text-xs text-slate-400">Stock: {drug.stock_count} &middot; Batch: {drug.batch_number || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${
                      drug.stock_count <= drug.reorder_level ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>{drug.stock_count} left</span>
                    <button onClick={() => addToCart(drug)} disabled={drug.stock_count <= 0}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40 flex items-center gap-1">
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart — Desktop: side panel, hidden on mobile */}
          <div className="hidden lg:flex lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex-col max-h-[600px]">
            <CartContentDesktop />
          </div>
        </div>

      {/* Cart Modal — Mobile/Tablet */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setShowCartModal(false)}>
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCartModal(false)} />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl border border-slate-100 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={16} /> Cart ({cart.length})</h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1"><Trash2 size={12} /> Clear</button>
                )}
                <button onClick={() => setShowCartModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              <CartItemsList />
            </div>
            {cart.length > 0 && <CartFooter />}
          </div>
        </div>
      )}

      {/* Today's Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={16} /> Sales History — {filterDate}</h2>
        </div>
        {todaySales.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <ShoppingCart size={36} className="text-slate-300 mb-2" />
            <p className="text-sm">No sales for this date</p>
            <span className="mt-2 text-xs text-slate-400">Add items from the inventory above</span>
          </div>
        ) : (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {todaySales.map((s: any) => {
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-600 text-white text-center px-6 py-6 rounded-t-2xl">
              <CheckCircle size={40} className="mx-auto mb-2" />
              <h2 className="text-lg font-bold">Sale Complete</h2>
              <p className="text-sm text-emerald-100">Receipt generated</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-sm text-slate-500 pb-3 border-b border-slate-100">
                <span>{new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {receipt.customer && <span className="font-medium text-slate-700">Customer: {receipt.customer}</span>}
              </div>
              <div className="divide-y divide-slate-50">
                {receipt.items.map((item) => (
                  <div key={item.drug_name} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate">{item.drug_name}</p>
                      <p className="text-xs text-slate-400">{item.quantity} × ₦{item.unit_price.toFixed(2)}</p>
                    </div>
                    <span className="font-semibold text-slate-800 ml-3">₦{(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => {
                const text = `SRETAN EMR\n${new Date(receipt.date).toLocaleString()}\n${receipt.customer ? `Customer: ${receipt.customer}\n` : ''}${'─'.repeat(30)}\n${receipt.items.map((i) => `${i.drug_name}\n  ${i.quantity} × ₦${i.unit_price.toFixed(2)} = ₦${(i.unit_price * i.quantity).toFixed(2)}`).join('\n')}\n${'─'.repeat(30)}\nTotal: ₦${receipt.total.toFixed(2)}\nPayment: ${receipt.payment}`
                navigator.clipboard?.writeText(text)
                setReceipt(null)
              }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                Copy Receipt
              </button>
              <button onClick={() => setReceipt(null)}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
