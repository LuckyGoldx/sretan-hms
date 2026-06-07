import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import type { Prescription } from '../types'
import {
  Pill, ClipboardList, CheckCircle, Loader2, AlertTriangle, X, ArrowLeft
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface PendingPrescription extends Prescription {
  patient_name?: string
}

export default function Dispensing() {
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState<PendingPrescription[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; rx: PendingPrescription | null; quantity: number }>({
    open: false, rx: null, quantity: 0,
  })
  const [dispensing, setDispensing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<PendingPrescription[]>('/prescriptions?status=pending')
      const withPatients = await Promise.all(
        (data || []).map(async (rx) => {
          try {
            const encResp = await api.get<any>(`/encounters/${rx.encounter_id}`)
            const patResp = await api.get<any>(`/patients/${encResp.data.patient_id}`)
            return { ...rx, patient_name: patResp.data.full_name }
          } catch { return { ...rx, patient_name: 'Unknown' } }
        })
      )
      setPrescriptions(withPatients)
    } catch { setPrescriptions([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function handleDispense() {
    if (!modal.rx || modal.quantity <= 0) { setError('Quantity must be greater than 0'); return }
    setDispensing(true); setError(null)
    try {
      await api.post('/dispense', { prescription_id: modal.rx.id, quantity_dispensed: modal.quantity })
      setPrescriptions((prev) => prev.filter((p) => p.id !== modal.rx!.id))
      setModal({ open: false, rx: null, quantity: 0 })
    } catch (err: any) {
      setError(err.response?.data?.message || 'Dispense failed')
    } finally { setDispensing(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Pill size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dispensing</h1>
          <p className="text-sm text-slate-500">Fill pending prescriptions</p>
        </div>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{prescriptions.length} pending</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle size={48} className="text-emerald-300 mb-3" />
          <p className="text-sm font-medium">All caught up — no pending prescriptions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-800">{rx.drug_name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{rx.dosage} &middot; Prescribed qty: {rx.quantity}</p>
                <p className="text-xs text-slate-400">Patient: {rx.patient_name || 'Unknown'} &middot; {rx.instructions || 'No instructions'}</p>
              </div>
              <button
                onClick={() => setModal({ open: true, rx, quantity: rx.quantity })}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 hover:scale-[1.01] transition-transform flex-shrink-0 ml-4"
              >
                <Pill size={15} /> Dispense
              </button>
            </div>
          ))}
        </div>
      )}

      {modal.open && modal.rx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { if (!dispensing) setModal({ open: false, rx: null, quantity: 0 }) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Pill size={18} className="text-emerald-500" /> Dispense Medication</h3>
              <button onClick={() => setModal({ open: false, rx: null, quantity: 0 })} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-sm text-slate-600"><span className="font-semibold">Drug:</span> {modal.rx.drug_name}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold">Dosage:</span> {modal.rx.dosage}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold">Patient:</span> {modal.rx.patient_name || 'Unknown'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Quantity to Dispense</label>
                <input type="number" min={1} max={modal.rx.quantity} value={modal.quantity}
                  onChange={(e) => setModal((prev) => ({ ...prev, quantity: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">Prescribed quantity: {modal.rx.quantity}</p>
              </div>
              {error && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setModal({ open: false, rx: null, quantity: 0 })}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleDispense} disabled={dispensing || modal.quantity <= 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 hover:scale-[1.01] transition-transform disabled:opacity-50">
                {dispensing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirm Dispense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
