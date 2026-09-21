import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import SpecialistTag from './SpecialistTag'
import { useNavigate } from 'react-router-dom'
import {
  Pill, ClipboardList, CheckCircle, Loader2, AlertTriangle, X, ArrowLeft, Stethoscope, Search, ChevronLeft, ChevronRight, Package,
} from 'lucide-react'

const PAGE_SIZE = 30

interface PendingPrescription {
  id: string
  drug_name: string
  dosage?: string | null
  quantity?: number | null
  instructions?: string | null
  encounter_id: string
  created_at?: string
  is_paid?: boolean
  patient_id?: string
  patient_name?: string
  doctor_name?: string
  doctor_role?: string
  is_consultation?: boolean
  department_name?: string | null
  billed_to_insurance?: boolean
  hospital_number?: string
  phone?: string
}

// One unified "ready to dispense" row: a paid legacy prescription or a paid
// pharmacy bill (the pharmacist's quantified order).
type ReadyItem =
  | { kind: 'rx'; id: string; date: string; rx: PendingPrescription; billId?: string | null }
  | { kind: 'bill'; id: string; date: string; bill: any }

// Normalise a drug name for matching.
function drugKey(s: any): string { return String(s || '').trim().toLowerCase() }

// First two names, capped at ~50 characters; "see more" opens the full list.
function conciseNames(names: Array<string | null | undefined>): { text: string; hasMore: boolean } {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean)
  const firstTwo = clean.slice(0, 2).join(', ')
  const text = firstTwo.length > 50 ? firstTwo.slice(0, 50) : firstTwo
  return { text, hasMore: clean.length > 2 || firstTwo.length > 50 }
}

export default function Dispensing() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ReadyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<ReadyItem | null>(null)
  const [dispensing, setDispensing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemsModal, setItemsModal] = useState<{ title: string; items: any[] } | null>(null)

  const fetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [rxRes, billRes] = await Promise.all([
        api.get<PendingPrescription[]>('/prescriptions?status=pending').catch(() => ({ data: [] as PendingPrescription[] })),
        api.get<any[]>('/pharmacy-bills', { params: { status: 'paid' } }).catch(() => ({ data: [] as any[] })),
      ])

      // Legacy paid prescriptions still ready to dispense.
      const paidRx = (rxRes.data || []).filter((rx) => rx.is_paid)
      const enriched = await Promise.all(paidRx.map(async (rx) => {
        try {
          const encResp = await api.get<any>(`/encounters/${rx.encounter_id}`)
          const patResp = await api.get<any>(`/patients/${encResp.data.patient_id}`)
          let doctorName = ''
          if (encResp.data.staff_id) {
            try { doctorName = (await api.get<any>(`/staff/${encResp.data.staff_id}`)).data?.name || '' } catch {}
          }
          return { ...rx, patient_id: patResp.data.id, patient_name: patResp.data.full_name, hospital_number: patResp.data.hospital_number, phone: patResp.data.phone, doctor_name: doctorName }
        } catch { return { ...rx, patient_name: 'Unknown', doctor_name: '' } }
      }))

      // Avoid showing the same medication twice: a single-item bill that is
      // covered by a paid prescription is dropped in favour of the prescription
      // card (which is more detailed), and that card dispenses through the bill
      // so stock isn't deducted twice. Multi-item bills stay, and the paid
      // prescriptions they cover are hidden instead.
      const bills: any[] = billRes.data || []
      const rxKey = (rx: any) => `${rx.patient_id}:${drugKey(rx.drug_name)}`
      const rxKeys = new Set(enriched.map(rxKey))
      const rxIds = new Set(enriched.map((rx) => String(rx.id)))
      const covers = (b: any, li: any) => rxIds.has(String(li.prescription_id)) || rxKeys.has(`${b.patient_id}:${drugKey(li.drug_name)}`)

      const droppedBillIds = new Set<string>()
      const rxBillId = new Map<string, string>()
      for (const b of bills) {
        const its = b.items || []
        if (its.length === 1 && covers(b, its[0])) {
          droppedBillIds.add(b.id)
          const li = its[0]
          const match = enriched.find((rx) => String(rx.id) === String(li.prescription_id) || rxKey(rx) === `${b.patient_id}:${drugKey(li.drug_name)}`)
          if (match) rxBillId.set(String(match.id), b.id)
        }
      }

      const hiddenRxIds = new Set<string>()
      for (const b of bills) {
        if (droppedBillIds.has(b.id) || (b.items || []).length <= 1) continue
        for (const li of (b.items || [])) {
          if (li.prescription_id) hiddenRxIds.add(String(li.prescription_id))
          for (const rx of enriched) if (rxKey(rx) === `${b.patient_id}:${drugKey(li.drug_name)}`) hiddenRxIds.add(String(rx.id))
        }
      }

      const rxItems: ReadyItem[] = enriched
        .filter((rx) => !hiddenRxIds.has(String(rx.id)))
        .map((rx) => ({ kind: 'rx', id: rx.id, date: rx.created_at || '', rx, billId: rxBillId.get(String(rx.id)) || null }))
      const billItems: ReadyItem[] = bills
        .filter((b) => !droppedBillIds.has(b.id))
        .map((b) => ({ kind: 'bill', id: b.id, date: b.paid_at || b.created_at || '', bill: b }))

      const merged = [...rxItems, ...billItems].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      setItems(merged)
    } catch { setItems([]) } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(() => fetch(true), 10000)
    const onFocus = () => fetch(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [fetch])

  function matches(it: ReadyItem, q: string): boolean {
    if (!q) return true
    if (it.kind === 'rx') {
      const r = it.rx
      return [r.drug_name, r.dosage, r.patient_name, r.hospital_number, r.phone, r.doctor_name, r.instructions]
        .some((v) => String(v || '').toLowerCase().includes(q))
    }
    const b = it.bill
    const names = (b.items || []).map((i: any) => i.drug_name).join(' ')
    return [b.bill_number, b.patient_name, b.hospital_number, b.patient_phone, b.doctor_name, names]
      .some((v) => String(v || '').toLowerCase().includes(q))
  }

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

  const filtered = items.filter((it) => matches(it, search.toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // A single-item bill shows the doctor's note; multiple items show the
  // per-drug instructions instead (the aggregated note is ambiguous there).
  const billMulti = !!modal && modal.kind === 'bill' && (modal.bill.items || []).length > 1

  async function handleDispense() {
    if (!modal) return
    setDispensing(true); setError(null)
    try {
      if (modal.kind === 'rx') {
        if (modal.billId) {
          // Covered by a paid bill — dispense through the bill (stock was held
          // when the bill was created, so this must not deduct again).
          await api.post(`/pharmacy-bills/${modal.billId}/dispense`, { dispensed_by: null })
        } else {
          const qty = Number(modal.rx.quantity) || 0
          if (qty <= 0) { setError('This prescription has no quantified quantity'); return }
          await api.post('/dispense', { prescription_id: modal.rx.id, quantity_dispensed: qty })
        }
      } else {
        await api.post(`/pharmacy-bills/${modal.bill.id}/dispense`, { dispensed_by: null })
      }
      setItems((prev) => prev.filter((i) => i.id !== modal.id || i.kind !== modal.kind))
      setModal(null)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Dispense failed')
    } finally { setDispensing(false) }
  }

  const rxCount = items.filter((i) => i.kind === 'rx').length
  const billCount = items.filter((i) => i.kind === 'bill').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Pill size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dispensing</h1>
          <p className="text-sm text-slate-500">Everything paid and ready to hand out — newest first</p>
        </div>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{items.length} ready ({billCount} bill · {rxCount} Rx)</span>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search drug, patient, hospital #, phone, doctor..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle size={48} className="text-emerald-300 mb-3" />
          <p className="text-sm font-medium">All caught up — nothing to dispense</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Search size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">Nothing matches "{search}"</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paged.map((it) => it.kind === 'rx' ? (
              <div key={`rx-${it.id}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-slate-800">{it.rx.drug_name}</p>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{it.rx.dosage} &middot; Quantified qty: <strong>{it.rx.quantity}</strong></p>
                  <p className="text-xs text-slate-400">
                    Patient: <strong className="font-semibold text-slate-900">{it.rx.patient_name || 'Unknown'}</strong>{it.rx.hospital_number ? ` · ${it.rx.hospital_number}` : ''}{it.rx.phone ? ` · ${it.rx.phone}` : ''}
                  </p>
                  {it.rx.doctor_name && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> Prescribed by: <strong>{it.rx.doctor_name}</strong></p>}
                </div>
                <button onClick={() => { setModal(it); setError(null) }}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-transform flex-shrink-0 ml-4">
                  <Pill size={15} /> Dispense
                </button>
              </div>
            ) : (
              <div key={`bill-${it.id}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-indigo-500" />
                    <p className="text-base font-semibold text-slate-800">Pharmacy Bill {it.bill.bill_number}</p>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                  </div>
                  <p className="mt-1">{renderItemNames(it.bill.items || [], `Bill ${it.bill.bill_number} — items`)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Patient: <strong className="font-semibold text-slate-900">{it.bill.patient_name || 'Unknown'}</strong>{it.bill.hospital_number ? ` · ${it.bill.hospital_number}` : ''} · Total ₦{Number(it.bill.total || 0).toLocaleString()}
                  </p>
                  {it.bill.doctor_name && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> Prescribed by: <strong>{it.bill.doctor_name}</strong></p>}
                </div>
                <button onClick={() => { setModal(it); setError(null) }}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-transform flex-shrink-0 ml-4">
                  <Pill size={15} /> Dispense
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} ready item(s)</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Page {safePage + 1} <span className="text-slate-400 font-medium">/ {totalPages}</span>
                </span>
                <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirmation modal — shows the already-quantified amount */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!dispensing) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Pill size={18} className="text-emerald-500" /> Confirm Dispense</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {modal.kind === 'rx' ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-600"><span className="font-semibold">Drug:</span> {modal.rx.drug_name}</p>
                    <p className="text-sm text-slate-600"><span className="font-semibold">Dosage:</span> {modal.rx.dosage || '—'}</p>
                    <p className="text-sm text-slate-600"><span className="font-semibold">Patient:</span> {modal.rx.patient_name || 'Unknown'}{modal.rx.hospital_number ? ` · ${modal.rx.hospital_number}` : ''}</p>
                    {modal.rx.doctor_name && <p className="text-sm text-slate-600 flex items-center gap-1"><Stethoscope size={14} className="text-slate-400" /><span className="font-semibold">Prescribed by:</span> {modal.rx.doctor_name}</p>}
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">Quantified quantity</p>
                    <p className="text-2xl font-bold text-emerald-800">{String(modal.rx.quantity ?? '—')}</p>
                  </div>
                  {modal.rx.instructions && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><ClipboardList size={12} /> Instructions</p>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">{modal.rx.instructions}</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-600"><span className="font-semibold">Bill:</span> {modal.bill.bill_number}</p>
                    <p className="text-sm text-slate-600"><span className="font-semibold">Patient:</span> {modal.bill.patient_name || 'Unknown'}{modal.bill.hospital_number ? ` · ${modal.bill.hospital_number}` : ''}</p>
                    {modal.bill.doctor_name && <p className="text-sm text-slate-600 flex items-center gap-1"><Stethoscope size={14} className="text-slate-400" /><span className="font-semibold">Prescribed by:</span> {modal.bill.doctor_name}</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {(modal.bill.items || []).map((li: any) => (
                      <div key={li.id} className="px-3.5 py-2.5 text-sm space-y-0.5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-slate-700 font-medium">{li.drug_name}</span>
                          <span className="text-xs text-slate-500 text-right whitespace-nowrap">
                            <strong className="text-slate-800">{li.quantity}{li.unit ? ` ${li.unit}` : ''}</strong> @ ₦{Number(li.unit_price || 0).toLocaleString()}
                            <span className="font-semibold text-slate-800 ml-2">₦{Number(li.total_price || 0).toLocaleString()}</span>
                          </span>
                        </div>
                        {li.dosage && <p className="text-xs text-slate-500">Dosage: {li.dosage}</p>}
                        {li.instructions && billMulti && <p className="text-xs text-slate-500 italic">Instructions: {li.instructions}</p>}
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3.5 py-2.5 text-sm font-bold bg-slate-50">
                      <span>Total</span><span>₦{Number(modal.bill.total || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  {!billMulti && modal.bill.doctor_notes && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><ClipboardList size={12} /> Instructions</p>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">{modal.bill.doctor_notes}</div>
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Paid at Paypoint — dispensing will deduct the stock.</p>
              {modal.kind === 'rx' && !modal.billId && !(Number(modal.rx.quantity) > 0) && (
                <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> No quantified quantity — bill this order at Pharmacy Bills.</p>
              )}
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleDispense} disabled={dispensing || (modal.kind === 'rx' && !modal.billId && !(Number(modal.rx.quantity) > 0))}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                {dispensing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirm Dispense
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div key={i.id || idx} className="flex items-center justify-between gap-3 text-sm">
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
