import { useState, useEffect } from 'react'
import api from './useAxios'

export interface ClinicConfig {
  configured: boolean
  hospital_name?: string
  logo_url?: string | null
  primary_brand_color?: string
  secondary_brand_color?: string
  ui_theme_class?: string
  deployment_mode?: string
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
