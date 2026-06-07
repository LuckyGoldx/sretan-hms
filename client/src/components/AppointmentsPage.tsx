import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Calendar, Clock, Loader2, Search, Plus, X, CheckCircle, XCircle, User, Stethoscope, FileText
} from 'lucide-react'

const currentUser: { id: string; name: string; role: string } | null = (() => {
  try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
  return null
})()

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [doctors, setDoctors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showBook, setShowBook] = useState(false)
  const [bookForm, setBookForm] = useState({ patient_id: '', doctor_id: '', appointment_date: '', reason: '', notes: '' })
  const [booking, setBooking] = useState(false)
  const [bookDate, setBookDate] = useState(new Date().toISOString().slice(0, 10))
  const [bookHour, setBookHour] = useState('9')
  const [bookMinute, setBookMinute] = useState('00')
  const [bookAmPm, setBookAmPm] = useState<'AM' | 'PM'>('AM')
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'completed' | 'cancelled'; patientName: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [patientSearch, setPatientSearch] = useState('')
  const [doctorSearch, setDoctorSearch] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false)

  const isDoctor = currentUser?.role === 'Doctor'
  const canBook = ['Nurse', 'Records', 'Admin', 'Doctor'].includes(currentUser?.role || '')

  function getEffectiveStatus(a: any): string {
    if (a.status !== 'scheduled') return a.status
    return new Date(a.appointment_date) < new Date() ? 'expired' : 'scheduled'
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (isDoctor && currentUser?.id) params.set('doctor_id', currentUser.id)
        const [aptRes, patRes, docRes] = await Promise.all([
          api.get(`/appointments?${params}`).catch(() => ({ data: [] })),
          api.get('/patients').catch(() => ({ data: [] })),
          api.get('/staff').catch(() => ({ data: [] })),
        ])
        setAppointments(aptRes.data || [])
        setPatients(patRes.data || [])
        setDoctors((docRes.data || []).filter((s: any) => s.role === 'Doctor'))
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [isDoctor])

  async function handleBook() {
    if (!bookForm.patient_id || !bookDate) return
    const hour24 = (parseInt(bookHour) % 12) + (bookAmPm === 'PM' ? 12 : 0)
    const aptDate = `${bookDate}T${String(hour24).padStart(2, '0')}:${bookMinute}:00`
    setBooking(true)
    try {
      await api.post('/appointments', {
        patient_id: bookForm.patient_id,
        doctor_id: bookForm.doctor_id || null,
        appointment_date: aptDate,
        reason: bookForm.reason || null,
        notes: bookForm.notes || null,
        created_by: currentUser?.id || null,
      })
      setShowBook(false)
      setBookForm({ patient_id: '', doctor_id: '', appointment_date: '', reason: '', notes: '' })
      const params = new URLSearchParams()
      if (isDoctor && currentUser?.id) params.set('doctor_id', currentUser.id)
      const aptRes = await api.get(`/appointments?${params}`)
      setAppointments(aptRes.data || [])
    } catch {} finally { setBooking(false) }
  }

  async function handleStatus(id: string, status: string) {
    try {
      await api.put(`/appointments/${id}`, { status })
      setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
    } catch {}
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    setConfirming(true)
    await handleStatus(confirmAction.id, confirmAction.action)
    setConfirmAction(null)
    setConfirming(false)
  }

  const todayApts = [...appointments]
    .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())
    .filter((a) => {
      const effective = getEffectiveStatus(a)
      if (statusFilter) return effective === statusFilter
      if (tab === 'active') return effective === 'scheduled'
      if (selectedDate) {
        const d = new Date(a.appointment_date).toISOString().slice(0, 10)
        if (d !== selectedDate) return false
      }
      return effective !== 'scheduled'
    })

  const stats = {
    scheduled: appointments.filter((a) => getEffectiveStatus(a) === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    expired: appointments.filter((a) => getEffectiveStatus(a) === 'expired').length,
    total: appointments.length,
  }

  const statusStyles: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
    expired: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center"><Calendar size={22} className="text-sky-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Appointments</h1>
            <p className="text-sm text-slate-500">{isDoctor ? 'My schedule' : 'Manage patient appointments'}</p>
          </div>
        </div>
        {canBook && (
          <button onClick={() => setShowBook(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
            <Plus size={16} /> Book Appointment
          </button>
        )}
      </div>

      {!isDoctor && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Scheduled', count: stats.scheduled, color: 'text-blue-600', bg: 'bg-blue-100' },
            { label: 'Completed', count: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
            { label: 'Cancelled', count: stats.cancelled, color: 'text-rose-600', bg: 'bg-rose-100' },
            { label: 'Expired', count: stats.expired, color: 'text-slate-600', bg: 'bg-slate-200' },
            { label: 'Total', count: stats.total, color: 'text-sky-600', bg: 'bg-sky-100' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('active')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'active' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Active ({stats.scheduled})
        </button>
        <button onClick={() => setTab('history')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'history' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          History ({stats.completed + stats.cancelled + stats.expired})
        </button>
      </div>

      {tab === 'active' ? (
        <p className="text-xs text-slate-400">Showing scheduled appointments. Past-due appointments shown as <strong>Expired</strong>.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : todayApts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Calendar size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No appointments for this date</p>
          {canBook && <button onClick={() => setShowBook(true)} className="mt-2 text-sm text-blue-600 underline">Book one now</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {todayApts.map((a) => {
            const dt = new Date(a.appointment_date)
            const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            const effectiveStatus = getEffectiveStatus(a)
            const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-5 py-3 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar size={15} className="text-sky-600" />
                    <span className="text-sm font-semibold text-sky-800">{dateStr}</span>
                    <span className="text-xs text-sky-600">{timeStr}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyles[effectiveStatus] || 'bg-slate-100 text-slate-600'}`}>
                      {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
                    </span>
                  </div>
                  {effectiveStatus === 'scheduled' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setConfirmAction({ id: a.id, action: 'completed', patientName: a.patient_name })}
                        className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors flex items-center gap-1">
                        <CheckCircle size={12} /> Complete
                      </button>
                      <button onClick={() => setConfirmAction({ id: a.id, action: 'cancelled', patientName: a.patient_name })}
                        className="px-3 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors flex items-center gap-1">
                        <XCircle size={12} /> Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Patient</p>
                      <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                        className="font-medium text-slate-800 hover:text-primary transition-colors">{a.patient_name}</button>
                      <p className="text-xs text-slate-400">{a.hospital_number || ''}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Doctor</p>
                      <p className="font-medium text-slate-700">{a.doctor_name || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-400">Reason</p>
                      <p className="text-slate-600">{a.reason || '—'}</p>
                    </div>
                  </div>
                  {a.notes && <p className="mt-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-2">{a.notes}</p>}
                  {a.created_by_name && <p className="mt-1 text-[11px] text-slate-400">Booked by {a.created_by_name}</p>}
                  {effectiveStatus === 'scheduled' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button onClick={() => navigate(`/patient/${a.patient_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"><FileText size={12} /> Chart</button>
                      <button onClick={() => navigate(`/consultation/${a.patient_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors">Consult</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Booking Modal */}
      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!confirming) setConfirmAction(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                {confirmAction.action === 'completed' ? <CheckCircle size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
                {confirmAction.action === 'completed' ? 'Complete Appointment' : 'Cancel Appointment'}
              </h2>
              <button onClick={() => setConfirmAction(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center ${confirmAction.action === 'completed' ? 'bg-emerald-100' : 'bg-rose-100'}">
                {confirmAction.action === 'completed' ? <CheckCircle size={32} className="text-emerald-500" /> : <XCircle size={32} className="text-rose-500" />}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {confirmAction.action === 'completed'
                    ? `Mark ${confirmAction.patientName}'s appointment as completed?`
                    : `Cancel ${confirmAction.patientName}'s appointment?`}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {confirmAction.action === 'completed'
                    ? 'This will mark the appointment as done.'
                    : 'The appointment will be moved to cancelled history.'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setConfirmAction(null)} disabled={confirming}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Go Back</button>
              <button onClick={handleConfirmAction} disabled={confirming}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 ${
                  confirmAction.action === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}>
                {confirming ? <Loader2 size={14} className="animate-spin" /> : confirmAction.action === 'completed' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {confirming ? 'Processing...' : confirmAction.action === 'completed' ? 'Mark Completed' : 'Cancel Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!booking) setShowBook(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Calendar size={18} className="text-sky-500" /> Book Appointment</h2>
              <button onClick={() => { setShowBook(false); setBookForm({ patient_id: '', doctor_id: '', appointment_date: '', reason: '', notes: '' }); setPatientSearch(''); setDoctorSearch(''); setBookHour('9'); setBookMinute('00'); setBookAmPm('AM') }}
                className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-600 mb-1">Patient *</label>
                <input type="text" placeholder="Search patient by name or hospital #..." value={patientSearch || (bookForm.patient_id ? patients.find((p: any) => p.id === bookForm.patient_id)?.full_name || '' : '')}
                  onChange={(e) => { setPatientSearch(e.target.value); setBookForm((p) => ({ ...p, patient_id: '' })); setShowPatientDropdown(true) }}
                  onFocus={() => setShowPatientDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPatientDropdown(false), 200)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                {showPatientDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                    {patients.filter((p: any) => p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) || (p.hospital_number || '').toLowerCase().includes(patientSearch.toLowerCase())).slice(0, 10).map((p: any) => (
                      <button key={p.id} type="button" onMouseDown={() => { setBookForm((f) => ({ ...f, patient_id: p.id })); setPatientSearch(''); setShowPatientDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{p.full_name} <span className="text-slate-400">{p.hospital_number || ''}</span></button>
                    ))}
                    {patients.filter((p: any) => p.full_name.toLowerCase().includes(patientSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2.5 text-sm text-slate-400">No patients found</div>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-slate-600 mb-1">Doctor</label>
                <input type="text" placeholder="Search doctor or leave empty..." value={doctorSearch || (bookForm.doctor_id ? doctors.find((d: any) => d.id === bookForm.doctor_id)?.name || '' : '')}
                  onChange={(e) => { setDoctorSearch(e.target.value); setBookForm((p) => ({ ...p, doctor_id: '' })); setShowDoctorDropdown(true) }}
                  onFocus={() => setShowDoctorDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDoctorDropdown(false), 200)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                {showDoctorDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                    <button key="any" type="button" onMouseDown={() => { setBookForm((f) => ({ ...f, doctor_id: '' })); setDoctorSearch(''); setShowDoctorDropdown(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">— Any available doctor —</button>
                    {doctors.filter((d: any) => d.name.toLowerCase().includes(doctorSearch.toLowerCase())).map((d: any) => (
                      <button key={d.id} type="button" onMouseDown={() => { setBookForm((f) => ({ ...f, doctor_id: d.id })); setDoctorSearch(''); setShowDoctorDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{d.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Date & Time *</label>
                <div className="flex gap-2">
                  <input type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                  <select value={bookHour} onChange={(e) => setBookHour(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="self-center text-slate-400 font-medium">:</span>
                  <select value={bookMinute} onChange={(e) => setBookMinute(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    {['00', '15', '30', '45'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => setBookAmPm(bookAmPm === 'AM' ? 'PM' : 'AM')}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      bookAmPm === 'AM' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'
                    }`}>{bookAmPm}</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Reason</label>
                <textarea value={bookForm.reason} onChange={(e) => setBookForm((p) => ({ ...p, reason: e.target.value }))}
                  className="auto-expand-sm w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Notes</label>
                <textarea value={bookForm.notes} onChange={(e) => setBookForm((p) => ({ ...p, notes: e.target.value }))}
                  className="auto-expand-sm w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => { setShowBook(false); setBookForm({ patient_id: '', doctor_id: '', appointment_date: '', reason: '', notes: '' }); setPatientSearch(''); setDoctorSearch('') }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleBook} disabled={booking || !bookForm.patient_id || !bookForm.appointment_date}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {booking ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
