import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import type { Prescription } from '../types'
import ConsultantTag from './ConsultantTag'
import {
  Pill, ClipboardList, CheckCircle, Loader2, AlertTriangle, X, ArrowLeft, Stethoscope, Shield, Search, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface PendingPrescription extends Prescription {
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

const PAGE_SIZE = 25

export default function Dispensing() {
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState<PendingPrescription[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<{ open: boolean; rx: PendingPrescription | null; quantity: number }>({
    open: false, rx: null, quantity: 0,
  })
  const [dispensing, setDispensing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insuranceInfo, setInsuranceInfo] = useState<any>(null)
  const [billToInsurance, setBillToInsurance] = useState(false)
  const [insuranceLoading, setInsuranceLoading] = useState(false)

  const fetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get<PendingPrescription[]>('/prescriptions?status=pending')
      const paidRx = (data || []).filter((rx) => rx.is_paid)
      const withPatients = await Promise.all(
        paidRx.map(async (rx) => {
          try {
            const encResp = await api.get<any>(`/encounters/${rx.encounter_id}`)
            const patResp = await api.get<any>(`/patients/${encResp.data.patient_id}`)
            let doctorName = ''
            if (encResp.data.staff_id) {
              try {
                const docResp = await api.get<any>(`/staff/${encResp.data.staff_id}`)
                doctorName = docResp.data?.name || ''
              } catch {}
            }
            return { ...rx, patient_id: patResp.data.id, patient_name: patResp.data.full_name, hospital_number: patResp.data.hospital_number, phone: patResp.data.phone, doctor_name: doctorName }
          } catch { return { ...rx, patient_name: 'Unknown', doctor_name: '' } }
        })
      )
      setPrescriptions(withPatients)
    } catch { setPrescriptions([]) } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(() => fetch(true), 10000)
    const onFocus = () => fetch(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [fetch])

  const filtered = prescriptions.filter((rx) => {
    if (!search) return true
    var q = search.toLowerCase()
    return (rx.drug_name || '').toLowerCase().includes(q)
      || (rx.dosage || '').toLowerCase().includes(q)
      || (rx.patient_name || '').toLowerCase().includes(q)
      || (rx.hospital_number || '').toLowerCase().includes(q)
      || (rx.phone || '').toLowerCase().includes(q)
      || (rx.doctor_name || '').toLowerCase().includes(q)
      || (rx.instructions || '').toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  async function openDispenseModal(rx: PendingPrescription) {
    setModal({ open: true, rx, quantity: rx.quantity })
    setError(null)
    setBillToInsurance(false)
    setInsuranceInfo(null)
    if (rx.patient_id) {
      setInsuranceLoading(true)
      try {
        const res = await api.get(`/insurance/active-case/${rx.patient_id}`)
        setInsuranceInfo(res.data?.hasActiveCase ? res.data.case : null)
      } catch { setInsuranceInfo(null) }
      finally { setInsuranceLoading(false) }
    }
  }

  async function handleDispense() {
    if (!modal.rx || modal.quantity <= 0) { setError('Quantity must be greater than 0'); return }
    setDispensing(true); setError(null)
    try {
      const payload: any = { prescription_id: modal.rx.id, quantity_dispensed: modal.quantity }
      if (billToInsurance && !modal.rx.is_paid) payload.bill_to_insurance = true
      await api.post('/dispense', payload)
      setPrescriptions((prev) => prev.filter((p) => p.id !== modal.rx!.id))
      setModal({ open: false, rx: null, quantity: 0 })
      setInsuranceInfo(null); setBillToInsurance(false)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Dispense failed')
    } finally { setDispensing(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Pill size={22} className="text-emerald-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dispensing</h1>
          <p className="text-sm text-slate-500">Fill paid prescriptions ready for dispensing</p>
        </div>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{prescriptions.length} paid</span>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search drug, patient name, hospital #, phone, doctor..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle size={48} className="text-emerald-300 mb-3" />
          <p className="text-sm font-medium">All caught up — no paid prescriptions</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Search size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No prescriptions match "{search}"</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paged.map((rx) => (
              <div key={rx.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-slate-800">{rx.drug_name}</p>
                    {rx.is_paid ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700">Unpaid</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{rx.dosage} &middot; Prescribed qty: {rx.quantity}</p>
                  <p className="text-xs text-slate-400">
                    Patient: {rx.patient_name || 'Unknown'}
                    {rx.hospital_number ? ` · ${rx.hospital_number}` : ''}
                    {rx.phone ? ` · ${rx.phone}` : ''}
                    {rx.instructions ? ` · ${rx.instructions}` : ' · No instructions'}
                  </p>
                  {rx.doctor_name && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> Prescribed by: <strong>{rx.doctor_name}</strong>
                    {(rx.is_consultation || rx.doctor_role === 'Consultant') && (
                      <ConsultantTag departmentName={rx.department_name} />
                    )}
                  </p>}
                </div>
                <button
                  onClick={() => openDispenseModal(rx)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 hover:scale-[1.01] transition-transform flex-shrink-0 ml-4"
                >
                  <Pill size={15} /> Dispense
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} prescription(s)</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Page {safePage + 1} <span className="text-slate-400 font-medium">/ {totalPages}</span>
                </span>
                <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
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
                <p className="text-sm text-slate-600"><span className="font-semibold">Patient:</span> {modal.rx.patient_name || 'Unknown'}{modal.rx.hospital_number ? ` · ${modal.rx.hospital_number}` : ''}</p>
                {modal.rx.doctor_name && <p className="text-sm text-slate-600 flex items-center gap-1"><Stethoscope size={14} className="text-slate-400" /><span className="font-semibold">Prescribed by:</span> {modal.rx.doctor_name}
                  {(modal.rx.is_consultation || modal.rx.doctor_role === 'Consultant') && (
                    <ConsultantTag departmentName={modal.rx.department_name} />
                  )}
                </p>}
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><ClipboardList size={12} /> Doctor's Note</p>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
                    {modal.rx.instructions || 'No instructions provided'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Quantity to Dispense</label>
                <input type="number" min={1} max={modal.rx.quantity} value={modal.quantity}
                  onChange={(e) => setModal((prev) => ({ ...prev, quantity: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">Prescribed quantity: {modal.rx.quantity}</p>
              </div>
              {modal.rx.is_paid ? (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> {modal.rx.billed_to_insurance ? 'Billed to insurance' : 'Already paid at Paypoint'}</p>
              ) : insuranceLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Checking insurance...</div>
              ) : insuranceInfo ? (
                <button onClick={() => setBillToInsurance(!billToInsurance)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    billToInsurance
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}>
                  <Shield size={14} />
                  {billToInsurance ? `Billing to ${insuranceInfo.provider_name}` : `Bill to Insurance (${insuranceInfo.provider_name})`}
                </button>
              ) : (
                <p className="text-xs text-slate-400 flex items-center gap-1"><Shield size={12} /> No active insurance case</p>
              )}
              {billToInsurance && (
                <p className="text-xs text-emerald-600">This drug will be billed to {insuranceInfo?.provider_name} — patient will not be charged cash at pharmacy.</p>
              )}
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
