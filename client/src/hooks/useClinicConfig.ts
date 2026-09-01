import { useState, useEffect } from 'react'
import api from './useAxios'

export interface ClinicConfig {
  configured: boolean
  hospital_name?: string
  address?: string
  phone_number?: string
  currency_symbol?: string
  logo_url?: string | null
  primary_brand_color?: string
  secondary_brand_color?: string
  ui_theme_class?: string
  deployment_mode?: string
  hospital_number_prefix?: string
  hospital_number_include_year?: boolean
  module_records?: boolean
  module_triage?: boolean
  module_consultation?: boolean
  module_laboratory?: boolean
  module_pharmacy?: boolean
  module_radiology?: boolean
  module_finance_hmo?: boolean
  module_maternity?: boolean
  module_insurance?: boolean
  module_referrals?: boolean
  module_appointments?: boolean
  module_admissions?: boolean
  module_paypoint?: boolean
  module_store?: boolean
  module_doctor?: boolean
  module_nurses?: boolean
  module_consultants?: boolean
}

export function useClinicConfig() {
  const [config, setConfig] = useState<ClinicConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/setup/status')
      setConfig(data)
    } catch (err: any) {
      setError(err.message)
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }

  return { config, loading, error, refetch: fetchConfig, configured: config?.configured ?? false }
}
