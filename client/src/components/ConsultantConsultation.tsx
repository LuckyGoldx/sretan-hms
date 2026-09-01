import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../hooks/useAxios'
import DoctorConsultation from './DoctorConsultation'

interface ReferralInfo {
  id: string
  referral_number: string
  priority: string
  status: string
  reason: string
  referred_by_name: string
  to_department_name: string
  patient_name: string
  accepted_by_name?: string | null
  accepted_at?: string | null
  to_consultant_name?: string | null
}

export default function ConsultantConsultation() {
  const { patientId } = useParams<{ patientId: string }>()
  const urlParams = new URLSearchParams(window.location.search)
  const referralId = urlParams.get('referral_id')

  const [referral, setReferral] = useState<ReferralInfo | null>(null)
  const [actingOnReferral, setActingOnReferral] = useState(false)

  const currentStaffId: string | null = (() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {}
    return null
  })()

  // Load referral info + auto-accept + auto-start when opened by a consultant
  useEffect(() => {
    if (!referralId || !patientId) return

    let cancelled = false

    async function load() {
      try {
        const res = await api.get(`/referrals/${referralId}`)
        if (cancelled || !res.data?.id) return
        setReferral(res.data)

        // Auto-accept pending referral, then transition to in_consultation (start)
        if (res.data.status === 'pending') {
          setActingOnReferral(true)
          try {
            await api.put(`/referrals/${referralId}/accept`, { performed_by: currentStaffId })
            if (!cancelled) setReferral((prev) => prev ? { ...prev, status: 'accepted' } : prev)
          } catch {}
          setActingOnReferral(false)
        }
        if (res.data.status === 'accepted' || res.data.status === 'pending') {
          try {
            await api.put(`/referrals/${referralId}/start`, { performed_by: currentStaffId })
            if (!cancelled) setReferral((prev) => prev ? { ...prev, status: 'in_consultation' } : prev)
          } catch {}
        }
      } catch {}
    }

    load()
    return () => { cancelled = true }
  }, [referralId, patientId, currentStaffId])

  return (
    <DoctorConsultation referral={referral} />
  )
}
