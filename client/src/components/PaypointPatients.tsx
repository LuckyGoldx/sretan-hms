import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, Loader2, CheckCircle, User, Package, Pill, FlaskConical, Scan, Home, CreditCard, Banknote, Landmark, Smartphone, X, ShoppingCart, Printer, Trash2, ArrowLeft, Phone, FileText,
} from 'lucide-react'

const serviceIcons: Record<string, any> = {
  folder_activation: User, prescription: Pill, lab: FlaskConical, radiology: Scan, admission: Home,
}

export default function PaypointPatients() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showCart, setShowCart] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadSummary()
  }, [])

  async function loadSummary() {
    setLoading(true)
    try { const r = await api.get('/payments/pending-summary'); setSummary(r.data || []) } catch {} finally { setLoading(false) }
  }

  const filtered = summary.filter((p: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (p.full_name || '').toLowerCase().includes(q) || (p.hospital_number || '').toLowerCase().includes(q)
  })

  async function selectPatient(p: any) {
    setSelectedPatient(p)
    setPendingItems([])
    setCart([])
    try {
      const res = await api.get(`/payments/pending/${p.patient_id}`)
      var items = res.data?.items || []
      setPendingItems(items)
      setCart(items.map(function(item: any) { return { ...item } }))
    } catch {}
  }

  function removeFromCart(i: number) { setCart((p) => p.filter((_, idx) => idx !== i)) }
  function updateQty(i: number, q: number) { setCart((p) => p.map((c, idx) => idx === i ? { ...c, quantity: Math.max(1, q) } : c)) }
  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)

  async function handlePayment() {
    if (cart.length === 0 || !selectedPatient) return
    setSubmitting(true)
    try {
      const res = await api.post('/payments', {
        patient_id: selectedPatient.patient_id,
        items: cart.map((c) => ({ service_type: c.service_type, service_id: c.service_id, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod, notes: notes || null, created_by: currentUser?.id,
      })
      setReceipt(res.data); setShowReceipt(true); setCart([]); setNotes('')
      const r = await api.get(`/payments/pending/${selectedPatient.patient_id}`)
      setPendingItems(r.data?.items || [])
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
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/paypoint/pending')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><User size={22} className="text-amber-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Patients with Pending Bills</h1>
            <p className="text-sm text-slate-500">{summary.length} patient(s)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {!selectedPatient ? (
            <>
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search patient name or hospital #..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
                  <CheckCircle size={48} className="mx-auto mb-3 text-emerald-300" />
                  <p className="text-sm font-medium">All patients settled</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filtered.map((p: any) => (
                    <button key={p.patient_id} onClick={() => selectPatient(p)}
                      className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0"><User size={18} className="text-amber-600" /></div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                            <p className="text-xs text-slate-400">{p.hospital_number} · {p.total_items} pending</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
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
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedPatient(null); setPendingItems([]); setCart([]) }} className="p-1.5 rounded-lg hover:bg-slate-100"><ArrowLeft size={16} className="text-slate-500" /></button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><User size={16} className="text-primary" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedPatient.full_name}</p>
                    <p className="text-xs text-slate-400">{selectedPatient.hospital_number}</p>
                  </div>
                </div>
              </div>
              {pendingItems.length > 0 ? (
                <div className="space-y-2">
                  {pendingItems.map((item, i) => (
                    <div key={i} className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-700 truncate">{item.description}</p>
                          <p className="text-xs text-slate-400 capitalize">{item.service_type.replace('_', ' ')}{item.unit_price > 0 ? ` · ₦${Number(item.unit_price).toLocaleString()}` : ''}</p>
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

        {/* Cart — desktop */}
        <div className="hidden lg:block">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><ShoppingCart size={16} /> Cart ({cart.length})</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Select a patient to view items.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {cart.map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
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
            )}
            {cart.length > 0 && selectedPatient && (
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
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <h2 className="text-sm font-semibold"><ShoppingCart size={16} className="inline mr-2" />Cart ({cart.length})</h2>
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
                    <div className="flex-1"><label className="text-[10px] text-slate-400">Price</label><div className="w-full rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-700">₦{(item.unit_price || 0).toLocaleString()}</div></div>
                    <div className="w-16"><label className="text-[10px] text-slate-400">Qty</label>
                      <input type="number" min={1} value={item.quantity} onChange={(e) => updateQty(i, parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="min-w-[60px] text-right"><label className="text-[10px] text-slate-400">Total</label><p className="text-sm font-bold">₦{(item.unit_price * item.quantity).toLocaleString()}</p></div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && selectedPatient && (
              <div className="px-5 py-4 border-t bg-slate-50 rounded-b-2xl flex-shrink-0 space-y-3">
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
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{cart.length} items</span><span className="text-lg font-bold">₦{total.toLocaleString()}</span></div>
                <button onClick={() => { setShowCart(false); handlePayment() }} disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{submitting ? 'Processing...' : `Pay ₦${total.toLocaleString()}`}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center border-b"><div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto mb-3"><CheckCircle size={28} className="text-emerald-600" /></div>
              <h2 className="text-lg font-semibold">Payment Successful</h2><p className="text-xs text-slate-400">#{receipt.receipt_number}</p></div>
            <div className="p-6 space-y-2">
              <p className="text-sm font-semibold text-center">{receipt.patient_name}</p>
              {(receipt.items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm"><span>{item.description}</span><span className="font-medium">₦{(item.total_price || 0).toLocaleString()}</span></div>
              ))}
              <div className="flex justify-between font-bold pt-3 border-t"><span>Total</span><span>₦{(receipt.total_amount || 0).toLocaleString()}</span></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium"><Printer size={14} /> Print</button>
              <button onClick={() => { setShowReceipt(false); setSelectedPatient(null); setPendingItems([]); loadSummary() }} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
