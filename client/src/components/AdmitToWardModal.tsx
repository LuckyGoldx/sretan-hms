import { useState, useEffect } from 'react'
import { X, Loader2, Home, Plus, AlertTriangle, CheckCircle } from 'lucide-react'
import api from '../hooks/useAxios'

interface WardOption {
  id: string
  name: string
  bed_rate?: number | string
}

interface AdmitToWardModalProps {
  patientId: string
  patientName: string
  onClose: () => void
  onAdmitted?: (admission: any) => void
}

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowTimeString(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatNaira(n: number): string {
  return `₦${Number(n || 0).toLocaleString()}`
}

export default function AdmitToWardModal({ patientId, patientName, onClose, onAdmitted }: AdmitToWardModalProps) {
  const [wards, setWards] = useState<WardOption[]>([])
  const [selectedWard, setSelectedWard] = useState('')
  const [admitTime, setAdmitTime] = useState(nowTimeString())
  const [admitting, setAdmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // GET /wards includes bed_rate resolved from the ward's linked per-night item.
    api.get('/wards')
      .then((r) => setWards(Array.isArray(r.data) ? r.data : []))
      .catch(() => setWards([]))
  }, [])

  const currentStaffId: string | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {}
    return null
  })()
  // Ward nightly prices are only shown to Admin/Paypoint; clinicians just pick a ward.
  const currentRole: string = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role || '' } catch {}
    return ''
  })()
  const canSeeWardPrice = currentRole === 'Admin' || currentRole === 'Paypoint'

  async function handleAdmit() {
    if (!selectedWard) return
    setAdmitting(true)
    setError('')
    try {
      const timePart = admitTime && /^\d{2}:\d{2}$/.test(admitTime) ? admitTime : nowTimeString()
      const local = new Date(`${todayDateString()}T${timePart}`)
      const admittedAt = isNaN(local.getTime()) ? new Date().toISOString() : local.toISOString()
      const res = await api.post('/admissions', {
        patient_id: patientId,
        ward_id: selectedWard,
        admitted_by: currentStaffId,
        admitted_at: admittedAt,
      })
      setSuccess(true)
      onAdmitted?.(res.data)
      setTimeout(() => onClose(), 800)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to admit patient. Please try again.')
    } finally { setAdmitting(false) }
  }

  const selectedWardName = wards.find((w) => w.id === selectedWard)?.name || ''
  const selectedWardRate = selectedWardName ? Number(wards.find((w) => w.id === selectedWard)?.bed_rate || 0) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!admitting && !success) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Home size={18} className="text-indigo-500" />
            Admit Patient
          </h2>
          <button onClick={() => { if (!admitting && !success) onClose() }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2"><CheckCircle size={24} className="text-emerald-600" /></div>
              <p className="text-sm font-semibold text-slate-700">Patient admitted successfully</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-slate-600 mb-1">Patient: <strong>{patientName}</strong></p>
              </div>
              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Admission Date & Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Date (fixed today)</p>
                    <input
                      type="date"
                      value={todayDateString()}
                      disabled
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Time</p>
                    <input
                      type="time"
                      value={admitTime}
                      onChange={(e) => setAdmitTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Bed billing starts at this time and renews every 24 hours while the patient is admitted.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Select Ward</label>
                <select value={selectedWard} onChange={(e) => setSelectedWard(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">-- Choose ward --</option>
                  {wards.map((w) => <option key={w.id} value={w.id}>{w.name}{canSeeWardPrice && Number(w.bed_rate) > 0 ? ` — ${formatNaira(Number(w.bed_rate))}/night` : ''}</option>)}
                </select>
                {selectedWard && canSeeWardPrice && (
                  selectedWardRate > 0 ? (
                    <p className="text-[11px] text-indigo-600 mt-1.5 font-medium">Bed daily rate: {formatNaira(selectedWardRate)}</p>
                  ) : (
                    <p className="text-[11px] text-amber-600 mt-1.5">No bed rate configured for this ward yet. An administrator must add its "Admission (Per Night)" item in Inventory Manager so bed days can accrue.</p>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} disabled={admitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button onClick={handleAdmit} disabled={admitting || !selectedWard}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50">
              {admitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Admit Patient
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
