export interface ClinicInfo {
  hospital_name?: string
  address?: string
  phone_number?: string
  currency_symbol?: string
  logo_url?: string | null
  primary_brand_color?: string
  secondary_brand_color?: string
  ui_theme_class?: string
}

let cached: ClinicInfo | null = null
let promise: Promise<ClinicInfo | null> | null = null

export function loadClinicInfo(): Promise<ClinicInfo | null> {
  if (!promise) {
    promise = fetch('/api/setup/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { cached = d; return d })
      .catch(() => null)
  }
  return promise
}

export function getClinicInfo(): ClinicInfo {
  return cached || {}
}

export function refreshClinicInfo(): Promise<ClinicInfo | null> {
  promise = null
  return loadClinicInfo()
}
