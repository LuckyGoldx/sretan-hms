import { useCallback, useEffect, useState } from 'react'
import api from '../hooks/useAxios'
import {
  ClipboardList, Loader2, Plus, Trash2, X, CheckCircle, XCircle, Pill, Clock, Banknote, Send, AlertTriangle, Search, ChevronLeft, ChevronRight, Stethoscope,
} from 'lucide-react'

const currentUserId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

interface QLine { inventory_item_id: string; unit: string; quantity: number; prescription_id?: string | null }

function unitsPerTier(item: any, unit: string): number {
  if (item?.carton_label && unit === item.carton_label) return Math.max(1, Number(item.units_per_carton) || 1)
  if (item?.pack_label && unit === item.pack_label) return Math.max(1, Number(item.units_per_pack) || 1)
  return 1
}
function priceForTier(item: any, unit: string): number {
  const base = Number(item?.price) || 0
  const perPack = Math.max(1, Number(item?.units_per_pack) || 1)
  const perCarton = Math.max(1, Number(item?.units_per_carton) || 1)
  if (item?.carton_label && unit === item.carton_label) {
    if (item.carton_price != null) return Number(item.carton_price) || 0
    if (item.pack_price != null) return Math.round(Number(item.pack_price) * (perCarton / perPack) * 100) / 100
    return Math.round(base * perCarton * 100) / 100
  }
  if (item?.pack_label && unit === item.pack_label) {
    if (item.pack_price != null) return Number(item.pack_price) || 0
    return Math.round(base * perPack * 100) / 100
  }
  return base
}
// First two names, capped at ~50 characters; "see more" opens the full list.
function conciseNames(names: Array<string | null | undefined>): { text: string; hasMore: boolean } {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean)
  const firstTwo = clean.slice(0, 2).join(', ')
  const text = firstTwo.length > 50 ? firstTwo.slice(0, 50) : firstTwo
  return { text, hasMore: clean.length > 2 || firstTwo.length > 50 }
}

function tiers(item: any): string[] {
  const list = [item?.base_unit || 'unit']
  if (item?.pack_label && Math.max(1, Number(item.units_per_pack) || 1) > 1) list.push(item.pack_label)
  if (item?.carton_label && Math.max(1, Number(item.units_per_carton) || 1) > 1) list.push(item.carton_label)
  return list
}

export default function PharmacyBills() {
  const [tab, setTab] = useState<'queue' | 'awaiting' | 'paid' | 'all'>('queue')
  const [queue, setQueue] = useState<any[]>([])
  const [bills, setBills] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [itemsModal, setItemsModal] = useState<{ title: string; items: any[] } | null>(null)
  const [dispenseModal, setDispenseModal] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [quantifyRx, setQuantifyRx] = useState<any | null>(null)
  const [lines, setLines] = useState<QLine[]>([])
  const [pickItemId, setPickItemId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [q, b, inv] = await Promise.all([
        api.get('/pharmacy-bills/queue').catch(() => ({ data: [] })),
        api.get('/pharmacy-bills').catch(() => ({ data: [] })),
        api.get('/inventory?category=pharmacy').catch(() => ({ data: [] })),
      ])
      setQueue(Array.isArray(q.data) ? q.data : [])
      setBills(Array.isArray(b.data) ? b.data : [])
      setInventory((Array.isArray(inv.data) ? inv.data : []).filter((i: any) => Number(i.stock_count) > 0))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [tab, search])

  function openQuantify(group: any) {
    setQuantifyRx(group); setPickItemId(''); setError('')
    // The doctor already chose the drugs — pre-fill every prescription in this
    // group from inventory (deduped by item) so the pharmacist only sets the
    // quantity/unit. Adding an item is only needed to substitute or add extra.
    const next: QLine[] = []
    for (const rx of (group.prescriptions || [])) {
      const match = inventory.find((i) => String(i.drug_name || '').trim().toLowerCase() === String(rx.drug_name || '').trim().toLowerCase())
      if (match && !next.some((l) => l.inventory_item_id === match.id)) {
        next.push({ inventory_item_id: match.id, unit: match.base_unit || 'unit', quantity: 1, prescription_id: rx.id })
      }
    }
    setLines(next)
  }
  function addLine() {
    if (!pickItemId) return
    setLines((prev) => [...prev, { inventory_item_id: pickItemId, unit: (inventory.find((i) => i.id === pickItemId)?.base_unit) || 'unit', quantity: 1 }])
    setPickItemId('')
  }
  function updateLine(idx: number, patch: Partial<QLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  function lineBaseQty(l: QLine) { const it = inventory.find((i) => i.id === l.inventory_item_id); return Math.round(l.quantity * unitsPerTier(it, l.unit)) }
  function lineTotal(l: QLine) { const it = inventory.find((i) => i.id === l.inventory_item_id); return Math.round(priceForTier(it, l.unit) * l.quantity * 100) / 100 }

  async function submitBill() {
    if (!quantifyRx || lines.length === 0) { setError('Add at least one item'); return }
    setBusy('create'); setError('')
    try {
      await api.post('/pharmacy-bills', {
        patient_id: quantifyRx.patient_id,
        encounter_id: quantifyRx.encounter_id,
        prescription_id: lines.find((l) => l.prescription_id)?.prescription_id || null,
        billed_by: currentUserId,
        items: lines.map((l) => ({ inventory_item_id: l.inventory_item_id, unit: l.unit, quantity: l.quantity, prescription_id: l.prescription_id || null })),
      })
      setQuantifyRx(null); setLines([])
      await load()
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to create bill') } finally { setBusy(null) }
  }
  async function dispense(bill: any) {
    setBusy(bill.id); setError('')
    try { await api.post(`/pharmacy-bills/${bill.id}/dispense`, { dispensed_by: currentUserId }); await load() }
    catch (e: any) { setError(e?.response?.data?.message || 'Dispense failed') } finally { setBusy(null) }
  }
  async function cancelBill(bill: any) {
    if (!confirm(`Cancel bill ${bill.bill_number}? The held stock will be released.`)) return
    setBusy(bill.id); setError('')
    try { await api.post(`/pharmacy-bills/${bill.id}/cancel`, {}); await load() }
    catch (e: any) { setError(e?.response?.data?.message || 'Cancel failed') } finally { setBusy(null) }
  }

  const shown = bills.filter((b) => tab === 'awaiting' ? b.status === 'awaiting_payment' : tab === 'paid' ? b.status === 'paid' : true)

  // Search works across every tab (doctor, patient, phone, hospital number, drug).
  const q = search.trim().toLowerCase()
  const matchBill = (b: any) => !q || [b.bill_number, b.patient_name, b.hospital_number, b.patient_phone, b.doctor_name, (b.items || []).map((i: any) => i.drug_name).join(' ')]
    .some((v) => String(v || '').toLowerCase().includes(q))
  const matchGroup = (g: any) => !q || [g.patient_name, g.hospital_number, g.patient_phone, g.doctor_name, (g.prescriptions || []).map((p: any) => p.drug_name).join(' ')]
    .some((v) => String(v || '').toLowerCase().includes(q))
  const filteredBills = shown.filter(matchBill)
  const filteredQueue = queue.filter(matchGroup)

  const PER_PAGE = 30
  const listLen = tab === 'queue' ? filteredQueue.length : filteredBills.length
  const totalPages = Math.max(1, Math.ceil(listLen / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedQueue = filteredQueue.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)
  const pagedBills = filteredBills.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  // Item names only (no unit), first two / 50 chars, with a "see more" popup.
  function renderItemNames(items: any[], title: string) {
    const { text, hasMore } = conciseNames(items.map((i) => i.drug_name))
    if (!text) return <span className="text-xs text-slate-400 italic">—</span>
    return (
      <span className="text-xs text-slate-600">
        {text}{hasMore ? '… ' : ''}
        {hasMore && (
          <button onClick={() => setItemsModal({ title, items })} className="text-indigo-600 hover:underline font-medium">see more</button>
        )}
      </span>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><ClipboardList size={20} className="text-indigo-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Pharmacy Bills</h1>
          <p className="text-xs text-slate-500">Quantify the doctor's order, send it to Paypoint, then dispense once paid.</p>
        </div>
      </div>

      {/* Search filters every tab (doctor, patient, phone, hospital number, drug) */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search doctor, patient, phone, hospital # or drug…"
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
      </div>

      <div className="flex gap-2">
        {[['queue', `To Quantify (${queue.length})`], ['awaiting', 'Awaiting Payment'], ['paid', 'Paid / Dispense'], ['all', 'All']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === k ? 'bg-primary text-white shadow' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertTriangle size={15} /> {error}</div>}

      {loading ? <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-primary" /></div> : tab === 'queue' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {filteredQueue.length === 0 ? <div className="py-14 text-center text-slate-400 text-sm">{q ? `Nothing matches “${search}”.` : 'No prescriptions waiting to be quantified.'}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Patient</th><th className="px-4 py-3 font-medium">Prescribed Drugs</th>
                <th className="px-4 py-3 font-medium">Ordered</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {pagedQueue.map((g) => (
                  <tr key={`${g.patient_id}:${g.encounter_id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{g.patient_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{g.hospital_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      {renderItemNames(g.prescriptions || [], `${g.patient_name} — prescribed`)}
                      <span className="text-[10px] text-slate-400 ml-1">({(g.prescriptions || []).length})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(g.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openQuantify(g)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"><Pill size={12} /> Quantify &amp; Bill all</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {filteredBills.length === 0 ? <div className="py-14 text-center text-slate-400 text-sm">{q ? `Nothing matches “${search}”.` : 'No bills.'}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Bill</th><th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {pagedBills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.bill_number}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{b.patient_name}</p><p className="text-[11px] text-slate-400 font-mono">{b.hospital_number}</p></td>
                    <td className="px-4 py-3">{renderItemNames(b.items || [], `Bill ${b.bill_number}`)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">₦{Number(b.total).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        b.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : b.status === 'dispensed' ? 'bg-slate-100 text-slate-500' : b.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {b.status === 'awaiting_payment' && (
                        <button onClick={() => cancelBill(b)} disabled={busy === b.id} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 mr-1.5 disabled:opacity-50"><XCircle size={12} className="inline" /> Cancel</button>
                      )}
                      {b.status === 'paid' && (
                        <button onClick={() => setDispenseModal(b)} disabled={busy === b.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                          {busy === b.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Dispense
                        </button>
                      )}
                      {b.status === 'awaiting_payment' && <span className="text-[11px] text-amber-600"><Clock size={11} className="inline" /> awaiting Paypoint</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination — 30 per page on every tab */}
      {!loading && listLen > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-slate-400">{listLen} record(s)</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /> Prev</button>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">Page {safePage} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Dispense confirmation modal */}
      {dispenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (busy !== dispenseModal.id) setDispenseModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500" /> Confirm Dispense</h3>
              <button onClick={() => setDispenseModal(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-slate-600"><span className="font-semibold">Bill:</span> {dispenseModal.bill_number}</p>
                {(dispenseModal.items || []).length === 1 ? (
                  <>
                    <p className="text-sm text-slate-600"><span className="font-semibold">Drug:</span> {dispenseModal.items[0].drug_name}</p>
                    <p className="text-sm text-slate-600"><span className="font-semibold">Dosage:</span> {dispenseModal.items[0].dosage || '—'}</p>
                  </>
                ) : (
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold">Drugs:</span>
                    <div className="mt-0.5 space-y-0.5">
                      {(dispenseModal.items || []).map((li: any) => (
                        <p key={li.id} className="text-xs text-slate-600">{li.drug_name}{li.dosage ? ` · ${li.dosage}` : ''}</p>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-sm text-slate-600"><span className="font-semibold">Patient:</span> {dispenseModal.patient_name || 'Unknown'}{dispenseModal.hospital_number ? ` · ${dispenseModal.hospital_number}` : ''}</p>
                {dispenseModal.doctor_name && <p className="text-sm text-slate-600 flex items-center gap-1"><Stethoscope size={14} className="text-slate-400" /><span className="font-semibold">Prescribed by:</span> {dispenseModal.doctor_name}</p>}
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700">Quantified quantity</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {(dispenseModal.items || []).length === 1
                    ? ((dispenseModal.items[0].quantity ?? '—'))
                    : (dispenseModal.items || []).length}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">Paid at Paypoint — dispensing will deduct the stock.</p>
              </div>
              {dispenseModal.doctor_notes && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><ClipboardList size={12} /> Doctor's Note</p>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">{dispenseModal.doctor_notes}</div>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {(dispenseModal.items || []).map((li: any) => (
                  <div key={li.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <span className="text-slate-700">{li.drug_name}</span>
                    <span className="text-xs text-slate-500">
                      {li.quantity}{li.unit ? ` ${li.unit}` : ''} @ ₦{Number(li.unit_price || 0).toLocaleString()}
                      <span className="font-semibold text-slate-800 ml-2">₦{Number(li.total_price || 0).toLocaleString()}</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3.5 py-2.5 text-sm font-bold bg-slate-50">
                  <span>Total</span><span>₦{Number(dispenseModal.total || 0).toLocaleString()}</span>
                </div>
              </div>
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setDispenseModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async () => { await dispense(dispenseModal); setDispenseModal(null) }} disabled={busy === dispenseModal.id}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                {busy === dispenseModal.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirm Dispense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quantify modal */}
      {quantifyRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setQuantifyRx(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Pill size={18} className="text-indigo-500" /> Quantify Order</h2>
              <button onClick={() => setQuantifyRx(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600">
                <p><strong>{quantifyRx.patient_name}</strong> <span className="text-xs text-slate-400 font-mono">{quantifyRx.hospital_number}</span></p>
                <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                  {(quantifyRx.prescriptions || []).map((rx: any) => (
                    <p key={rx.id}>Prescribed: <strong>{rx.drug_name}</strong>{rx.dosage ? ` · ${rx.dosage}` : ''}{rx.instructions ? <span className="text-slate-400 italic"> — {rx.instructions}</span> : ''}</p>
                  ))}
                </div>
              </div>

              {lines.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <AlertTriangle size={13} /> None of the prescribed drugs were matched in pharmacy inventory. Add the item(s) manually below.
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Add another item (optional — for substitution or extra)</label>
                  <select value={pickItemId} onChange={(e) => setPickItemId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select pharmacy item…</option>
                    {inventory.map((i) => <option key={i.id} value={i.id}>{i.drug_name} — {i.stock_count} {i.base_unit || 'units'} in stock</option>)}
                  </select>
                </div>
                <button onClick={addLine} disabled={!pickItemId} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50"><Plus size={14} /> Add</button>
              </div>

              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const it = inventory.find((i) => i.id === l.inventory_item_id)
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
                      <span className="flex-1 text-sm text-slate-700">{it?.drug_name}</span>
                      <select value={l.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white">
                        {tiers(it).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs text-right" />
                      <span className="text-xs text-slate-400 w-24 text-right">{lineBaseQty(l)} {it?.base_unit || 'units'}</span>
                      <span className="text-sm font-semibold text-slate-800 w-20 text-right">₦{lineTotal(l).toLocaleString()}</span>
                      <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={13} /></button>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-slate-500">Total: <strong className="text-slate-800">₦{lines.reduce((s, l) => s + lineTotal(l), 0).toLocaleString()}</strong></p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setQuantifyRx(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={submitBill} disabled={busy === 'create' || lines.length === 0} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to Paypoint
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1"><Banknote size={12} /> Stock is held when the bill is created and released if it is cancelled. Dispense only after Paypoint payment.</p>

      {/* Full item list popup (see more) */}
      {itemsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setItemsModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">{itemsModal.title}</h3>
              <button onClick={() => setItemsModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-2.5">
              {itemsModal.items.map((i: any, idx: number) => (
                <div key={i.id || i.line_id || idx} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">{i.drug_name}{i.dosage ? ` · ${i.dosage}` : ''}</span>
                  {i.quantity != null && (
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {i.quantity}{i.unit ? ` ${i.unit}` : ''}{i.unit_price != null ? ` @ ₦${Number(i.unit_price).toLocaleString()}` : ''}
                    </span>
                  )}
                </div>
              ))}
              {itemsModal.items.length === 0 && <p className="text-sm text-slate-400 italic">No items.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
