import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Key,
  Building2,
  Upload,
  Palette,
  Cloud,
  Save,
  CheckCircle
} from 'lucide-react'
import apiClient from '../hooks/useAxios'

type DeploymentMode = 'OFFLINE_STANDALONE' | 'CLOUD_SAAS'

interface SetupStatus {
  configured: boolean
  clinic_name?: string
}

const MODULES = [
  'Records',
  'Triage',
  'Consultation',
  'Laboratory',
  'Pharmacy',
  'Radiology',
  'Finance/HMO'
]

const THEME_CLASSES = [
  { value: 'theme-trust-blue', label: 'Trust Blue' },
  { value: 'theme-emerald-green', label: 'Emerald Green' },
  { value: 'theme-charcoal-clinical', label: 'Charcoal Clinical' },
  { value: 'theme-royal-purple', label: 'Royal Purple' }
]

function TokenGate({ onVerified }: { onVerified: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function handleUnlock() {
    if (!passphrase.trim()) {
      setError('Please enter the master passphrase')
      return
    }
    setError('')
    setVerifying(true)
    try {
      await apiClient.post('/setup/verify-token', { passphrase: passphrase.trim() })
      onVerified()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid passphrase')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md mx-auto">
      <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
        <Key className="w-7 h-7 text-blue-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800 text-center mb-1">Master Token Required</h2>
      <p className="text-sm text-slate-500 text-center mb-6">
        Enter the master passphrase to unlock the setup console
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Passphrase</label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            placeholder="Enter master passphrase"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <button
          type="button"
          onClick={handleUnlock}
          disabled={verifying}
          className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          {verifying ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Key className="w-4 h-4" />
          )}
          {verifying ? 'Verifying...' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}

function ModuleCheckbox({
  label,
  checked,
  onToggle
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer ${
        checked
          ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
          : 'bg-gray-200 text-slate-500 hover:bg-gray-300'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${checked ? 'bg-white' : 'bg-slate-400'}`} />
      {label}
    </button>
  )
}

export default function SetupConsole() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [clinicName, setClinicName] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState('₦')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [activeModules, setActiveModules] = useState<string[]>(['Records', 'Triage', 'Consultation'])
  const [brandColor, setBrandColor] = useState('#2563eb')
  const [themeClass, setThemeClass] = useState('theme-trust-blue')
  const [deployment, setDeployment] = useState<DeploymentMode>('OFFLINE_STANDALONE')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const { data } = await apiClient.get<SetupStatus>('/setup/status')
        if (!cancelled) {
          setConfigured(data.configured)
          if (data.clinic_name) setClinicName(data.clinic_name)
        }
      } catch {
        if (!cancelled) setConfigured(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  function toggleModule(mod: string) {
    setActiveModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    )
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setSubmitError('Hospital name is required')
      return
    }
    setSubmitError('')
    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('address', address.trim())
      formData.append('phone', phone.trim())
      formData.append('currency_symbol', currency.trim())
      formData.append('active_modules', JSON.stringify(activeModules))
      formData.append('primary_brand_color', brandColor)
      formData.append('ui_theme_class', themeClass)
      formData.append('deployment', deployment)
      if (logoFile) {
        formData.append('logo', logoFile)
      }

      await apiClient.post('/setup/configure', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      document.documentElement.className = themeClass
      document.documentElement.style.setProperty('--primary-color', brandColor)
      setSuccess(true)
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to save configuration')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Checking setup status...</p>
        </div>
      </div>
    )
  }

  if (configured) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-1">System is already configured</h2>
          <p className="text-sm text-slate-500 mb-6">
            {clinicName
              ? `${clinicName} is ready to use.`
              : 'Your system has been set up and is ready to use.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Building2 className="w-4 h-4" />
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Configuration Saved</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your hospital has been configured successfully. You can now log in to the system.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Building2 className="w-4 h-4" />
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <TokenGate onVerified={() => setUnlocked(true)} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-6 h-6 text-slate-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Setup Console</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure your hospital for first-time use</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Hospital Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lagos General Hospital"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Hospital Road, City"
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency Symbol</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="₦"
                maxLength={5}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Upload className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Logo Upload</h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-20 h-20 rounded-xl object-contain border border-slate-200 bg-white"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Upload Logo (.png)</label>
              <input
                type="file"
                accept=".png"
                onChange={handleLogoChange}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Cloud className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Modules</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {MODULES.map((mod) => (
              <ModuleCheckbox
                key={mod}
                label={mod}
                checked={activeModules.includes(mod)}
                onToggle={() => toggleModule(mod)}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Theme</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Primary Color</label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Theme Class</label>
              <select
                value={themeClass}
                onChange={(e) => setThemeClass(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                {THEME_CLASSES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Cloud className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Deployment</h2>
          </div>

          <div className="flex gap-4">
            {(['OFFLINE_STANDALONE', 'CLOUD_SAAS'] as DeploymentMode[]).map((mode) => {
              const labels: Record<DeploymentMode, string> = {
                OFFLINE_STANDALONE: 'Offline Standalone',
                CLOUD_SAAS: 'Cloud SaaS'
              }
              return (
                <label
                  key={mode}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl border cursor-pointer transition-all duration-200 flex-1 ${
                    deployment === mode
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="deployment"
                    value={mode}
                    checked={deployment === mode}
                    onChange={() => setDeployment(mode)}
                    className="w-4 h-4 text-blue-600 accent-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-700">{labels[mode]}</span>
                </label>
              )
            })}
          </div>
        </div>

        {submitError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
            {submitError}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {submitting ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        <div className="h-8" />
      </form>
    </div>
  )
}
