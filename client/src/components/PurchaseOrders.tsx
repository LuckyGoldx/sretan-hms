import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  Package, Plus, Loader2, CheckCircle, XCircle, AlertTriangle, X, ArrowLeft, Truck, Eye
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface PO {
  id: string
  po_number: string
  drug_name: string
  quantity: number
  unit_price: number
  supplier: string | null
  status: string
  notes: string | null
  ordered_at: string
  received_at: string | null
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ drug_name: '', quantity: '', unit_price: '', supplier: '', notes: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchOrders() }, [])

  async function fetchOrders() {
    setLoading(true)
    try { const { data } = await api.get('/purchase-orders'); setOrders(data || []) }
    catch { setOrders([]) } finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!form.drug_name.trim() || !form.quantity) { setError('Drug name and quantity are required'); return }
    setAdding(true); setError(null)
    try {
      await api.post('/purchase-orders', {
        drug_name: form.drug_name.trim(), quantity: parseInt(form.quantity, 10),
        unit_price: parseFloat(form.unit_price) || 0, supplier: form.supplier.trim() || null, notes: form.notes.trim() || null,
      })
      setShowAdd(false); setForm({ drug_name: '', quantity: '', unit_price: '', supplier: '', notes: '' }); fetchOrders()
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to create PO') } finally { setAdding(false) }
  }

  async function handleReceive(id: string) {
    try {
      await api.put(`/purchase-orders/${id}/receive`)
      fetchOrders()
    } catch {}
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      received: 'bg-emerald-100 text-emerald-700',
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
        {status === 'received' ? <CheckCircle size={11} /> : <XCircle size={11} />}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const stats = {
    pending: orders.filter((o) => o.status === 'pending').length,
    received: orders.filter((o) => o.status === 'received').length,
    total: orders.length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Truck size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Purchase Orders</h1>
            <p className="text-sm text-slate-500">Order stock from suppliers</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <Plus size={16} /> New PO
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', count: stats.pending, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Received', count: stats.received, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Total', count: stats.total, color: 'text-indigo-600', bg: 'bg-indigo-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No purchase orders yet</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 underline">Create your first PO</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">PO #</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Drug</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Unit Price</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Total</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Supplier</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Ordered</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 font-medium">{po.po_number}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{po.drug_name}</td>
                    <td className="px-5 py-3.5">{po.quantity}</td>
                    <td className="px-5 py-3.5 text-slate-600">${Number(po.unit_price).toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-700">${(po.quantity * Number(po.unit_price)).toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-slate-500">{po.supplier || '—'}</td>
                    <td className="px-5 py-3.5">{statusBadge(po.status)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(po.ordered_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5">
                      {po.status === 'pending' && (
                        <button onClick={() => handleReceive(po.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors">
                          <CheckCircle size={12} /> Receive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { if (!adding) setShowAdd(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Truck size={18} className="text-indigo-500" /> New Purchase Order</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label: 'Drug Name *', key: 'drug_name', placeholder: 'e.g. Amoxicillin 500mg' },
                { label: 'Quantity *', key: 'quantity', type: 'number', placeholder: 'e.g. 1000' },
                { label: 'Unit Price ($)', key: 'unit_price', type: 'number', placeholder: 'e.g. 0.50' },
                { label: 'Supplier', key: 'supplier', placeholder: 'e.g. PharmaCorp Ltd' },
                { label: 'Notes', key: 'notes', placeholder: 'Optional notes' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={(form as any)[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreate} disabled={adding}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
