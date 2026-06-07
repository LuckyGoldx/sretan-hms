import { useState, useEffect } from 'react'
import {
  Building2, Palette, Cloud, Wifi, WifiOff, Save, Plus, X, Loader2, CheckCircle, Trash2
} from 'lucide-react'
import api from '../hooks/useAxios'

type DeploymentMode = 'CLOUD_SAAS' | 'OFFLINE_STANDALONE' | 'PRIVATE_SUPABASE'

interface Tenant {
  id: string
  hospital_name: string
  subscription_status: string
  subscription_tier: string
  created_at: string
}

interface TenantConfig {
  id: string
  tenant_id: string
  primary_brand_color: string
  secondary_brand_color: string
  ui_theme_class: string
  deployment_mode: DeploymentMode
  cloud_sync_enabled: boolean
  private_supabase_url: string | null
  private_supabase_anon_key: string | null
  module_records: boolean
  module_triage: boolean
  module_consultation: boolean
  module_laboratory: boolean
  module_pharmacy: boolean
  module_radiology: boolean
  module_finance_hmo: boolean
}

const MODULES = [
  { key: 'module_records', label: 'Records' },
  { key: 'module_triage', label: 'Triage' },
  { key: 'module_consultation', label: 'Consultation' },
  { key: 'module_laboratory', label: 'Laboratory' },
  { key: 'module_pharmacy', label: 'Pharmacy' },
  { key: 'module_radiology', label: 'Radiology' },
  { key: 'module_finance_hmo', label: 'Finance/HMO' },
]

const THEME_CLASSES = [
  { value: 'theme-trust-blue', label: 'Trust Blue' },
  { value: 'theme-emerald-green', label: 'Emerald Green' },
  { value: 'theme-charcoal-clinical', label: 'Charcoal Clinical' },
  { value: 'theme-royal-purple', label: 'Royal Purple' },
]

const DEFAULT_MODULES: Record<string, boolean> = {
  module_records: true, module_triage: true, module_consultation: true,
  module_laboratory: false, module_pharmacy: false,
  module_radiology: false, module_finance_hmo: false,
}

const MOCK_HOSPITALS: Tenant[] = [
  { id: 'mock-h1', hospital_name: 'Lagos General Hospital', subscription_status: 'active', subscription_tier: 'premium', created_at: '2026-01-15T00:00:00Z' },
  { id: 'mock-h2', hospital_name: 'Abuja Medical Center', subscription_status: 'active', subscription_tier: 'standard', created_at: '2026-02-20T00:00:00Z' },
  { id: 'mock-h3', hospital_name: 'Port Harcourt Clinic', subscription_status: 'active', subscription_tier: 'enterprise', created_at: '2026-03-10T00:00:00Z' },
]

const MOCK_CONFIGS: Record<string, Partial<TenantConfig>> = {
  'mock-h1': { primary_brand_color: '#2563eb', ui_theme_class: 'theme-trust-blue', deployment_mode: 'CLOUD_SAAS', module_records: true, module_triage: true, module_consultation: true, module_laboratory: true, module_pharmacy: true, module_radiology: true, module_finance_hmo: true },
  'mock-h2': { primary_brand_color: '#059669', ui_theme_class: 'theme-emerald-green', deployment_mode: 'OFFLINE_STANDALONE', module_records: true, module_triage: true, module_consultation: true, module_laboratory: false, module_pharmacy: true, module_radiology: false, module_finance_hmo: false },
  'mock-h3': { primary_brand_color: '#7c3aed', ui_theme_class: 'theme-royal-purple', deployment_mode: 'PRIVATE_SUPABASE', module_records: true, module_triage: false, module_consultation: true, module_laboratory: true, module_pharmacy: true, module_radiology: true, module_finance_hmo: false, private_supabase_url: 'https://supabase.phc.example.com', private_supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' },
}

function DeploymentBadge({ mode }: { mode: DeploymentMode }) {
  const styles: Record<DeploymentMode, { label: string; bg: string; text: string; icon: typeof Cloud }> = {
    CLOUD_SAAS: { label: 'Cloud SaaS', bg: 'bg-blue-100', text: 'text-blue-700', icon: Cloud },
    OFFLINE_STANDALONE: { label: 'Offline Standalone', bg: 'bg-amber-100', text: 'text-amber-700', icon: WifiOff },
    PRIVATE_SUPABASE: { label: 'Private Cloud', bg: 'bg-purple-100', text: 'text-purple-700', icon: Wifi },
  }
  const s = styles[mode]
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  )
}

export default function SuperAdminPortal() {
  const [tenants, setTenants] = useState<Tenant[]>(MOCK_HOSPITALS)
  const [configs, setConfigs] = useState<Record<string, TenantConfig>>(MOCK_CONFIGS as any)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newHospitalName, setNewHospitalName] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [editColor, setEditColor] = useState('#2563eb')
  const [editTheme, setEditTheme] = useState('theme-trust-blue')
  const [editModules, setEditModules] = useState<Record<string, boolean>>({ ...DEFAULT_MODULES })
  const [editDeployment, setEditDeployment] = useState<DeploymentMode>('CLOUD_SAAS')
  const [editSupabaseUrl, setEditSupabaseUrl] = useState('')
  const [editSupabaseKey, setEditSupabaseKey] = useState('')

  useEffect(() => { fetchTenants() }, [])

  async function fetchTenants() {
    setLoading(true)
    try {
      const res = await api.get('/tenants')
      const dbTenants: Tenant[] = res.data
      const mockTenants: Tenant[] = MOCK_HOSPITALS.filter(
        (m) => !dbTenants.some((d) => d.hospital_name === m.hospital_name)
      )
      const merged = [...dbTenants, ...mockTenants].slice(0, 6)
      setTenants(merged)
      const configMap: Record<string, TenantConfig> = { ...MOCK_CONFIGS } as any
      for (const t of dbTenants) {
        try {
          const c = await api.get(`/tenants/${t.id}/config`)
          if (c.data) configMap[t.id] = c.data
        } catch {}
      }
      setConfigs(configMap)
    } catch {
      setTenants(MOCK_HOSPITALS)
      setConfigs(MOCK_CONFIGS as any)
    } finally {
      setLoading(false)
    }
  }

  const selected = tenants.find((t) => t.id === selectedId) ?? null

  function selectTenant(t: Tenant) {
    setSelectedId(t.id)
    const cfg = configs[t.id]
    setEditColor(cfg?.primary_brand_color || '#2563eb')
    setEditTheme(cfg?.ui_theme_class || 'theme-trust-blue')
    setEditModules({
      module_records: cfg?.module_records ?? true,
      module_triage: cfg?.module_triage ?? true,
      module_consultation: cfg?.module_consultation ?? true,
      module_laboratory: cfg?.module_laboratory ?? false,
      module_pharmacy: cfg?.module_pharmacy ?? false,
      module_radiology: cfg?.module_radiology ?? false,
      module_finance_hmo: cfg?.module_finance_hmo ?? false,
    })
    setEditDeployment(cfg?.deployment_mode || 'CLOUD_SAAS')
    setEditSupabaseUrl(cfg?.private_supabase_url || '')
    setEditSupabaseKey(cfg?.private_supabase_anon_key || '')
    setSaveMessage('')
  }

  async function handleAddHospital() {
    if (!newHospitalName.trim()) return
    setAdding(true)
    try {
      await api.post('/tenants', { hospital_name: newHospitalName.trim() })
      setShowAddModal(false)
      setNewHospitalName('')
      await fetchTenants()
    } catch {}
    setAdding(false)
  }

  async function handleDeleteHospital() {
    if (!selected) return
    setDeleting(true)
    try {
      if (!selected.id.startsWith('mock-')) {
        await api.delete(`/tenants/${selected.id}`)
      }
      setTenants((prev) => prev.filter((t) => t.id !== selected.id))
      setSelectedId(null)
      setShowDeleteConfirm(false)
    } catch {}
    setDeleting(false)
  }

  async function handleSave() {
    if (!selected) return
    if (selected.id.startsWith('mock-')) {
      setSaveMessage('Mock hospital — config display only')
      return
    }
    setSaving(true)
    setSaveMessage('')
    try {
      await api.post(`/tenants/${selected.id}/config`, {
        primary_brand_color: editColor,
        ui_theme_class: editTheme,
        deployment_mode: editDeployment,
        cloud_sync_enabled: editDeployment !== 'OFFLINE_STANDALONE',
        private_supabase_url: editSupabaseUrl || null,
        private_supabase_anon_key: editSupabaseKey || null,
        ...editModules,
      })
      document.documentElement.className = editTheme
      document.documentElement.style.setProperty('--primary-color', editColor)
      setSaveMessage('Configuration saved successfully')
      await fetchTenants()
    } catch {
      setSaveMessage('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Super Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Cloud-wide hospital configuration and deployment management</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <Plus className="w-4 h-4" />
          Add Hospital
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No hospitals registered yet</p>
          <p className="text-xs mt-1">Click "Add Hospital" to register the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {tenants.map((t) => {
            const cfg = configs[t.id]
            const activeModules = MODULES.filter((m) => cfg?.[m.key as keyof TenantConfig]).map((m) => m.label)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTenant(t)}
                className={`relative text-left w-full p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  selectedId === t.id
                    ? 'border-blue-500 ring-2 ring-blue-100 bg-white shadow-md'
                    : 'border-slate-200 bg-white hover:shadow-md hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-offset-1"
                    style={{ backgroundColor: cfg?.primary_brand_color || '#2563eb' }}
                  />
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{t.hospital_name}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {activeModules.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">{m}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Tier: <span className="text-slate-700">{t.subscription_tier}</span>
                  </span>
                  <DeploymentBadge mode={cfg?.deployment_mode || 'CLOUD_SAAS'} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{selected.hospital_name}</h2>
                <p className="text-xs text-slate-400">ID: {selected.id}</p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-all duration-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-5 h-5 text-slate-600" />
              <h3 className="text-base font-semibold text-slate-800">Migration Control Deck</h3>
            </div>
            <div className="flex gap-2 mb-6">
              {(['CLOUD_SAAS', 'OFFLINE_STANDALONE', 'PRIVATE_SUPABASE'] as DeploymentMode[]).map((mode) => {
                const labels: Record<DeploymentMode, string> = {
                  CLOUD_SAAS: 'Cloud SaaS', OFFLINE_STANDALONE: 'Offline Standalone', PRIVATE_SUPABASE: 'Private Cloud',
                }
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEditDeployment(mode)}
                    className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                      editDeployment === mode
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {labels[mode]}
                  </button>
                )
              })}
            </div>

            {editDeployment === 'CLOUD_SAAS' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">Sync enabled</span>
              </div>
            )}
            {editDeployment === 'OFFLINE_STANDALONE' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                <WifiOff className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">This will disable cloud sync</span>
              </div>
            )}
            {editDeployment === 'PRIVATE_SUPABASE' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Supabase URL</label>
                  <input type="text" value={editSupabaseUrl} onChange={(e) => setEditSupabaseUrl(e.target.value)}
                    placeholder="https://supabase.yourdomain.com"
                    className="w-full max-w-lg px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Anon Key</label>
                  <input type="text" value={editSupabaseKey} onChange={(e) => setEditSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                    className="w-full max-w-lg px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Palette className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Dynamic Theme Customizer</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Primary Brand Color</label>
                <div className="flex gap-3 items-center">
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                  <input type="text" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Theme Class</label>
                <select value={editTheme} onChange={(e) => setEditTheme(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                  {THEME_CLASSES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 p-4 rounded-xl bg-slate-50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: editColor }} />
              <div className="text-sm">
                <p className="font-medium text-slate-700">Preview</p>
                <p className="text-xs text-slate-400">Applied theme: {THEME_CLASSES.find((t) => t.value === editTheme)?.label}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Module Toggles</h2>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setEditModules((prev) => ({ ...prev, [m.key]: !prev[m.key] }))}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer ${
                    editModules[m.key]
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'bg-gray-200 text-slate-500 hover:bg-gray-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${editModules[m.key] ? 'bg-white' : 'bg-slate-400'}`} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            {saveMessage && (
              <span className={`text-sm font-medium flex items-center gap-1 ${saveMessage.includes('success') ? 'text-emerald-600' : 'text-rose-600'}`}>
                <CheckCircle className="w-4 h-4" />
                {saveMessage}
              </span>
            )}
          </div>
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
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

      {showDeleteConfirm && selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!deleting) setShowDeleteConfirm(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Delete Hospital</h2>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 p-4 bg-rose-50 rounded-xl border border-rose-200">
                <Trash2 className="w-5 h-5 text-rose-500 flex-shrink-0" />
                <p className="text-sm text-rose-700">
                  Are you sure you want to delete <strong>{selected.hospital_name}</strong>? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button onClick={handleDeleteHospital} disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium bg-rose-600 hover:bg-rose-700 transition-all duration-200 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
