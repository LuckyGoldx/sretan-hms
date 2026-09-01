import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, CheckCircle, Trash2, Cloud, Wifi, WifiOff, LogIn, Save,
  Users, Database, Settings as SettingsIcon, LayoutDashboard, Plus, X, Pencil,
  Download, RefreshCw,   Upload, AlertTriangle, Search, Building2, Eye, EyeOff, Server, FileCode2
} from 'lucide-react'
import api from '../hooks/superadminApi'
import { THEMES, getThemeDef } from '../utils/themes'
import SchemaSqlViewer from './SchemaSqlViewer'
import SchemaUpdateBanner from './SchemaUpdateBanner'

type DeploymentMode = 'CLOUD_SAAS' | 'OFFLINE_STANDALONE' | 'PRIVATE_SUPABASE'

interface Tenant {
  id: string
  hospital_name: string
  subscription_status: string
  subscription_tier: string
  created_at: string
  address: string | null
  phone_number: string | null
  currency_symbol: string | null
  primary_brand_color: string | null
  secondary_brand_color: string | null
  ui_theme_class: string | null
  deployment_mode: string | null
  cloud_sync_enabled: boolean | null
  private_supabase_url: string | null
  private_supabase_anon_key: string | null
  module_records: boolean | null
  module_triage: boolean | null
  module_consultation: boolean | null
  module_laboratory: boolean | null
  module_pharmacy: boolean | null
  module_radiology: boolean | null
  module_finance_hmo: boolean | null
  hospital_number_prefix: string | null
  hospital_number_include_year: boolean | null
  module_maternity: boolean | null
  module_insurance: boolean | null
  module_referrals: boolean | null
  module_appointments: boolean | null
  module_admissions: boolean | null
  module_paypoint: boolean | null
  module_store: boolean | null
  module_doctor: boolean | null
  module_nurses: boolean | null
  module_consultants: boolean | null
  number_pattern_hospital: string | null
  number_pattern_lab: string | null
  number_pattern_anc: string | null
  number_pattern_radiology: string | null
  number_pattern_receipt: string | null
  number_pattern_referral: string | null
  number_pattern_case: string | null
  number_pattern_auth: string | null
  staff_count: number
  patient_count: number
  encounter_count: number
}

interface Staff {
  id: string
  email: string
  username: string
  name: string
  role: string
  phone: string | null
  status: string
  department_id: string | null
  department_name: string | null
  tenant_id: string
  hospital_name: string | null
}

interface Department { id: string; name: string; code: string | null }

interface TenantBackup {
  name: string
  size: number
  modified_at: string
  manifest: {
    created_at?: string
    tables?: Array<{ table: string; rows: number }>
    hospital_name?: string
  } | null
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

const ROLES = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin', 'Finance', 'Radiology', 'Consultant']
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
  { value: 'OFFLINE_STANDALONE', label: 'Offline Standalone', desc: 'Everything runs locally on this machine. No internet or cloud sync required. Recommended for single-site clinics.' },
  { value: 'CLOUD_SAAS', label: 'Cloud SaaS', desc: 'Hosted multi-tenant mode managed by the provider. Data is stored in the cloud and synced automatically.' },
  { value: 'PRIVATE_SUPABASE', label: 'Private Cloud (Supabase)', desc: 'Syncs to your own Supabase instance. Requires a Supabase project URL and anon key below.' },
] as const

const NUMBER_PATTERN_TYPES = [
  { key: 'number_pattern_hospital', label: 'Hospital Number', desc: 'Assigned to every patient folder on registration.', preset: '{prefix}-{year}-{seq:5}' },
  { key: 'number_pattern_lab', label: 'Lab Number', desc: 'Lab order accession number when a test is ordered.', preset: 'LAB-{year}-{seq:4}' },
  { key: 'number_pattern_anc', label: 'ANC Booking Code', desc: 'Antenatal booking reference for maternity patients.', preset: 'ANC-{year}-{seq:5}' },
  { key: 'number_pattern_radiology', label: 'Radiology Number', desc: 'Imaging order number for X-ray / ultrasound etc.', preset: 'RAD-{seq:5}' },
  { key: 'number_pattern_receipt', label: 'Receipt Number', desc: 'Payment receipts issued at paypoint.', preset: 'RCP-{yy}{month}{day}-{seq:4}' },
  { key: 'number_pattern_referral', label: 'Referral Number', desc: 'Specialist / consultant referral references.', preset: 'REF-{year}-{seq:5}' },
  { key: 'number_pattern_case', label: 'Insurance Case Number', desc: 'Insurance claim case references.', preset: '{provider}-{year}-{seq:5}' },
  { key: 'number_pattern_auth', label: 'Auth Request Number', desc: 'Insurance authorization request references.', preset: 'AUTH-{year}-{seq:5}' },
]

const PATTERN_PRESETS: Record<string, string[]> = {
  number_pattern_hospital: ['{prefix}-{year}-{seq:5}', '{prefix}-{seq:5}', '{prefix}/{year}/{seq:4}', '{prefix}-{yy}-{seq:4}', '{prefix}.{year}.{seq:5}', 'SRT-{year}-{seq:5}'],
  number_pattern_lab: ['LAB-{year}-{seq:4}', 'LAB-{seq:4}', 'LAB/{year}/{seq:4}', 'LB-{yy}{month}-{seq:3}'],
  number_pattern_anc: ['ANC-{year}-{seq:5}', 'ANC-{seq:5}', 'ANC/{year}/{seq:4}', 'ANC-{yy}-{seq:4}'],
  number_pattern_radiology: ['RAD-{seq:5}', 'RAD-{year}-{seq:4}', 'RAD/{seq:4}'],
  number_pattern_receipt: ['RCP-{yy}{month}{day}-{seq:4}', 'RCP-{year}-{seq:4}', 'RCP-{yy}{month}{day}/{seq:3}'],
  number_pattern_referral: ['REF-{year}-{seq:5}', 'REF-{seq:5}', 'REF/{year}/{seq:4}', 'RF-{yy}{month}-{seq:4}'],
  number_pattern_case: ['{provider}-{year}-{seq:5}', 'CS-{year}-{seq:5}', '{provider}/{year}/{seq:4}'],
  number_pattern_auth: ['AUTH-{year}-{seq:5}', 'AUTH-{seq:5}', 'AUTH/{year}/{seq:4}'],
}

function previewPattern(pattern: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const yy = String(year).slice(2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return pattern.replace(/\{([a-z_]+)(?::(\d+))?\}/g, (m, token: string, w?: string) => {
    const width = w ? parseInt(w, 10) : undefined
    const pad = (s: string, wd?: number) => (wd && s.length < wd ? s.padStart(wd, '0') : s)
    switch (token) {
      case 'prefix': return 'SRT'
      case 'provider': return 'HMO'
      case 'year': return String(year)
      case 'yy': return yy
      case 'month': return month
      case 'month_name': return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()]
      case 'day': return day
      case 'seq': return pad('12345', width)
      default: return m
    }
  })
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

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

export default function SuperAdminTenantDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'overview' | 'staff' | 'backups' | 'settings'>('overview')
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [activeTenantId, setActiveTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activating, setActivating] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteStep, setDeleteStep] = useState(1)
  const [typedName, setTypedName] = useState('')
  const [masterCode, setMasterCode] = useState('')
  const [showMasterCode, setShowMasterCode] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [tRes, oRes] = await Promise.all([
        api.get('/superadmin/tenants'),
        api.get('/superadmin/overview'),
      ])
      const t = tRes.data.find((x: Tenant) => x.id === id)
      setTenant(t || null)
      setActiveTenantId(oRes.data.active_tenant?.tenant_id || '')
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [id])

  async function handleEnterHospital() {
    if (!tenant) return
    setActivating(true)
    try {
      await api.post(`/superadmin/tenants/${tenant.id}/activate`)
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
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to enter hospital' })
    } finally {
      setActivating(false)
    }
  }

  async function handleDelete() {
    if (!tenant) return
    setDeleting(true)
    try {
      await api.delete(`/superadmin/tenants/${tenant.id}`, { data: { master_code: masterCode } })
      navigate('/superadmin/hospitals')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Delete failed' })
      setDeleting(false)
    }
  }

  if (loading && !tenant) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Building2 className="w-12 h-12 mb-3" />
        <p className="text-sm font-medium">Hospital not found</p>
        <button onClick={() => navigate('/superadmin/hospitals')} className="mt-3 text-sm text-blue-600 underline">Back to Hospitals</button>
      </div>
    )
  }

  const isActive = activeTenantId === tenant.id
  const activeModules = MODULES.filter((m) => (tenant as any)[m.key]).map((m) => m.label)

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { key: 'staff' as const, label: 'Staff', icon: Users },
    { key: 'backups' as const, label: 'Backup & Restore', icon: Database },
    { key: 'settings' as const, label: 'Settings', icon: SettingsIcon },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/superadmin/hospitals')} className="p-2 rounded-xl hover:bg-slate-100">
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">{tenant.hospital_name}</h1>
              {isActive && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">ACTIVE</span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono">{tenant.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleEnterHospital} disabled={activating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-all">
            {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Enter Hospital
          </button>
          <button onClick={() => { setShowDeleteConfirm(true); setDeleteStep(1); setTypedName(''); setMasterCode('') }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-all">
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {message.text}
        </div>
      )}

      <div className="flex gap-2 flex-wrap border-b border-slate-200 pb-0">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white border border-b-0 border-slate-200 text-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab tenant={tenant} activeModules={activeModules} onChanged={fetchAll} />
      )}
      {tab === 'staff' && <StaffTab tenantId={tenant.id} />}
      {tab === 'backups' && <BackupsTab tenantId={tenant.id} />}
      {tab === 'settings' && <SettingsTab tenant={tenant} onSaved={fetchAll} />}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!deleting) setShowDeleteConfirm(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">
                {deleteStep === 1 && 'Delete Hospital — Warning'}
                {deleteStep === 2 && 'Delete Hospital — Confirm Name'}
                {deleteStep === 3 && 'Delete Hospital — Enter Master Code'}
              </h2>
              <button onClick={() => { if (!deleting) { setShowDeleteConfirm(false); setDeleteStep(1); setTypedName(''); setMasterCode('') } }} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-center gap-1.5 mb-5">
                {[1, 2, 3].map((s) => (
                  <span key={s} className={`h-1.5 rounded-full transition-all ${deleteStep >= s ? 'w-8 bg-rose-500' : 'w-4 bg-slate-200'}`} />
                ))}
              </div>

              {deleteStep === 1 && (
                <div className="flex items-start gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
                  <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-rose-700 space-y-2">
                    <p className="font-semibold">You are about to permanently delete {tenant.hospital_name}.</p>
                    <ul className="list-disc list-inside text-xs text-rose-600 space-y-1">
                      <li>All {tenant.staff_count} staff accounts, including admins</li>
                      <li>All {tenant.patient_count} patients and their records</li>
                      <li>Payments, lab, radiology, pharmacy, maternity and all clinical data</li>
                      <li>Hospital configuration, departments and branding</li>
                    </ul>
                    <p>This action cannot be undone. Other hospitals are NOT affected.</p>
                  </div>
                </div>
              )}

              {deleteStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Type the hospital name <strong className="text-slate-800">{tenant.hospital_name}</strong> to confirm.
                  </p>
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder={tenant.hospital_name}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    autoFocus
                  />
                </div>
              )}

              {deleteStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Final step. Enter the superadmin master code to permanently delete this hospital.
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type={showMasterCode ? 'text' : 'password'}
                      value={masterCode}
                      onChange={(e) => setMasterCode(e.target.value)}
                      placeholder="Master code"
                      className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowMasterCode((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      title={showMasterCode ? 'Hide master code' : 'Show master code'}>
                      {showMasterCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">The master code can be changed from the Settings tab.</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button
                onClick={() => {
                  if (deleteStep > 1) { setDeleteStep(deleteStep - 1) } else { setShowDeleteConfirm(false); setTypedName(''); setMasterCode('') }
                }}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all"
              >
                {deleteStep === 1 ? 'Cancel' : 'Back'}
              </button>
              {deleteStep < 3 ? (
                <button
                  onClick={() => {
                    if (deleteStep === 1) setDeleteStep(2)
                    else if (deleteStep === 2 && typedName.trim() === tenant.hospital_name) setDeleteStep(3)
                    else if (deleteStep === 2) setMessage({ type: 'error', text: 'The hospital name does not match. Please type it exactly.' })
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all duration-200"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={deleting || !masterCode.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-all duration-200 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting...' : 'Delete Hospital'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({ tenant, activeModules, onChanged }: { tenant: Tenant; activeModules: string[]; onChanged: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Staff" value={tenant.staff_count} />
        <StatCard label="Patients" value={tenant.patient_count} />
        <StatCard label="Encounters" value={tenant.encounter_count} />
        <StatCard label="Subscription" value={tenant.subscription_tier} small />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Enabled Modules</h2>
          {activeModules.length === 0 ? (
            <p className="text-sm text-slate-400">No modules enabled.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => {
                const on = (tenant as any)[m.key]
                return (
                  <span key={m.key} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${
                    on ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-gray-200 text-slate-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-white' : 'bg-slate-400'}`} />
                    {m.label}
                  </span>
                )
              })}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Wifi className="w-4 h-4 text-slate-400" /> Deployment</span>
            </div>
            <DeploymentBadge mode={tenant.deployment_mode} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Hospital Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500 flex-shrink-0">Address</dt><dd className="font-medium text-slate-700 text-right">{tenant.address || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-700">{tenant.phone_number || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Currency</dt><dd className="font-medium text-slate-700">{tenant.currency_symbol || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Hospital No.</dt><dd className="font-medium text-slate-700 font-mono text-xs pt-0.5">{tenant.hospital_number_prefix || 'SRT'}{tenant.hospital_number_include_year ? '-YYYY' : ''}-NNNN</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-700 capitalize">{tenant.subscription_status}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Created</dt><dd className="font-medium text-slate-700">{new Date(tenant.created_at).toLocaleDateString()}</dd></div>
          </dl>
          {tenant.private_supabase_url && (
            <p className="text-xs text-slate-400 mt-3 font-mono break-all">{tenant.private_supabase_url}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className={`font-bold text-slate-800 ${small ? 'text-lg capitalize' : 'text-2xl'}`}>{value}</p>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Staff tab
// ---------------------------------------------------------------------------

function StaffTab({ tenantId }: { tenantId: string }) {
  const [staff, setStaff] = useState<Staff[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', email: '', role: 'Nurse', phone: '', password: '', department_id: '' })

  async function fetchStaff() {
    setLoading(true)
    try {
      const res = await api.get('/superadmin/staff', { params: { tenant_id: tenantId } })
      setStaff(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  async function fetchDepartments() {
    try {
      const res = await api.get('/superadmin/departments', { params: { tenant_id: tenantId } })
      setDepartments(res.data)
    } catch { setDepartments([]) }
  }

  useEffect(() => { fetchStaff(); fetchDepartments() }, [tenantId])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', username: '', email: '', role: 'Nurse', phone: '', password: '', department_id: '' })
    setFormError('')
    setShowModal(true)
  }

  function openEdit(s: Staff) {
    setEditing(s)
    setForm({ name: s.name, username: s.username || '', email: s.email, role: s.role, phone: s.phone || '', password: '', department_id: s.department_id || '' })
    setFormError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim() || !form.role) { setFormError('Name, email and role are required'); return }
    if (!editing && !form.password) { setFormError('Password is required for new staff'); return }
    setFormError('')
    setSaving(true)
    try {
      const payload: any = { tenant_id: tenantId, name: form.name.trim(), username: form.username.trim(), email: form.email.trim(), role: form.role, phone: form.phone.trim() || null, department_id: form.department_id || null }
      if (editing) {
        if (form.password) payload.password = form.password
        await api.put(`/superadmin/staff/${editing.id}`, payload)
      } else {
        payload.password = form.password
        await api.post('/superadmin/staff', payload)
      }
      setShowModal(false)
      await fetchStaff()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to save staff')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Staff) {
    if (!window.confirm(`Delete ${s.name} (${s.role})?`)) return
    try {
      await api.delete(`/superadmin/staff/${s.id}`, { params: { tenant_id: tenantId } })
      await fetchStaff()
    } catch {}
  }

  const filtered = staff.filter((s) => {
    const q = search.toLowerCase()
    if (!q) return true
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q) || s.role.toLowerCase().includes(q)
  })
  const admins = staff.filter((s) => s.role === 'Admin')

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 justify-between">
        <div className="relative md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: 'var(--primary-color)' }}>
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      {admins.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-violet-700 mb-2">ADMIN ACCOUNTS ({admins.length})</p>
          <div className="flex flex-wrap gap-2">
            {admins.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-violet-200 text-sm text-slate-700">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                {a.name} <span className="text-xs text-slate-400">({a.username || a.email})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No staff found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-5 py-3 text-slate-500">{s.username || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{s.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.role === 'Admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{s.role}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.department_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{s.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) setShowModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{formError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                  <input type="text" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="auto from email if blank"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Department</label>
                  <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— None —</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password {editing && <span className="text-xs text-slate-400 font-normal">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--primary-color)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Backup & Restore tab
// ---------------------------------------------------------------------------

function BackupsTab({ tenantId }: { tenantId: string }) {
  const [backups, setBackups] = useState<TenantBackup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ name: string } | null>(null)
  const [busyAction, setBusyAction] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchBackups() {
    setLoading(true)
    try {
      const res = await api.get(`/superadmin/tenants/${tenantId}/backups`)
      setBackups(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBackups() }, [tenantId])

  async function handleCreate() {
    setCreating(true)
    setMessage(null)
    try {
      const res = await api.post(`/superadmin/tenants/${tenantId}/backup`)
      setMessage({ type: 'success', text: `Backup created: ${res.data.name} (${res.data.rows} rows)` })
      await fetchBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Backup failed' })
    } finally {
      setCreating(false)
    }
  }

  async function handleConfirmRestore() {
    if (!confirmAction) return
    setBusyAction(true)
    setMessage(null)
    try {
      await api.post(`/superadmin/tenants/${tenantId}/restore`, { name: confirmAction.name })
      setMessage({ type: 'success', text: 'Hospital restored. Only this hospital was replaced — all other hospitals are untouched.' })
      await fetchBackups()
      setConfirmAction(null)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Restore failed' })
    } finally {
      setBusyAction(false)
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`Delete backup ${name}?`)) return
    try {
      await api.delete(`/superadmin/tenants/${tenantId}/backups/${name}`)
      await fetchBackups()
    } catch {}
  }

  async function handleUploadRestore() {
    if (!restoreFile) return
    setUploading(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', restoreFile)
      await api.post(`/superadmin/tenants/${tenantId}/restore`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessage({ type: 'success', text: 'Restore completed from uploaded backup' })
      setRestoreFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Restore failed' })
    } finally {
      setUploading(false)
    }
  }

  function handleDownload(name: string) {
    const token = localStorage.getItem('sretan_superadmin_token') || ''
    fetch(`/api/superadmin/tenants/${tenantId}/backups/${name}/download`, { headers: { 'x-superadmin-token': token } })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob() })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => setMessage({ type: 'error', text: 'Download failed' }))
  }

  const totalRows = (b: TenantBackup) => (b.manifest?.tables || []).reduce((a, t) => a + (t.rows || 0), 0)
  const [brTab, setBrTab] = useState<'backups' | 'schema'>('backups')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setBrTab('backups')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            brTab === 'backups' ? 'bg-white border border-b-0 border-slate-200 text-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <Database className="w-4 h-4" />
          Backups &amp; Restore
        </button>
        <button onClick={() => setBrTab('schema')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            brTab === 'schema' ? 'bg-white border border-b-0 border-slate-200 text-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <FileCode2 className="w-4 h-4" />
          Cloud Schema
        </button>
      </div>

      {brTab === 'schema' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <FileCode2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">This Hospital's Cloud Schema</h2>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            For <strong>Private Cloud</strong>, this hospital uses its OWN Supabase project — run this schema in that project's
            SQL Editor. It is regenerated live from the migration files, so it is always current. (Cloud SaaS hospitals use the
            global project on the Super Admin → Cloud &amp; Sync page instead.)
          </p>
          <SchemaUpdateBanner compact />
          <div className="mt-3">
            <SchemaSqlViewer compact />
          </div>
        </div>
      )}

      {brTab === 'backups' && (
      <>

      <SchemaUpdateBanner compact />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Hospital-level backup — other hospitals are not affected.</p>
          <p className="text-amber-700 mt-1">Restoring replaces only this hospital's data. It includes all tables that carry a tenant_id, automatically including future tables.</p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Create Hospital Backup</h2>
            <p className="text-xs text-slate-400 mt-1">Snapshot only this hospital's data (patients, staff, records, config).</p>
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center border-t border-slate-100 pt-4">
          <input ref={fileInputRef} type="file" accept=".tbk"
            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 file:cursor-pointer cursor-pointer flex-1" />
          <button onClick={handleUploadRestore} disabled={!restoreFile || uploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Restoring...' : 'Upload & Restore'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <Database className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No backups for this hospital yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Backup</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium">Size</th>
                <th className="px-6 py-3 font-medium">Tables</th>
                <th className="px-6 py-3 font-medium">Rows</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-6 py-3 font-mono text-xs text-slate-700 break-all">{b.name}</td>
                  <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{new Date(b.manifest?.created_at || b.modified_at).toLocaleString()}</td>
                  <td className="px-6 py-3 text-slate-500">{formatBytes(b.size)}</td>
                  <td className="px-6 py-3 text-slate-500">{b.manifest?.tables?.length ?? '?'}</td>
                  <td className="px-6 py-3 text-slate-500">{totalRows(b)}</td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleDownload(b.name)} title="Download"
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Download className="w-4 h-4" /></button>
                      <button onClick={() => setConfirmAction({ name: b.name })} title="Restore"
                        className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(b.name)} title="Delete"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!busyAction) setConfirmAction(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Restore Hospital Backup</h2>
              <button onClick={() => setConfirmAction(null)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Restoring <strong className="break-all">{confirmAction.name}</strong> will replace this hospital's data only. Other hospitals are left untouched.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setConfirmAction(null)} disabled={busyAction}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleConfirmRestore} disabled={busyAction}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-all">
                {busyAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {busyAction ? 'Restoring...' : 'Restore Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function SettingsTab({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    hospital_name: tenant.hospital_name,
    address: tenant.address || '',
    phone_number: tenant.phone_number || '',
    currency_symbol: tenant.currency_symbol || '₦',
    subscription_tier: tenant.subscription_tier,
    subscription_status: tenant.subscription_status,
    hospital_number_prefix: tenant.hospital_number_prefix || 'SRT',
    hospital_number_include_year: tenant.hospital_number_include_year ?? true,
    number_pattern_hospital: tenant.number_pattern_hospital || '',
    number_pattern_lab: tenant.number_pattern_lab || '',
    number_pattern_anc: tenant.number_pattern_anc || '',
    number_pattern_radiology: tenant.number_pattern_radiology || '',
    number_pattern_receipt: tenant.number_pattern_receipt || '',
    number_pattern_referral: tenant.number_pattern_referral || '',
    number_pattern_case: tenant.number_pattern_case || '',
    number_pattern_auth: tenant.number_pattern_auth || '',
    primary_brand_color: tenant.primary_brand_color || '#2563eb',
    secondary_brand_color: tenant.secondary_brand_color || '#10b981',
    ui_theme_class: tenant.ui_theme_class || 'theme-trust-blue',
    deployment_mode: (tenant.deployment_mode as DeploymentMode) || 'OFFLINE_STANDALONE',
    private_supabase_url: tenant.private_supabase_url || '',
    private_supabase_anon_key: tenant.private_supabase_anon_key || '',
  })
  const [modules, setModules] = useState<Record<string, boolean>>({
    module_records: tenant.module_records ?? true,
    module_triage: tenant.module_triage ?? true,
    module_consultation: tenant.module_consultation ?? true,
    module_laboratory: tenant.module_laboratory ?? false,
    module_pharmacy: tenant.module_pharmacy ?? false,
    module_radiology: tenant.module_radiology ?? false,
    module_finance_hmo: tenant.module_finance_hmo ?? false,
    module_maternity: tenant.module_maternity ?? false,
    module_insurance: tenant.module_insurance ?? false,
    module_referrals: tenant.module_referrals ?? false,
    module_appointments: tenant.module_appointments ?? false,
    module_admissions: tenant.module_admissions ?? false,
    module_paypoint: tenant.module_paypoint ?? false,
    module_store: tenant.module_store ?? false,
    module_doctor: tenant.module_doctor ?? false,
    module_nurses: tenant.module_nurses ?? false,
    module_consultants: tenant.module_consultants ?? false,
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [masterCodeInput, setMasterCodeInput] = useState('')
  const [masterCodeMsg, setMasterCodeMsg] = useState('')
  const [savedMasterCode, setSavedMasterCode] = useState('')
  const [showMasterCodeInput, setShowMasterCodeInput] = useState(false)

  useEffect(() => {
    api.get('/superadmin/settings')
      .then((res) => { setSavedMasterCode(res.data.master_code || ''); setMasterCodeInput(res.data.master_code || '') })
      .catch(() => {})
    fetch('/api/setup/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLogoUrl(d?.logo_url || null))
      .catch(() => {})
  }, [])

  async function handleLogoUpload() {
    if (!logoFile) return
    setUploadingLogo(true)
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('logo', logoFile)
      await api.post('/setup/upload-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLogoUrl('/assets/logo.png?t=' + Date.now())
      setLogoFile(null)
      setMessage('Logo uploaded successfully')
    } catch {
      setMessage('Logo upload failed')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleMasterCodeChange() {
    if (!masterCodeInput.trim()) { setMasterCodeMsg('Enter a new master code'); return }
    try {
      await api.put('/superadmin/settings', { master_code: masterCodeInput.trim() })
      setSavedMasterCode(masterCodeInput.trim())
      setMasterCodeMsg('Master code updated successfully')
    } catch {
      setMasterCodeMsg('Failed to update master code')
    }
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await api.put(`/superadmin/tenants/${tenant.id}`, {
        ...form,
        cloud_sync_enabled: form.deployment_mode !== 'OFFLINE_STANDALONE',
        private_supabase_url: form.private_supabase_url || null,
        private_supabase_anon_key: form.private_supabase_anon_key || null,
        ...modules,
      })
      setMessage('Configuration saved successfully')
      onSaved()
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">Hospital Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Hospital Name</label>
            <input type="text" value={form.hospital_name} onChange={(e) => set('hospital_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="text" value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Address</label>
            <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Currency Symbol</label>
            <input type="text" value={form.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} maxLength={5} className={inputCls} />
          </div>
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
          <div>
            <label className={labelCls}>Hospital Number Prefix</label>
            <input type="text" value={form.hospital_number_prefix} onChange={(e) => set('hospital_number_prefix', e.target.value)} maxLength={10} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.hospital_number_include_year} onChange={(e) => set('hospital_number_include_year', e.target.checked)}
              className="w-4 h-4 text-blue-600 accent-blue-600" />
            Include year in hospital numbers
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Numbering &amp; Patterns</h2>
        <p className="text-xs text-slate-400 mb-4">
          Control the format of every number the system generates. Tokens: <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{prefix}'}</code> hospital/type prefix ·{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{year}'}</code> full year ·{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{yy}'}</code> short year ·{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{month}'}</code> /{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{day}'}</code> ·{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{seq:5}'}</code> sequence width ·{' '}
          <code className="text-[11px] font-mono bg-slate-100 px-1 rounded">{'{provider}'}</code> insurance provider.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {NUMBER_PATTERN_TYPES.map((nt) => {
            const value = (form as any)[nt.key] || nt.preset
            return (
              <div key={nt.key} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">{nt.label}</p>
                <p className="text-[11px] text-slate-400 mb-2">{nt.desc}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(PATTERN_PRESETS[nt.key] || [nt.preset]).map((p) => (
                    <button key={p} type="button" onClick={() => set(nt.key as any, p)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                        value === p ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-400'
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" value={value} onChange={(e) => set(nt.key as any, e.target.value)}
                    className="w-full px-3 py-2 pr-16 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => set(nt.key as any, nt.preset)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-500 hover:bg-slate-200 transition-all">
                    Reset
                  </button>
                </div>
                <p className="text-[11px] text-emerald-600 mt-1.5 font-mono">Preview: {previewPattern(value)}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Deployment</h2>
        <p className="text-xs text-slate-400 mb-4">How this hospital is hosted and where its data lives.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {DEPLOYMENTS.map((d) => {
            const Icon = d.value === 'OFFLINE_STANDALONE' ? WifiOff : d.value === 'CLOUD_SAAS' ? Cloud : Server
            return (
              <button key={d.value} type="button" onClick={() => set('deployment_mode', d.value as any)}
                className={`text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                  form.deployment_mode === d.value
                    ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${form.deployment_mode === d.value ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className={`text-sm font-semibold ${form.deployment_mode === d.value ? 'text-blue-700' : 'text-slate-700'}`}>{d.label}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{d.desc}</p>
              </button>
            )
          })}
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-4">
          <span className="font-semibold">Selected:</span>{' '}
          {DEPLOYMENTS.find((d) => d.value === form.deployment_mode)?.desc || 'Choose a deployment mode above.'}
        </div>
        {form.deployment_mode === 'PRIVATE_SUPABASE' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Supabase URL *</label>
              <input type="text" value={form.private_supabase_url} onChange={(e) => set('private_supabase_url', e.target.value)}
                placeholder="https://supabase.yourdomain.com" className={inputCls} />
              {!form.private_supabase_url && (
                <p className="text-[11px] text-amber-600 mt-1.5">A Supabase project URL is required for Private Cloud mode.</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Anon Key *</label>
              <input type="text" value={form.private_supabase_anon_key} onChange={(e) => set('private_supabase_anon_key', e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..." className={`${inputCls} font-mono`} />
              {!form.private_supabase_anon_key && (
                <p className="text-[11px] text-amber-600 mt-1.5">The public anon key from your Supabase project is required.</p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-purple-200 bg-purple-50">
              <p className="text-sm font-semibold text-purple-800 mb-1">Supabase Setup</p>
              <ol className="text-[11px] text-purple-700 list-decimal list-inside space-y-1 mb-3">
                <li>Create a Supabase project (supabase.com — free tier works).</li>
                <li>Paste the schema SQL below into the Supabase <strong>SQL Editor</strong> and run it.</li>
                <li>Paste your project URL and anon key above, then save.</li>
                <li>This hospital then syncs to that project (offline-first — it only pushes when connected).</li>
              </ol>
              <div className="bg-white rounded-xl border border-purple-200 p-3">
                <SchemaSqlViewer compact />
              </div>
            </div>
          </div>
        )}
        {form.deployment_mode === 'OFFLINE_STANDALONE' && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
            Cloud sync will be disabled for this hospital. All data stays on this machine.
          </div>
        )}
        {form.deployment_mode === 'CLOUD_SAAS' && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700">
            Cloud sync is enabled for this hospital. No additional credentials are needed.
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Branding &amp; Logo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div>
            <label className={labelCls}>Primary Brand Color</label>
            <div className="flex gap-3 items-center">
              <input type="color" value={form.primary_brand_color} onChange={(e) => set('primary_brand_color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
              <input type="text" value={form.primary_brand_color} onChange={(e) => set('primary_brand_color', e.target.value)} className={`${inputCls} font-mono`} />
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
            <p className="text-[11px] text-slate-400 mt-1.5">Picking a theme sets the brand colors to that theme's palette. You can still override the primary color manually.</p>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 mb-2">THEME PREVIEW</p>
          <div className="rounded-2xl overflow-hidden border border-slate-200 max-w-sm">
            <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: form.primary_brand_color }}>
              <div className="w-6 h-6 rounded-md bg-white/25" />
              <div className="flex-1">
                <div className="h-2.5 w-28 rounded-full bg-white/60" />
                <div className="h-1.5 w-20 rounded-full bg-white/30 mt-1" />
              </div>
            </div>
            <div className="bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: form.primary_brand_color }} />
                <div className="w-4 h-4 rounded" style={{ backgroundColor: form.secondary_brand_color || getThemeDef(form.ui_theme_class)?.secondary }} />
                <div className="h-2 w-16 rounded-full bg-slate-300" />
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100" />
              <div className="h-2 w-3/4 rounded-full bg-slate-100" />
              <div className="flex gap-2">
                <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: form.primary_brand_color }} />
                <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: form.secondary_brand_color || getThemeDef(form.ui_theme_class)?.secondary, opacity: 0.85 }} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {THEMES.map((t) => (
              <button key={t.value} type="button" onClick={() => {
                set('ui_theme_class', t.value)
                setForm((f) => ({ ...f, primary_brand_color: t.primary, secondary_brand_color: t.secondary }))
              }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all hover:scale-105"
                style={{ borderColor: form.ui_theme_class === t.value ? t.primary : '#e2e8f0', backgroundColor: form.ui_theme_class === t.value ? t.primary + '14' : 'white' }}
                title={t.label}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.primary }} />
                <span className="text-[10px] font-medium text-slate-600">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Theme: {getThemeDef(form.ui_theme_class)?.label || form.ui_theme_class}</p>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100">
          <label className={labelCls}>Hospital Logo (PNG)</label>
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Hospital logo" className="w-full h-full object-contain" />
              ) : (
                <Upload className="w-6 h-6 text-slate-300" />
              )}
            </div>
            <div className="flex-1 flex flex-col md:flex-row gap-2 w-full">
              <input type="file" accept=".png,image/png" onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer flex-1" />
              <button onClick={handleLogoUpload} disabled={!logoFile || uploadingLogo}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingLogo ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Master Code</h2>
        <p className="text-xs text-slate-400 mb-4">
          Required to permanently delete a hospital. Current code: <strong className="font-mono">{savedMasterCode || '—'}</strong>
        </p>
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center max-w-lg">
          <div className="relative flex-1 w-full">
            <input type={showMasterCodeInput ? 'text' : 'password'} value={masterCodeInput} onChange={(e) => setMasterCodeInput(e.target.value)}
              placeholder="New master code"
              className={`${inputCls} font-mono pr-11`} />
            <button type="button" onClick={() => setShowMasterCodeInput((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              title={showMasterCodeInput ? 'Hide master code' : 'Show master code'}>
              {showMasterCodeInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={handleMasterCodeChange}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all">
            Update Code
          </button>
        </div>
        {masterCodeMsg && <p className={`text-sm mt-2 ${masterCodeMsg.includes('success') ? 'text-emerald-600' : 'text-rose-600'}`}>{masterCodeMsg}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Modules</h2>
        <div className="flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <button key={m.key} type="button" onClick={() => setModules((p) => ({ ...p, [m.key]: !p[m.key] }))}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer ${
                modules[m.key] ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-gray-200 text-slate-500 hover:bg-gray-300'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full transition-colors ${modules[m.key] ? 'bg-white' : 'bg-slate-400'}`} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
          message.includes('success') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {message}
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
        style={{ backgroundColor: 'var(--primary-color)' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  )
}
