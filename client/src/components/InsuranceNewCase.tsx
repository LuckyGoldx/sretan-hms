import { useState, useEffect } from 'react'
import { Loader2, ArrowLeft, Search, X } from 'lucide-react'

export default function InsuranceNewCase() {
  const [providers, setProviders] = useState<any[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [form, setForm] = useState({ provider_id: '', auth_code: '', coverage_start: '', coverage_end: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    // Read query params for pre-filling from approved auth
    const params = new URLSearchParams(window.location.search)
    const patientId = params.get('patientId')
    const providerId = params.get('providerId')
    const authCode = params.get('authCode')
    if (providerId) setForm((p: any) => ({ ...p, provider_id: providerId }))
    if (authCode) setForm((p: any) => ({ ...p, auth_code: authCode }))
    if (patientId) {
      (async () => {
        try {
          const { default: api } = await import('../hooks/useAxios')
          const r = await api.get(`/patients/${patientId}`)
          if (r.data) setSelectedPatient(r.data)
        } catch {}
      })()
    }

    (async () => {
      try {
        const { default: api } = await import('../hooks/useAxios')
        const r = await api.get('/insurance/providers')
        setProviders(Array.isArray(r.data) ? r.data : [])
      } catch {}
    })()
  }, [])

  async function searchPatients(q: string) {
    setPatientSearch(q)
    if (q.length < 2) { setPatients([]); return }
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`)
      setPatients(Array.isArray(res.data) ? res.data : [])
    } catch { setPatients([]) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient || !form.provider_id) { setError('Patient and provider are required'); return }
    setSubmitting(true); setError('')
    try {
      const { default: api } = await import('../hooks/useAxios')
      const storedUser = localStorage.getItem('sretan_user')
      const userId = storedUser ? JSON.parse(storedUser).id : null
      await api.post('/insurance/cases', {
        provider_id: form.provider_id,
        patient_id: selectedPatient.id,
        auth_code: form.auth_code || null,
        coverage_start_date: form.coverage_start || null,
        coverage_end_date: form.coverage_end || null,
        notes: form.notes || null,
        created_by: userId,
      })
      setSuccess('Case created successfully!')
      setSelectedPatient(null)
      setForm({ provider_id: '', auth_code: '', coverage_start: '', coverage_end: '', notes: '' })
      setPatientSearch('')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create case')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <a href="/insurance/cases" className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-2xl font-bold text-slate-800">New Insurance Case</h1>
      </div>

      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        {/* Patient Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Patient *</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
              <div>
                <p className="font-medium text-sm">{selectedPatient.full_name}</p>
                <p className="text-xs text-slate-500">{selectedPatient.hospital_number}</p>
              </div>
              <button type="button" onClick={() => { setSelectedPatient(null); setPatients([]) }} className="p-1 rounded hover:bg-slate-200">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={patientSearch} onChange={e => searchPatients(e.target.value)} placeholder="Search by name or hospital #..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
              </div>
              {patients.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {patients.map((p: any) => (
                    <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatients([]); setPatientSearch('') }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <span className="font-medium">{p.full_name}</span>
                      <span className="text-slate-400 ml-2 text-xs">{p.hospital_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Insurance Provider *</label>
          <select value={form.provider_id} onChange={e => setForm(p => ({ ...p, provider_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500">
            <option value="">Select provider...</option>
            {providers.filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </div>

        {/* Auth Code */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Authorization Code</label>
          <input type="text" value={form.auth_code} onChange={e => setForm(p => ({ ...p, auth_code: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-emerald-500" placeholder="e.g. AUTH-7891" />
        </div>

        {/* Coverage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Coverage Start</label>
            <input type="date" value={form.coverage_start} onChange={e => setForm(p => ({ ...p, coverage_start: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Coverage End</label>
            <input type="date" value={form.coverage_end} onChange={e => setForm(p => ({ ...p, coverage_end: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div className="flex justify-end gap-3">
          <a href="/insurance/cases" className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</a>
          <button type="submit" disabled={submitting} className="px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Create Case
          </button>
        </div>
      </form>
    </div>
  )
}
