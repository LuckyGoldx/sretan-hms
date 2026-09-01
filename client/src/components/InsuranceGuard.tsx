import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

/**
 * Guards the /insurance/* portal. Access is allowed only for:
 * - insurance staff (logged in via /insurance/login → user_type === 'insurance_staff'), or
 * - the main app Admin (role === 'Admin').
 * Everyone else is redirected to the insurance login.
 */
export default function InsuranceGuard({ children }: { children: ReactNode }) {
  const user = (() => {
    try {
      const stored = localStorage.getItem('sretan_user')
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  })()

  const isInsuranceStaff = user?.user_type === 'insurance_staff'
  const isAdmin = user?.role === 'Admin'

  if (!isInsuranceStaff && !isAdmin) {
    return <Navigate to="/insurance/login" replace />
  }
  return <>{children}</>
}
