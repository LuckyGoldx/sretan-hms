import { useState, useEffect } from 'react'
import { Loader2, Plus, Search, Shield, CheckCircle, XCircle, Eye, ExternalLink, AlertTriangle, X } from 'lucide-react'

export default function InsuranceAuthRequests() {
  const [requests, setRequests] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ provider_id: '', patient_search: '', patient_id: '', requested_services: '', estimated_amount: '', clinical_justification: '' })
  const [patientResults, setPatientResults] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showResponse, setShowResponse] = useState<any>(null)
  const [responseForm, setResponseForm] = useState({ status: 'approved', auth_code: '', authorized_amount: '', validity_start: '', validity_end: '', response_notes: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [reqRes, provRes] = await Promise.all([
        api.get('/insurance/auth-requests'),
        api.get('/insurance/providers'),
      ])
      setRequests(Array.isArray(reqRes.data) ? reqRes.data : [])
      setProviders(Array.isArray(provRes.data) ? provRes.data : [])
    } catch {} finally { setLoading(false) }
  }

  async function searchPatients(q: string) {
    setForm(p => ({ ...p, patient_search: q }))
    if (q.length < 2) { setPatientResults([]); return }
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`)
      setPatientResults(Array.isArray(res.data) ? res.data : [])
    } catch { setPatientResults([]) }
  }

  async function createRequest() {
    if (!selectedPatient || !form.provider_id) { setError('Patient and provider are required'); return }
    setSaving(true); setError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.post('/insurance/auth-requests', {
        provider_id: form.provider_id,
        patient_id: selectedPatient.id,
        requested_services: form.requested_services,
        estimated_amount: form.estimated_amount ? parseFloat(form.estimated_amount) : null,
        clinical_justification: form.clinical_justification,
      })
      setShowCreate(false)
      resetForm()
      await loadData()
    } catch (err: any) { setError(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  async function submitResponse() {
    if (!showResponse || !responseForm.status) return
    setSaving(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.put(`/insurance/auth-requests/${showResponse.id}`, responseForm)
      setShowResponse(null)
      await loadData()
    } catch (err: any) { alert(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  function resetForm() {
    setForm({ provider_id: '', patient_search: '', patient_id: '', requested_services: '', estimated_amount: '', clinical_justification: '' })
    setSelectedPatient(null)
    setPatientResults([])
    setError('')
  }

  const filtered = requests.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterProvider && r.provider_id !== filterProvider) return false
    return true
  })

  const stats = { pending: requests.filter(r => ['requested', 'submitted_to_hmo'].includes(r.status)).length, approved: requests.filter(r => r.status === 'approved').length, denied: requests.filter(r => r.status === 'denied').length }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Authorization Requests</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          <p className="text-xs text-slate-500">Pending</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
          <p className="text-xs text-slate-500">Approved</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-rose-600">{stats.denied}</p>
          <p className="text-xs text-slate-500">Denied</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Providers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Request #</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Patient</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Services</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Est. Amount</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Auth Code</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req: any) => (
                <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-[10px] font-bold">{req.request_number}</td>
                  <td className="py-3 px-4">{req.patient_name || '—'}</td>
                  <td className="py-3 px-4">{req.provider_name || '—'}</td>
                  <td className="py-3 px-4 text-xs text-slate-500 max-w-[150px] truncate">{req.requested_services || '—'}</td>
                  <td className="py-3 px-4 text-right font-medium">₦{Number(req.estimated_amount || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-center font-mono text-xs">{req.auth_code || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.status === 'denied' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(req.status === 'requested' || req.status === 'submitted_to_hmo') && (
                        <button onClick={() => { setShowResponse(req); setResponseForm({ status: 'approved', auth_code: '', authorized_amount: '', validity_start: '', validity_end: '', response_notes: '' }) }}
                          className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                          Respond
                        </button>
                      )}
                      {req.status === 'approved' && (
                        <a href={`/insurance/cases/new?patientId=${req.patient_id}&providerId=${req.provider_id}&authCode=${req.auth_code || ''}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                          <Plus className="w-3 h-3" /> Create Case
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400">No auth requests found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Request Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">New Authorization Request</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
                    <span className="text-sm font-medium">{selectedPatient.full_name} ({selectedPatient.hospital_number})</span>
                    <button onClick={() => { setSelectedPatient(null); setForm(p => ({ ...p, patient_search: '' })); setPatientResults([]) }}
                      className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
                  </div>
                ) : (
                  <input type="text" value={form.patient_search} onChange={e => searchPatients(e.target.value)}
                    placeholder="Search by name or hospital #..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                )}
                {patientResults.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                    {patientResults.map((p: any) => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientResults([]); setForm(pf => ({ ...pf, patient_search: '' })) }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b last:border-0">
                        {p.full_name} <span className="text-slate-400 text-xs">{p.hospital_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                <select value={form.provider_id} onChange={e => setForm(p => ({ ...p, provider_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="">Select...</option>
                  {providers.filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Requested Services</label>
                <textarea value={form.requested_services} onChange={e => setForm(p => ({ ...p, requested_services: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="e.g. General Consultation, Lab: Malaria Test, Admission: General Ward" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Amount (₦)</label>
                <input type="number" min="0" value={form.estimated_amount} onChange={e => setForm(p => ({ ...p, estimated_amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clinical Justification</label>
                <textarea value={form.clinical_justification} onChange={e => setForm(p => ({ ...p, clinical_justification: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Reason for this authorization request..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => { setShowCreate(false); resetForm() }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={createRequest} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Response Modal */}
      {showResponse && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowResponse(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Respond to {showResponse.request_number}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select value={responseForm.status} onChange={e => setResponseForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="partial">Partially Approved</option>
                </select>
              </div>
              {responseForm.status !== 'denied' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Auth Code</label>
                    <input type="text" value={responseForm.auth_code} onChange={e => setResponseForm(p => ({ ...p, auth_code: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono" placeholder="AUTH-2026-XXXXX" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Authorized Amount (₦)</label>
                    <input type="number" min="0" value={responseForm.authorized_amount} onChange={e => setResponseForm(p => ({ ...p, authorized_amount: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Valid From</label>
                      <input type="date" value={responseForm.validity_start} onChange={e => setResponseForm(p => ({ ...p, validity_start: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
                      <input type="date" value={responseForm.validity_end} onChange={e => setResponseForm(p => ({ ...p, validity_end: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Response Notes</label>
                <textarea value={responseForm.response_notes} onChange={e => setResponseForm(p => ({ ...p, response_notes: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Reason for approval/denial..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowResponse(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={submitResponse} disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl disabled:opacity-60 ${
                  responseForm.status === 'denied' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {responseForm.status === 'denied' ? 'Deny Request' : responseForm.status === 'approved' ? 'Approve Request' : 'Save Response'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
