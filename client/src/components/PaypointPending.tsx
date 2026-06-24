import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, Loader2, CheckCircle, User, Package, Pill, FlaskConical, Scan, Home, Plus, X, ShoppingCart, Banknote, CreditCard, Landmark, Smartphone, Trash2, Printer, Clock, FileText, ArrowLeft, AlertTriangle,
} from 'lucide-react'

const serviceIcons: Record<string, any> = {
  folder_activation: User, prescription: Pill, lab: FlaskConical, radiology: Scan, admission: Home,
}

export default function PaypointPending() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [cart, setCart] = useState<any[]>([])
  const [showCart, setShowCart] = useState(false)
  const [errorModal, setErrorModal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    try { const r = await api.get('/payments/all-pending-items'); setItems(r.data || []) } catch {} finally { setLoading(false) }
  }

  const filtered = items.filter((i: any) => {
    if (!filter) return true
    var q = filter.toLowerCase()
    return (i.full_name || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q) || (i.hospital_number || '').toLowerCase().includes(q)
  })

  function addToCart(item: any) {
    setCart((prev) => {
      if (prev.length > 0 && prev[0].hospital_number && item.hospital_number && prev[0].hospital_number !== item.hospital_number) {
        setErrorModal('Only items from the same patient can be in one cart. Clear the cart first to add items from a different patient.')
        return prev
      }
      var key = (item.service_id || item.patient_id) + '-' + item.service_type + '-' + (item.service_id || item.description)
      if (prev.find((c: any) => ((c.service_id || c.patient_id) + '-' + c.service_type + '-' + (c.service_id || c.description)) === key)) return prev
      return [...prev, { ...item }]
    })
  }
  function removeFromCart(i: number) { setCart((p) => p.filter((_, idx) => idx !== i)) }
  function updateQty(i: number, q: number) { setCart((p) => p.map((c, idx) => idx === i ? { ...c, quantity: Math.max(1, q) } : c)) }
  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)

  async function handlePayment() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await api.post('/payments', {
        items: cart.map((c) => ({ service_type: c.service_type, service_id: c.service_id, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod, notes: notes || null, created_by: currentUser?.id,
      })
      setReceipt(res.data); setShowReceipt(true); setCart([]); setNotes(''); loadItems()
    } catch (err: any) { alert(err.response?.data?.message || 'Payment failed') } finally { setSubmitting(false) }
  }

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'transfer', label: 'Transfer', icon: Landmark, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'pos', label: 'POS', icon: Smartphone, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">All Pending Payments</h1>
        <span className="text-sm text-slate-400">{items.length} unpaid</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient or service..." value={filter} onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
        </div>
        {cart.length > 0 && <button onClick={() => setCart([])} className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">Clear Cart</button>}
        <span className="text-xs text-slate-400">{filtered.length} shown</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              <CheckCircle size={48} className="mx-auto mb-3 text-emerald-300" />
              <p className="text-sm font-medium">Everything is settled!</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Service</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((item: any, idx: number) => {
                      const Icon = serviceIcons[item.service_type] || Package
                      const added = cart.some((c: any) => ((c.service_id || c.patient_id) + '-' + c.service_type + '-' + (c.service_id || c.description)) === ((item.service_id || item.patient_id) + '-' + item.service_type + '-' + (item.service_id || item.description)))
                      return (
                        <tr key={`${item.service_id}-${item.service_type}-${idx}`} className={`hover:bg-slate-50 transition-colors ${added ? 'bg-emerald-50' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={12} className="text-primary" /></div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 truncate max-w-[140px]">{item.full_name}</p>
                                {item.hospital_number && <p className="text-[10px] text-slate-400">{item.hospital_number}</p>}
                                {item.created_at && <p className="text-[9px] text-slate-300">{new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium ${
                              item.service_type === 'prescription' ? 'bg-rose-100 text-rose-700' :
                              item.service_type === 'lab' ? 'bg-purple-100 text-purple-700' :
                              item.service_type === 'radiology' ? 'bg-indigo-100 text-indigo-700' :
                              item.service_type === 'admission' ? 'bg-blue-100 text-blue-700' :
                              item.service_type === 'folder_activation' ? 'bg-sky-100 text-sky-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              <Icon size={10} />{item.service_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{item.description}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{item.unit_price > 0 ? `₦${Number(item.unit_price).toLocaleString()}` : '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => addToCart(item)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${added ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-white hover:scale-[1.01]'}`}>
                              {added ? <CheckCircle size={12} className="inline mr-1" /> : <Plus size={12} className="inline mr-1" />}
                              {added ? 'Added' : 'Add'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Cart — desktop */}
        <div className="hidden lg:block">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><ShoppingCart size={16} /> Cart ({cart.length})</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Add items from the table.</p>
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
                        <input type="number" min={1} value={item.quantity} onChange={(e) => updateQty(i, parseInt(e.target.value) || 1)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                      <div className="min-w-[60px] text-right"><label className="text-[10px] text-slate-400">Total</label>
                        <p className="text-sm font-bold text-slate-800">₦{(item.unit_price * item.quantity).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cart.length > 0 && (
              <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
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
                <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{cart.reduce((s, c) => s + c.quantity, 0)} units</span>
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

      {/* Mobile cart button */}
      {cart.length > 0 && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 z-40 lg:hidden w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">{cart.length}</span>
        </button>
      )}

      {/* Cart Modal — mobile */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setShowCart(false)}>
          <div className="fixed inset-0 bg-black/30" />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl border border-slate-100 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-800"><ShoppingCart size={16} className="inline mr-2" />Cart ({cart.length})</h2>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 divide-y divide-slate-50">
              {cart.map((item, i) => (
                <div key={i} className="py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-medium text-slate-700 flex-1 truncate">{item.description}</p>
                    <button onClick={() => removeFromCart(i)} className="p-0.5 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500"><X size={12} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><label className="text-[10px] text-slate-400">Price</label>
                      <div className="w-full rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-700">₦{(item.unit_price || 0).toLocaleString()}</div>
                    </div>
                    <div className="w-16"><label className="text-[10px] text-slate-400">Qty</label>
                      <input type="number" min={1} value={item.quantity} onChange={(e) => updateQty(i, parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="min-w-[60px] text-right"><label className="text-[10px] text-slate-400">Total</label>
                      <p className="text-sm font-bold text-slate-800">₦{(item.unit_price * item.quantity).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0 space-y-3">
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
                <input type="text" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{cart.reduce((s, c) => s + c.quantity, 0)} units</span><span className="text-lg font-bold">₦{total.toLocaleString()}</span></div>
                <button onClick={() => { setShowCart(false); handlePayment() }} disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                  {submitting ? 'Processing...' : `Pay ₦${total.toLocaleString()}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setErrorModal('')}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4 px-6 pt-6 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={24} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-800 mb-1">Different Patient</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{errorModal}</p>
              </div>
              <button onClick={() => setErrorModal('')} className="p-1 rounded-lg hover:bg-slate-100 flex-shrink-0"><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="px-6 pb-5 flex items-center justify-between">
              <button onClick={() => { setCart([]); setErrorModal('') }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 transition-colors">
                <Trash2 size={14} /> Clear Cart
              </button>
              <button onClick={() => setErrorModal('')} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center border-b"><div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3"><CheckCircle size={28} className="text-emerald-600" /></div>
              <h2 className="text-lg font-semibold">Payment Successful</h2><p className="text-xs text-slate-400">#{receipt.receipt_number}</p></div>
            <div className="p-6 space-y-2">
              {(receipt.items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm"><span className="text-slate-600 flex-1 truncate">{item.description}</span><span className="font-medium ml-4">₦{(item.total_price || 0).toLocaleString()}</span></div>
              ))}
              <div className="flex justify-between font-bold pt-3 border-t"><span>Total</span><span>₦{(receipt.total_amount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between text-xs text-slate-400 pt-2"><span>{receipt.payment_method?.toUpperCase()}</span><span>{new Date(receipt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"><Printer size={14} /> Print</button>
              <button onClick={() => setShowReceipt(false)} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
