import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Loader2, LogIn } from 'lucide-react'
import api from '../hooks/useAxios'

export default function SuperAdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) {
      setError('Please fill in all fields')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await api.post('/superadmin/login', { username, password })
      localStorage.setItem('sretan_superadmin_token', res.data.token)
      localStorage.setItem('sretan_user', JSON.stringify(res.data.user))
      navigate('/superadmin', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 rounded-2xl rounded-b-none px-8 py-6 text-white text-center">
          <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Shield className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold">Super Admin Console</h1>
          <p className="text-sm text-slate-300 mt-1">Global hospital, staff, backup &amp; restore management</p>
        </div>

        <div className="bg-white rounded-2xl rounded-t-none shadow-sm border border-slate-200 border-t-0 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="superadmin username"
                autoComplete="username"
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
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 bg-slate-900 hover:bg-slate-800"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center mt-6">
            <Link to="/login" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
              ← Back to clinical login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
