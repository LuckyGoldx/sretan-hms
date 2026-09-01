import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Plus, X, Loader2, Cloud, Wifi, WifiOff, ChevronRight
} from 'lucide-react'
import api from '../hooks/superadminApi'

type DeploymentMode = 'CLOUD_SAAS' | 'OFFLINE_STANDALONE' | 'PRIVATE_SUPABASE'

interface Tenant {
  id: string
  hospital_name: string
  subscription_status: string
  subscription_tier: string
  created_at: string
  primary_brand_color: string | null
  ui_theme_class: string | null
  deployment_mode: string | null
  module_records: boolean | null
  module_triage: boolean | null
  module_consultation: boolean | null
  module_laboratory: boolean | null
  module_pharmacy: boolean | null
  module_radiology: boolean | null
  module_finance_hmo: boolean | null
  staff_count: number
  patient_count: number
  encounter_count: number
}

const MODULES = [
  { key: 'module_records', label: 'Records' },
  { key: 'module_triage', label: 'Triage' },
  { key: 'module_doctor', label: 'Doctor' },
  { key: 'module_nurses', label: 'Nurses' },
  { key: 'module_consultants', label: 'Consultants' },
  { key: 'module_consultation', label: 'Consultation' },
  { key: 'module_laboratory', label: 'Laboratory' },
  { key: 'module_pharmacy', label: 'Pharmacy' },
  { key: 'module_radiology', label: 'Radiology' },
  { key: 'module_finance_hmo', label: 'Finance/HMO' },
  { key: 'module_maternity', label: 'Maternity' },
  { key: 'module_insurance', label: 'Insurance' },
  { key: 'module_referrals', label: 'Referrals' },
  { key: 'module_appointments', label: 'Appointments' },
  { key: 'module_admissions', label: 'Admissions' },
  { key: 'module_paypoint', label: 'Paypoint' },
  { key: 'module_store', label: 'Store / Walk-in Sales' },
]

function DeploymentBadge({ mode }: { mode: string | null }) {
  const styles: Record<string, { label: string; bg: string; text: string; icon: any }> = {
    CLOUD_SAAS: { label: 'Cloud SaaS', bg: 'bg-blue-100', text: 'text-blue-700', icon: Cloud },
    OFFLINE_STANDALONE: { label: 'Offline Standalone', bg: 'bg-amber-100', text: 'text-amber-700', icon: WifiOff },
    PRIVATE_SUPABASE: { label: 'Private Cloud', bg: 'bg-purple-100', text: 'text-purple-700', icon: Wifi },
  }
  const s = styles[mode || ''] || { label: 'Not configured', bg: 'bg-slate-100', text: 'text-slate-600', icon: Cloud }
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  )
}

export default function SuperAdminTenants() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newHospitalName, setNewHospitalName] = useState('')
  const [adding, setAdding] = useState(false)

  async function fetchTenants() {
    setLoading(true)
    try {
      const res = await api.get('/superadmin/tenants')
      setTenants(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTenants() }, [])

  async function handleAddHospital() {
    if (!newHospitalName.trim()) return
    setAdding(true)
    try {
      await api.post('/superadmin/tenants', { hospital_name: newHospitalName.trim() })
      setShowAddModal(false)
      setNewHospitalName('')
      await fetchTenants()
    } catch {}
    setAdding(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hospitals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select a hospital (tenant) to view its modules, staff, admin accounts, settings, and per-hospital backups
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/superadmin/setup')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Plus className="w-4 h-4" />
            Setup Hospital
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all"
          >
            <Building2 className="w-4 h-4" />
            Add Hospital
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No hospitals registered yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tenants.map((t) => {
            const activeModules = MODULES.filter((m) => (t as any)[m.key]).map((m) => m.label)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/superadmin/hospitals/${t.id}`)}
                className="relative text-left w-full p-5 rounded-2xl border border-slate-200 bg-white hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-offset-1"
                    style={{ backgroundColor: t.primary_brand_color || '#2563eb' }}
                  />
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{t.hospital_name}</h3>
                  <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {activeModules.length ? activeModules.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">{m}</span>
                  )) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 text-[10px] font-medium">No modules</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    <span className="text-slate-700 capitalize">{t.subscription_tier || '—'}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    Staff: <span className="text-slate-700">{t.staff_count}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    Patients: <span className="text-slate-700">{t.patient_count}</span>
                  </span>
                  <DeploymentBadge mode={t.deployment_mode} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!adding) setShowAddModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Add Hospital</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Name</label>
              <input
                type="text"
                value={newHospitalName}
                onChange={(e) => setNewHospitalName(e.target.value)}
                placeholder="Enter hospital/clinic name"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddHospital() }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2">Use "Setup Hospital" for a full end-to-end configuration with departments and a default admin.</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleAddHospital} disabled={adding || !newHospitalName.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--primary-color)' }}>
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {adding ? 'Adding...' : 'Add Hospital'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
