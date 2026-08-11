import { useState, useEffect } from 'react'
import { Search, Loader2, ExternalLink, Shield, PlusCircle, Eye, User } from 'lucide-react'

export default function InsurancePatients() {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setUser(JSON.parse(u)) } catch {}
    fetchPatients()
  }, [])

  async function fetchPatients(q?: string) {
    setLoading(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const url = q ? `/insurance/patients?search=${encodeURIComponent(q)}` : '/insurance/patients'
      const res = await api.get(url)
      setPatients(Array.isArray(res.data) ? res.data : [])
    } catch { setPatients([]) }
    finally { setLoading(false) }
  }

  function handleSearch() {
    setSearched(true)
    fetchPatients(search || undefined)
  }

  useEffect(() => {
    if (search.length >= 2) {
      const timer = setTimeout(() => { setSearched(true); fetchPatients(search) }, 400)
      return () => clearTimeout(timer)
    } else if (search.length === 0 && searched) {
      fetchPatients()
    }
  }, [search])

  const providerName = user?.provider_id ? 'Provider Patients' : 'All Insurance Patients'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Insurance Patients</h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? '' : `${patients.length} patient${patients.length !== 1 ? 's' : ''} with insurance — ${providerName}`}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search by name or hospital #..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {!loading && patients.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Shield className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm">{search ? `No patients found matching "${search}"` : 'No insured patients yet'}</p>
        </div>
      )}

      {!loading && patients.length > 0 && (
        <div className="space-y-3">
          {patients.map((p: any) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-800">{p.full_name}</h3>
                    {p.active_cases > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <Shield className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.hospital_number} &middot; {p.sex || '—'}
                    {p.dob && <span> &middot; {p.dob?.slice(0, 10)}</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                    <span>{p.total_cases || 0} case{(p.total_cases || 0) !== 1 ? 's' : ''}</span>
                    {p.active_cases > 0 && <span className="text-emerald-600 font-medium">{p.active_cases} active</span>}
                    {p.primary_provider && <span className="text-slate-600 font-medium">{p.primary_provider}{p.coverage_tag === 'primary' ? ' (Primary)' : ''}</span>}
                    {!p.primary_provider && p.insurance_type && <span className="text-slate-400">{p.insurance_type}{p.insurance && p.insurance !== '__other__' ? ` (${p.insurance})` : ''}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={`/insurance/cases?patientId=${p.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition-all">
                    <Eye className="w-3.5 h-3.5" /> Cases
                  </a>
                  <a href={`/insurance/cases/new`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all">
                    <PlusCircle className="w-3.5 h-3.5" /> New Case
                  </a>
                  <a href={`/insurance/patients/${p.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-all">
                    <Shield className="w-3.5 h-3.5" /> Insurance
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
