export function validatePhone(phone: string): { valid: boolean; error?: string } {
  const cleaned = phone.replace(/[^0-9+]/g, '')
  if (cleaned.length === 0) return { valid: false }
  if (phone !== cleaned) return { valid: false, error: 'Only numbers and + allowed' }
  const digits = cleaned.replace(/[^0-9]/g, '')
  if (digits.length < 11) return { valid: false, error: `Need ${11 - digits.length} more digit(s)` }
  return { valid: true }
}
