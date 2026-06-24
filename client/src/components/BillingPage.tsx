import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Search, Loader2, Plus, X, CheckCircle, Trash2, Banknote, CreditCard, Landmark, Smartphone, ArrowLeft, User, Receipt, Building2, Pill, FlaskConical, Scan, ShoppingCart, Printer, ChevronLeft, ChevronRight,
} from 'lucide-react'

const PAGE_SIZE = 20

export default function BillingPage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [catalog, setCatalog] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cart, setCart] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  const [showCart, setShowCart] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadPatients()
    async function loadCatalog() {
      try {
        const [pharm, lb, rad, gen] = await Promise.all([
          api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
          api.get('/inventory?category=lab').catch(() => ({ data: [] })),
          api.get('/inventory?category=radiology').catch(() => ({ data: [] })),
          api.get('/inventory?category=general').catch(() => ({ data: [] })),
        ])
        var result: any[] = []
        var groups = [{ cat: 'pharmacy', items: pharm.data || [] }, { cat: 'lab', items: lb.data || [] }, { cat: 'radiology', items: rad.data || [] }, { cat: 'general', items: gen.data || [] }]
        for (const g of groups) {
          var inv = g.items.filter((i: any) => i.is_active !== false && i.price > 0)
          if (inv.length === 0) continue
          if (g.cat === 'general') {
            var sub: Record<string, any[]> = {}
            for (const i of inv) { var st = i.amount_type || 'service'; if (!sub[st]) sub[st] = []; sub[st].push(i) }
            for (const [k, v] of Object.entries(sub)) result.push({ category: k.charAt(0).toUpperCase() + k.slice(1), items: v.map((i: any) => ({ name: i.drug_name, price: i.price })) })
          } else {
            result.push({ category: g.cat.charAt(0).toUpperCase() + g.cat.slice(1), items: inv.map((i: any) => ({ name: i.drug_name, price: i.price })) })
          }
        }
        setCatalog(result)
      } catch {} finally { setLoaded(true) }
    }
    loadCatalog()
  }, [])

  async function loadPatients() {
    setLoading(true)
    try { const r = await api.get('/patients'); setPatients(r.data || []) } catch {} finally { setLoading(false) }
  }

  const filtered = patients.filter((p: any) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (p.full_name || '').toLowerCase().includes(q) || (p.hospital_number || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q)
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function addToCart(item: any) {
    setCart((prev) => {
      var existing = prev.find((c) => c.description === item.name)
      if (existing) return prev.map((c) => c.description === item.name ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { description: item.name, quantity: 1, unit_price: item.price }]
    })
  }
  function removeFromCart(i: number) { setCart((p) => p.filter((_, idx) => idx !== i)) }
  function updateQty(i: number, q: number) { setCart((p) => p.map((c, idx) => idx === i ? { ...c, quantity: Math.max(1, q) } : c)) }
  const total = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)

  async function handlePayment() {
    if (cart.length === 0 || !selectedPatient) return
    setSubmitting(true)
    try {
      const res = await api.post('/payments', {
        patient_id: selectedPatient.id,
        items: cart.map((c) => ({ service_type: 'billing', service_id: null, description: c.description, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod, notes: notes || null, created_by: currentUser?.id,
      })
      setReceipt(res.data); setShowReceipt(true); setCart([]); setNotes('')
    } catch (err: any) { alert(err.response?.data?.message || 'Payment failed') } finally { setSubmitting(false) }
  }

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'transfer', label: 'Transfer', icon: Landmark, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'pos', label: 'POS', icon: Smartphone, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ]

  const filteredCatalog = catalog.map((g) => ({ ...g, items: g.items.filter((i: any) => (i.name || '').toLowerCase().includes(catSearch.toLowerCase())) })).filter((g) => g.items.length > 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/paypoint/pending')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Receipt size={22} className="text-blue-600" /></div>
        <h1 className="text-xl font-bold text-slate-800">Billing</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-primary" /></div>
              ) : paged.length === 0 ? (
                <div className="text-center py-10 text-slate-400"><User size={36} className="mx-auto mb-2 text-slate-300" /><p className="text-sm font-medium">No patients found</p></div>
              ) : (
                <>
                  <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                    {paged.map((p: any) => (
                      <button key={p.id} onClick={() => setSelectedPatient(p)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 text-left transition-colors">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><User size={15} className="text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedPatient(null); setCart([]) }} className="p-1 rounded-lg hover:bg-slate-100"><ArrowLeft size={16} className="text-slate-500" /></button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><User size={16} className="text-primary" /></div>
                  <div><p className="text-sm font-semibold text-slate-800">{selectedPatient.full_name}</p><p className="text-xs text-slate-400">{selectedPatient.hospital_number}</p></div>
                </div>
              </div>
              <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search services..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
                {!loaded ? <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-primary" /></div>
                : filteredCatalog.length === 0 ? <div className="flex flex-col items-center py-10 text-slate-400"><Building2 size={32} className="text-slate-300 mb-2" /><p className="text-sm">No services</p></div>
                : filteredCatalog.map((group) => (
                  <div key={group.category}>
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500 uppercase">{group.category}</p>
                      <span className="text-[10px] text-slate-400">{group.items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-3">
                      {group.items.map((item: any) => (
                        <button key={item.name} onClick={() => addToCart(item)}
                          className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${cart.find((c) => c.description === item.name) ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-primary'}`}>
                          <p className="truncate">{item.name}</p>
                          <p className="font-bold mt-0.5">₦{item.price.toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cart — desktop */}
        <div className="hidden lg:block">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><ShoppingCart size={16} /> Bill ({cart.length})</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{selectedPatient ? 'Add services from the catalog.' : 'Select a patient first.'}</p>
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
                  {submitting ? 'Processing...' : `Charge ₦${total.toLocaleString()}`}
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
              <h2 className="text-sm font-semibold"><ShoppingCart size={16} className="inline mr-2" />Bill ({cart.length})</h2>
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
            {cart.length > 0 && selectedPatient && (
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
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{cart.length} items</span><span className="text-lg font-bold">₦{total.toLocaleString()}</span></div>
                <button onClick={() => { setShowCart(false); handlePayment() }} disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                  {submitting ? 'Processing...' : `Charge ₦${total.toLocaleString()}`}
                </button>
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
              <div className="flex justify-between text-xs text-slate-400 pt-2"><span>{receipt.payment_method?.toUpperCase()}</span><span>{new Date(receipt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium"><Printer size={14} /> Print</button>
              <button onClick={() => { setShowReceipt(false); setSelectedPatient(null); setCart([]) }} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
