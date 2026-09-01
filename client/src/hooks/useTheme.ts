import { useEffect } from 'react'
import { useClinicConfig } from './useClinicConfig'
import { THEMES } from '../utils/themes'

const KNOWN_PRIMARYS = THEMES.map((t) => t.primary.toLowerCase())
const KNOWN_SECONDARYS = THEMES.map((t) => t.secondary.toLowerCase())

export function useTheme() {
  const { config, loading } = useClinicConfig()

  useEffect(() => {
    if (loading || !config) return

    const root = document.documentElement

    if (config.ui_theme_class) {
      root.className = config.ui_theme_class
    }

    // The theme class defines the palette and always wins. The stored brand
    // colors only act as a custom override when they are NOT one of the
    // standard theme colors (stale theme colors from older configs are ignored
    // so switching themes visibly changes the app).
    const primary = config.primary_brand_color
    const secondary = config.secondary_brand_color

    if (primary && !KNOWN_PRIMARYS.includes(primary.toLowerCase())) {
      root.style.setProperty('--primary-color', primary)
    }
    if (secondary && !KNOWN_SECONDARYS.includes(secondary.toLowerCase())) {
      root.style.setProperty('--secondary-color', secondary)
    }
  }, [config, loading])
}
