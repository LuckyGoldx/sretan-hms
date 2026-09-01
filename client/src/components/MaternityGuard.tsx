import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

/**
 * Guards maternity routes for the Consultant role: consultants may access
 * maternity only when their department grants the "maternity" module
 * (i.e. Gynae & Obstetrics). Other roles pass through unchanged.
 */
export default function MaternityGuard({ children }: { children: ReactNode }) {
  const user = (() => {
    try {
      const stored = localStorage.getItem('sretan_user')
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  })()

  if (user?.role === 'Consultant') {
    const modules = Array.isArray(user.department_modules) ? user.department_modules : []
    if (!modules.includes('maternity')) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <>{children}</>
}
