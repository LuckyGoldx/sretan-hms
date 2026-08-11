import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, Loader2, Building2, Settings } from 'lucide-react'
import { useClinicConfig } from '../hooks/useClinicConfig'

export default function Login() {
  const { config, loading, configured } = useClinicConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const brandColor = config?.primary_brand_color || '#2563eb'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      // Try clinical auth first
      try {
        const res = await api.post('/auth/login', { email, password })
        localStorage.setItem('sretan_token', res.data.token)
        localStorage.setItem('sretan_user', JSON.stringify(res.data.user))
        window.location.href = '/dashboard'
        return
      } catch (clinicalErr: any) {
        // If clinical fails (401), try insurance auth
        if (clinicalErr.response?.status === 401) {
          try {
            const insRes = await api.post('/insurance/auth/login', { email, password })
            localStorage.setItem('sretan_token', insRes.data.token)
            localStorage.setItem('sretan_user', JSON.stringify(insRes.data.user))
            window.location.href = '/insurance/dashboard'
            return
          } catch (insErr: any) {
            setError(insErr.response?.data?.message || 'Invalid credentials')
            return
          }
        }
        setError(clinicalErr.response?.data?.message || 'Invalid credentials')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-500">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Clinic Not Configured</h2>
          <p className="text-sm text-slate-500 mb-6">
            No clinic profile found. Please complete the initial setup to get started.
          </p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Settings className="w-4 h-4" />
            Go to Setup
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl rounded-b-none px-8 py-6 text-white text-center"
          style={{ backgroundColor: brandColor }}
        >
          {config?.logo_url ? (
            <img
              src={config.logo_url}
              alt={config.hospital_name || 'Logo'}
              className="h-14 mx-auto mb-3 object-contain"
            />
          ) : (
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-7 h-7 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold">{config?.hospital_name || 'Clinic'}</h1>
          <p className="text-sm text-white/80 mt-1">Clinical & Insurance Staff</p>
        </div>

        <div className="bg-white rounded-2xl rounded-t-none shadow-sm border border-slate-200 border-t-0 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by <span className="font-semibold text-slate-500">Sretan Tech</span>
        </p>
      </div>
    </div>
  )
}


