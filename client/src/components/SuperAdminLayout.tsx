import { useState } from 'react'
import { Navigate, NavLink, useNavigate } from 'react-router-dom'
import {
  Shield, LayoutDashboard, Building2, Users, Settings, Database,
  ScrollText, Gauge, LogOut, Menu, X as XIcon, ArrowLeft, Cloud, RadioTower, Eraser
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/superadmin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/superadmin/hospitals', label: 'Hospitals', icon: Building2 },
  { to: '/superadmin/staff', label: 'Staff', icon: Users },
  { to: '/superadmin/setup', label: 'Setup Hospital', icon: Settings },
  { to: '/superadmin/backup', label: 'Backup & Restore', icon: Database },
  { to: '/superadmin/clear', label: 'Clear Data', icon: Eraser },
  { to: '/superadmin/cloud', label: 'Cloud & Sync', icon: Cloud },
  { to: '/superadmin/fleet', label: 'Fleet Monitor', icon: RadioTower },
  { to: '/superadmin/audit', label: 'Audit Logs', icon: ScrollText },
  { to: '/superadmin/health', label: 'System Health', icon: Gauge },
]

function getStoredUser(): any {
  try {
    const stored = localStorage.getItem('sretan_user')
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<any>(() => getStoredUser())

  const token = localStorage.getItem('sretan_superadmin_token')
  const authed = token && user && (user.role === 'SuperAdmin' || user.user_type === 'superadmin')
  if (!authed) {
    return <Navigate to="/superadmin/login" replace />
  }

  const displayName = user?.name || user?.username || 'Super Admin'

  function handleLogout() {
    localStorage.removeItem('sretan_superadmin_token')
    localStorage.removeItem('sretan_user')
    navigate('/superadmin/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-slate-900 text-slate-100 shadow-xl z-40 flex flex-col transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight">Super Admin</p>
            <p className="text-[11px] text-slate-400 truncate">Sretan EMR Global Console</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-white/10">
            <XIcon className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3 flex-shrink-0 space-y-1">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-[11px] text-slate-400">SuperAdmin</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-20 lg:hidden p-2 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>

      <main className="flex-1 p-4 lg:ml-64 lg:p-6 pt-16 lg:pt-6 overflow-x-hidden">
        <div className="flex items-center gap-2 mb-4 lg:hidden">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Clinical app
          </button>
        </div>
        {children}
      </main>
    </div>
  )
}
