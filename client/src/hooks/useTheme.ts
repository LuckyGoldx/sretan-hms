import { useEffect } from 'react'
import { useClinicConfig } from './useClinicConfig'

export function useTheme() {
  const { config, loading } = useClinicConfig()

  useEffect(() => {
    if (loading || !config) return

    const root = document.documentElement

    if (config.ui_theme_class) {
      root.className = config.ui_theme_class
    }

    if (config.primary_brand_color) {
      root.style.setProperty('--primary-color', config.primary_brand_color)
    }
    if (config.secondary_brand_color) {
      root.style.setProperty('--secondary-color', config.secondary_brand_color)
    }
  }, [config, loading])
}
