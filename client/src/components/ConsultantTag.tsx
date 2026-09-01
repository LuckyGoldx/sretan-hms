import { Stethoscope, Building2 } from 'lucide-react'

interface ConsultantTagProps {
  departmentName?: string | null
  size?: 'sm' | 'xs'
}

/**
 * Renders the indigo "CONSULTANT · {Department}" badge used across
 * consultations, pharmacy, lab, radiology histories, and patient chart.
 * Returns null when the order/encounter is not a consultant entry.
 */
export default function ConsultantTag({ departmentName, size = 'xs' }: ConsultantTagProps) {
  const text = size === 'xs' ? 'text-[10px]' : 'text-xs'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold ${text}`}>
      <Stethoscope size={10} className="flex-shrink-0" />
      CONSULTANT
      {departmentName ? (
        <span className="inline-flex items-center gap-0.5 font-semibold">
          · {departmentName}
          <Building2 size={9} className="opacity-60" />
        </span>
      ) : null}
    </span>
  )
}
