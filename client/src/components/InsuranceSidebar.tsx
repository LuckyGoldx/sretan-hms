import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, Shield, FileText, UserCog, LogOut, Menu, X, Search, PlusCircle, Activity, AlertTriangle, BarChart3 } from 'lucide-react'

const roleDepLinks = [
  { to: '/insurance/providers', label: 'Providers', icon: Building2, roles: ['admin'] },
  { to: '/insurance/staff', label: 'Staff', icon: UserCog, roles: ['admin'] },
]

export default function InsuranceSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('sretan_user')
    if (stored) { try { setUser(JSON.parse(stored)) } catch {} }
  }, [])

  function handleLogout() {
    localStorage.removeItem('sretan_token')
    localStorage.removeItem('sretan_user')
    window.location.href = '/insurance/login'
  }

  const displayName = user?.name || 'User'
  const displayRole = user?.role || ''
  const userRole = user?.role || ''
  const allLinks = [
    { to: '/insurance/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/insurance/cases', label: 'Cases', icon: Shield },
    { to: '/insurance/cases/new', label: 'New Case', icon: PlusCircle },
    { to: '/insurance/patients', label: 'Patients', icon: Search },
    { to: '/insurance/invoices', label: 'Invoices', icon: FileText },
    { to: '/insurance/auth-requests', label: 'Auth Requests', icon: AlertTriangle },
    { to: '/insurance/reports', label: 'Reports', icon: BarChart3 },
    ...roleDepLinks.filter(l => !l.roles || l.roles.includes(userRole)),
  ]

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 shadow-sm z-40 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">Insurance Portal</span>
          <button onClick={onClose} className="ml-auto lg:hidden p-1 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {allLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/insurance/dashboard'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
              {displayRole && <p className="text-xs text-slate-500">{displayRole}</p>}
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>
    </>
  )
}
