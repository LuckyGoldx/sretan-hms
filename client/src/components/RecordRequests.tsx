import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { FileText, Search, X, Loader2, CheckCircle, XCircle, Clock, ArrowLeft, User, Plus } from 'lucide-react'

export default function RecordRequests() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ patient_id: '', patient_search: '', requester_name: '', requester_contact: '', purpose: '', notes: '' })
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)
    try {
      const res = await api.get('/record-requests')
      setRequests(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function handleSubmit() {
    if (!form.patient_id || !form.requester_name) return
    setSubmitting(true)
    try {
      await api.post('/record-requests', {
        patient_id: form.patient_id,
        requester_name: form.requester_name,
        requester_contact: form.requester_contact || null,
        purpose: form.purpose || null,
        notes: form.notes || null,
      })
      setShowForm(false)
      setForm({ patient_id: '', patient_search: '', requester_name: '', requester_contact: '', purpose: '', notes: '' })
      loadRequests()
    } catch {} finally { setSubmitting(false) }
  }

  async function handleStatus(id: string, status: string) {
    try {
      await api.put(`/record-requests/${id}`, { status, approved_by: currentUser?.id })
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status, approved_by_name: currentUser?.name } : r))
    } catch {}
  }

  async function searchPatient(q: string) {
    if (q.length < 2) { setPatientSearchResults([]); return }
    try {
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`)
      setPatientSearchResults(res.data || [])
    } catch {}
  }

  const filtered = requests.filter((r) => {
    if (filter && r.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.patient_name?.toLowerCase().includes(q) || r.requester_name?.toLowerCase().includes(q)
    }
    return true
  })

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', fulfilled: 'bg-emerald-100 text-emerald-700', approved: 'bg-blue-100 text-blue-700', rejected: 'bg-rose-100 text-rose-700' }
    return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${map[s] || 'bg-slate-100 text-slate-600'}`}>{s}</span>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div><h1 className="text-xl font-semibold text-slate-800">Record Requests</h1><p className="text-sm text-slate-400">Medical record release requests and tracking</p></div>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><Plus size={15} /> New Request</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by patient or requester..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
        </div>
        {['', 'pending', 'approved', 'fulfilled', 'rejected'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-primary text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{s || 'All'}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400"><FileText size={48} className="text-slate-300 mb-3" /><p className="text-sm font-medium">No record requests found</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Patient</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Requester</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Purpose</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <button onClick={() => navigate(`/patient/${r.patient_id}`)}
                        className="font-medium text-slate-800 hover:text-primary transition-colors text-sm">{r.patient_name}</button>
                      <p className="text-xs text-slate-400">{r.hospital_number}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-slate-700">{r.requester_name}</p>
                      {r.requester_contact && <p className="text-xs text-slate-400">{r.requester_contact}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 max-w-[200px] truncate">{r.purpose || '—'}</td>
                    <td className="px-5 py-3.5">{statusBadge(r.status)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {r.fulfilled_at && <><br /><span className="text-emerald-500">Fulfilled: {new Date(r.fulfilled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {r.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleStatus(r.id, 'approved')} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"><CheckCircle size={14} /></button>
                          <button onClick={() => handleStatus(r.id, 'fulfilled')} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-500"><CheckCircle size={14} /></button>
                          <button onClick={() => handleStatus(r.id, 'rejected')} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><XCircle size={14} /></button>
                        </div>
                      )}
                      {r.status === 'approved' && (
                        <button onClick={() => handleStatus(r.id, 'fulfilled')} className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100">Mark Fulfilled</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setShowForm(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> New Record Request</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Search Patient *</label>
                <input type="text" placeholder="Type patient name or hospital number..." value={form.patient_search}
                  onChange={(e) => { setForm((p) => ({ ...p, patient_search: e.target.value, patient_id: '' })); searchPatient(e.target.value) }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                {patientSearchResults.length > 0 && (
                  <div className="mt-1 bg-white rounded-xl border border-slate-200 shadow-sm max-h-40 overflow-y-auto">
                    {patientSearchResults.map((p: any) => (
                      <button key={p.id} onClick={() => { setForm((prev) => ({ ...prev, patient_id: p.id, patient_search: `${p.full_name} (${p.hospital_number})` })); setPatientSearchResults([]) }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                        <span className="font-medium text-slate-800">{p.full_name}</span>
                        <span className="text-slate-400 ml-2">{p.hospital_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Requester Name *</label>
                  <input type="text" placeholder="e.g. John Doe, Insurance Co." value={form.requester_name}
                    onChange={(e) => setForm((p) => ({ ...p, requester_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contact Info</label>
                  <input type="text" placeholder="Phone or email" value={form.requester_contact}
                    onChange={(e) => setForm((p) => ({ ...p, requester_contact: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Purpose</label>
                <select value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select purpose...</option>
                  <option value="Insurance Claim">Insurance Claim</option>
                  <option value="Legal/Subpoena">Legal / Subpoena</option>
                  <option value="Patient Copy">Patient Copy</option>
                  <option value="Transfer Referral">Transfer / Referral</option>
                  <option value="Employment">Employment</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} placeholder="Additional notes..." value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting || !form.patient_id || !form.requester_name}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
