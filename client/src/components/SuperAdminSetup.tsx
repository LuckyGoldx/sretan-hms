import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Save, Loader2, CheckCircle, Upload, Palette, Cloud,
  ShieldCheck, LogIn, Pencil, Eye, EyeOff, WifiOff, Server
} from 'lucide-react'
import api from '../hooks/superadminApi'
import { THEMES, getThemeDef } from '../utils/themes'

type DeploymentMode = 'OFFLINE_STANDALONE' | 'CLOUD_SAAS' | 'PRIVATE_SUPABASE'

interface Tenant {
  id: string
  hospital_name: string
  address?: string | null
  phone_number?: string | null
  currency_symbol?: string | null
  primary_brand_color?: string | null
  secondary_brand_color?: string | null
  ui_theme_class?: string | null
  deployment_mode?: string | null
  cloud_sync_enabled?: boolean | null
  private_supabase_url?: string | null
  private_supabase_anon_key?: string | null
  module_records?: boolean | null
  module_triage?: boolean | null
  module_consultation?: boolean | null
  module_laboratory?: boolean | null
  module_pharmacy?: boolean | null
  module_radiology?: boolean | null
  module_finance_hmo?: boolean | null
  module_maternity?: boolean | null
  module_insurance?: boolean | null
  module_referrals?: boolean | null
  module_appointments?: boolean | null
  module_admissions?: boolean | null
  module_paypoint?: boolean | null
  module_store?: boolean | null
  module_doctor?: boolean | null
  module_nurses?: boolean | null
  module_consultants?: boolean | null
  hospital_number_prefix?: string | null
  hospital_number_include_year?: boolean | null
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

const TIERS = [
  { value: 'standard', label: 'Standard', desc: 'Core hospital modules — Records, Triage, Doctor, Nurses, Consultation.' },
  { value: 'premium', label: 'Premium', desc: 'Adds Laboratory, Pharmacy, Radiology, Paypoint, Finance/HMO and Store.' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Adds Maternity, Insurance, Referrals/Consultants, Appointments and Admissions.' },
]
const STATUSES = [
  { value: 'active', label: 'Active', desc: 'Hospital is fully operational and staff can log in.' },
  { value: 'trial', label: 'Trial', desc: 'Active on a trial basis — good for evaluation deployments.' },
  { value: 'suspended', label: 'Suspended', desc: 'Hospital is disabled — staff login is blocked until re-activated.' },
]
const DEPLOYMENTS = [
  { value: 'OFFLINE_STANDALONE', label: 'Offline Standalone', desc: 'Everything runs locally on this machine. No internet or cloud sync required.' },
  { value: 'CLOUD_SAAS', label: 'Cloud SaaS', desc: 'Hosted multi-tenant mode managed by the provider with automatic cloud sync.' },
  { value: 'PRIVATE_SUPABASE', label: 'Private Cloud (Supabase)', desc: 'Syncs to your own Supabase instance using the URL and anon key below.' },
] as const

const emptyModules: Record<string, boolean> = {
  module_records: true, module_triage: true, module_consultation: true,
  module_doctor: false, module_nurses: false, module_consultants: false,
  module_laboratory: false, module_pharmacy: false,
  module_radiology: false, module_finance_hmo: false,
  module_maternity: false, module_insurance: false, module_referrals: false,
  module_appointments: false, module_admissions: false,
  module_paypoint: false, module_store: false,
}

export default function SuperAdminSetup() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    hospital_name: '', address: '', phone_number: '', currency_symbol: '₦',
    subscription_tier: 'standard', subscription_status: 'active',
    hospital_number_prefix: 'SRT', hospital_number_include_year: true,
    primary_brand_color: '#2563eb', secondary_brand_color: '#10b981', ui_theme_class: 'theme-trust-blue',
    deployment_mode: 'OFFLINE_STANDALONE' as DeploymentMode,
    private_supabase_url: '', private_supabase_anon_key: '',
    set_active: true,
    admin_name: '', admin_username: '', admin_email: '', admin_password: '',
  })
  const [modules, setModules] = useState<Record<string, boolean>>({ ...emptyModules })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [showAdminPassword, setShowAdminPassword] = useState(false)

  useEffect(() => {
    api.get('/superadmin/tenants')
      .then((res) => setTenants(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function loadTenant(t: Tenant) {
    setForm({
      hospital_name: t.hospital_name || '',
      address: t.address || '',
      phone_number: t.phone_number || '',
      currency_symbol: t.currency_symbol || '₦',
      subscription_tier: 'standard',
      subscription_status: 'active',
      hospital_number_prefix: t.hospital_number_prefix || 'SRT',
      hospital_number_include_year: t.hospital_number_include_year ?? true,
      primary_brand_color: t.primary_brand_color || '#2563eb',
      secondary_brand_color: t.secondary_brand_color || '#10b981',
      ui_theme_class: t.ui_theme_class || 'theme-trust-blue',
      deployment_mode: (t.deployment_mode as DeploymentMode) || 'OFFLINE_STANDALONE',
      private_supabase_url: t.private_supabase_url || '',
      private_supabase_anon_key: t.private_supabase_anon_key || '',
      set_active: false,
      admin_name: '', admin_username: '', admin_email: '', admin_password: '',
    })
    setModules({
      module_records: t.module_records ?? true,
      module_triage: t.module_triage ?? true,
      module_consultation: t.module_consultation ?? true,
      module_laboratory: t.module_laboratory ?? false,
      module_pharmacy: t.module_pharmacy ?? false,
      module_radiology: t.module_radiology ?? false,
      module_finance_hmo: t.module_finance_hmo ?? false,
      module_maternity: t.module_maternity ?? false,
      module_insurance: t.module_insurance ?? false,
      module_referrals: t.module_referrals ?? false,
      module_appointments: t.module_appointments ?? false,
      module_admissions: t.module_admissions ?? false,
      module_paypoint: t.module_paypoint ?? false,
      module_store: t.module_store ?? false,
      module_doctor: t.module_doctor ?? false,
      module_nurses: t.module_nurses ?? false,
      module_consultants: t.module_consultants ?? false,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!form.hospital_name.trim()) {
      setError('Hospital name is required')
      return
    }
    if (mode === 'create' && form.set_active && (!form.admin_name.trim() || !form.admin_email.trim() || !form.admin_password.trim())) {
      setError('When setting this hospital as active, a default Admin account is required (name, email, password)')
      return
    }
    setSubmitting(true)
    try {
      const payload: any = {
        hospital_name: form.hospital_name.trim(),
        address: form.address.trim(),
        phone_number: form.phone_number.trim(),
        currency_symbol: form.currency_symbol.trim() || '₦',
        subscription_tier: form.subscription_tier,
        subscription_status: form.subscription_status,
        hospital_number_prefix: form.hospital_number_prefix.trim() || 'SRT',
        hospital_number_include_year: form.hospital_number_include_year,
        primary_brand_color: form.primary_brand_color,
        secondary_brand_color: form.secondary_brand_color,
        ui_theme_class: form.ui_theme_class,
        deployment_mode: form.deployment_mode,
        private_supabase_url: form.private_supabase_url || null,
        private_supabase_anon_key: form.private_supabase_anon_key || null,
        ...modules,
      }

      if (mode === 'create') {
        payload.create_admin = {
          name: form.admin_name.trim(),
          username: form.admin_username.trim(),
          email: form.admin_email.trim(),
          password: form.admin_password,
        }
        payload.set_active = form.set_active
        const res = await api.post('/superadmin/tenants', payload)
        if (logoFile) await uploadLogo(logoFile)
        setMessage(`Hospital "${res.data.tenant.hospital_name}" created successfully${form.set_active ? ' and set as active' : ''}`)
      } else {
        if (!selectedTenantId) { setError('Select a hospital to edit'); return }
        await api.put(`/superadmin/tenants/${selectedTenantId}`, payload)
        if (logoFile) await uploadLogo(logoFile)
        setMessage('Hospital configuration updated successfully')
      }
      setLogoFile(null)
      const input = document.getElementById('logo-input') as HTMLInputElement
      if (input) input.value = ''
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save hospital setup')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleActivate() {
    if (!selectedTenantId) return
    try {
      await api.post(`/superadmin/tenants/${selectedTenantId}/activate`)
      const stored = localStorage.getItem('sretan_user')
      const sa = stored ? JSON.parse(stored) : null
      localStorage.setItem('sretan_user', JSON.stringify({
        id: sa?.id || '',
        name: sa?.name || 'Super Admin',
        username: sa?.username || 'superadmin',
        role: 'Admin',
        user_type: 'superadmin',
        email: sa?.email || '',
      }))
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to activate hospital')
    }
  }

  async function uploadLogo(file: File) {
    const fd = new FormData()
    fd.append('logo', file)
    await api.post('/setup/upload-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-6 h-6 text-slate-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Comprehensive Hospital Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create or reconfigure a hospital end-to-end</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setMode('create')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'create' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          Create New Hospital
        </button>
        <button onClick={() => setMode('edit')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'edit' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          Edit Existing Hospital
        </button>
      </div>

      {mode === 'edit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <label className={labelCls}>Select Hospital</label>
          <select value={selectedTenantId}
            onChange={(e) => {
              const id = e.target.value
              setSelectedTenantId(id)
              const t = tenants.find((x) => x.id === id)
              if (t) loadTenant(t)
            }}
            className={inputCls}>
            <option value="">Choose a hospital...</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.hospital_name}</option>)}
          </select>
          {selectedTenantId && (
            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleActivate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all">
                <LogIn className="w-4 h-4" />
                Activate &amp; Enter Hospital
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Hospital Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Hospital Name *</label>
              <input type="text" value={form.hospital_name} onChange={(e) => set('hospital_name', e.target.value)}
                placeholder="e.g. Lagos General Hospital" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Address</label>
              <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2}
                placeholder="123 Hospital Road, City" className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)}
                placeholder="+234 800 000 0000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Currency Symbol</label>
              <input type="text" value={form.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)}
                maxLength={5} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hospital Number Prefix</label>
              <input type="text" value={form.hospital_number_prefix} onChange={(e) => set('hospital_number_prefix', e.target.value)}
                maxLength={10} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.hospital_number_include_year} onChange={(e) => set('hospital_number_include_year', e.target.checked)}
                className="w-4 h-4 text-blue-600 accent-blue-600" />
              Include year in hospital numbers
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Upload className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Logo Upload</h2>
          </div>
          <input
            id="logo-input"
            type="file"
            accept=".png,image/png"
            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer"
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Branding &amp; Modules</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className={labelCls}>Primary Brand Color</label>
              <div className="flex gap-3 items-center">
                <input type="color" value={form.primary_brand_color} onChange={(e) => set('primary_brand_color', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                <input type="text" value={form.primary_brand_color} onChange={(e) => set('primary_brand_color', e.target.value)}
                  className={`${inputCls} font-mono`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Theme Class</label>
              <select
                value={form.ui_theme_class}
                onChange={(e) => {
                  const v = e.target.value
                  set('ui_theme_class', v)
                  const theme = getThemeDef(v)
                  if (theme) {
                    setForm((f) => ({ ...f, primary_brand_color: theme.primary, secondary_brand_color: theme.secondary }))
                  }
                }}
                className={inputCls}
              >
                {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <button key={m.key} type="button" onClick={() => setModules((prev) => ({ ...prev, [m.key]: !prev[m.key] }))}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer ${
                  modules[m.key] ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-gray-200 text-slate-500 hover:bg-gray-300'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${modules[m.key] ? 'bg-white' : 'bg-slate-400'}`} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Cloud className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Deployment &amp; Subscription</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {DEPLOYMENTS.map((modeOpt) => {
              const Icon = modeOpt.value === 'OFFLINE_STANDALONE' ? WifiOff : modeOpt.value === 'CLOUD_SAAS' ? Cloud : Server
              return (
                <button key={modeOpt.value} type="button" onClick={() => set('deployment_mode', modeOpt.value)}
                  className={`text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                    form.deployment_mode === modeOpt.value
                      ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${form.deployment_mode === modeOpt.value ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className={`text-sm font-semibold ${form.deployment_mode === modeOpt.value ? 'text-blue-700' : 'text-slate-700'}`}>{modeOpt.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{modeOpt.desc}</p>
                </button>
              )
            })}
          </div>
          {form.deployment_mode === 'PRIVATE_SUPABASE' && (
            <div className="space-y-4 mb-5">
              <div>
                <label className={labelCls}>Supabase URL *</label>
                <input type="text" value={form.private_supabase_url} onChange={(e) => set('private_supabase_url', e.target.value)}
                  placeholder="https://supabase.yourdomain.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Anon Key *</label>
                <input type="text" value={form.private_supabase_anon_key} onChange={(e) => set('private_supabase_anon_key', e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..." className={`${inputCls} font-mono`} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Subscription Tier</label>
              <select value={form.subscription_tier} onChange={(e) => set('subscription_tier', e.target.value)} className={inputCls}>
                {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">{TIERS.find((t) => t.value === form.subscription_tier)?.desc}</p>
            </div>
            <div>
              <label className={labelCls}>Subscription Status</label>
              <select value={form.subscription_status} onChange={(e) => set('subscription_status', e.target.value)} className={inputCls}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">{STATUSES.find((s) => s.value === form.subscription_status)?.desc}</p>
            </div>
          </div>
        </div>

        {mode === 'create' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Default Admin Account</h2>
            </div>
            <p className="text-xs text-slate-400 mb-5">This account will be created for the hospital with the Admin role. Default departments are also seeded automatically.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Full Name</label>
                <input type="text" value={form.admin_name} onChange={(e) => set('admin_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Username</label>
                <input type="text" value={form.admin_username} onChange={(e) => set('admin_username', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input type={showAdminPassword ? 'text' : 'password'} value={form.admin_password} onChange={(e) => set('admin_password', e.target.value)}
                    className={`${inputCls} pr-11`} />
                  <button type="button" onClick={() => setShowAdminPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    title={showAdminPassword ? 'Hide password' : 'Show password'}>
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.set_active} onChange={(e) => set('set_active', e.target.checked)}
            className="w-4 h-4 text-blue-600 accent-blue-600" />
          Set as the active hospital after {mode === 'create' ? 'creation' : 'saving'}
        </label>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {message}
            <button type="button" onClick={() => navigate('/superadmin/hospitals')} className="ml-auto text-emerald-700 underline font-medium">
              Manage hospitals →
            </button>
          </div>
        )}

        <div className="flex items-center gap-4 pb-8">
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {submitting ? 'Saving...' : mode === 'create' ? 'Create Hospital' : 'Save Configuration'}
          </button>
          <button type="button" onClick={() => setMode('create')}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
              mode === 'create' ? 'hidden' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            <Pencil className="w-4 h-4" />
            Back to Create
          </button>
        </div>
      </form>
    </div>
  )
}
