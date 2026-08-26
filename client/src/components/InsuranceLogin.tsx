import { useState } from 'react'
import { LogIn, Loader2, Building2, Shield } from 'lucide-react'

export default function InsuranceLogin() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier || !password) {
      setError('Please fill in all fields')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.post('/insurance/auth/login', { username: identifier, password })
      localStorage.setItem('sretan_token', res.data.token)
      localStorage.setItem('sretan_user', JSON.stringify(res.data.user))
      window.location.href = '/insurance/dashboard'
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl rounded-b-none px-8 py-6 text-white text-center bg-emerald-600">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold">Insurance Portal</h1>
          <p className="text-sm text-emerald-100 mt-1">HMO Staff Login</p>
        </div>

        <div className="bg-white rounded-2xl rounded-t-none shadow-sm border border-slate-200 border-t-0 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username or Email</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. hmo_admin"
                autoComplete="username"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 bg-emerald-600"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/login" className="text-sm text-slate-500 hover:text-slate-700 underline">
              Back to Clinical Staff Login
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by <span className="font-semibold text-slate-500">Sretan Tech</span>
        </p>
      </div>
    </div>
  )
}
