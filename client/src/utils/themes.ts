export interface ThemeDef {
  value: string
  label: string
  primary: string
  secondary: string
}

export const THEMES: ThemeDef[] = [
  { value: 'theme-trust-blue', label: 'Trust Blue', primary: '#2563eb', secondary: '#10b981' },
  { value: 'theme-emerald-green', label: 'Emerald Green', primary: '#059669', secondary: '#34d399' },
  { value: 'theme-charcoal-clinical', label: 'Charcoal Clinical', primary: '#334155', secondary: '#64748b' },
  { value: 'theme-royal-purple', label: 'Royal Purple', primary: '#7c3aed', secondary: '#a78bfa' },
  { value: 'theme-ocean-teal', label: 'Ocean Teal', primary: '#0d9488', secondary: '#5eead4' },
  { value: 'theme-crimson-red', label: 'Crimson Red', primary: '#dc2626', secondary: '#fca5a5' },
  { value: 'theme-sunset-amber', label: 'Sunset Amber', primary: '#d97706', secondary: '#fcd34d' },
  { value: 'theme-forest-green', label: 'Forest Green', primary: '#15803d', secondary: '#86efac' },
  { value: 'theme-slate-modern', label: 'Slate Modern', primary: '#0f172a', secondary: '#38bdf8' },
  { value: 'theme-blush-rose', label: 'Blush Rose', primary: '#e11d48', secondary: '#fda4af' },
]

export const THEME_PRIMARYS: Record<string, string> = Object.fromEntries(
  THEMES.map((t) => [t.value, t.primary])
)

export function getThemeDef(value: string | null | undefined): ThemeDef | undefined {
  return THEMES.find((t) => t.value === value)
}
