export type TriagePriority = 'red' | 'yellow' | 'green'

export interface ClinicProfile {
  id: string
  tenant_id: string
  clinic_name: string
  clinic_address: string
  clinic_phone: string
  clinic_email: string
  license_number: string
  theme: string
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface Patient {
  id: string
  tenant_id: string
  hospital_number: string
  full_name: string
  dob: string
  sex: string
  phone: string
  next_of_kin: string
  insurance: string
  blood_type: string
  status: string
  created_at: string
}

export interface Encounter {
  id: string
  tenant_id: string
  patient_id: string
  staff_id: string
  encounter_type: string
  chief_complaint: string
  soap_notes: any
  diagnoses: any
  created_at: string
  updated_at: string
}

export interface Vitals {
  id: string
  tenant_id: string
  encounter_id: string
  systolic_bp: number
  diastolic_bp: number
  pulse: number
  temperature: number
  respiration_rate: number
  weight: number
  spo2: number
  triage_priority: TriagePriority
  nursing_notes: string
  fluid_intake: number
  fluid_output: number
  created_at: string
}

export interface Prescription {
  id: string
  tenant_id: string
  encounter_id: string
  drug_name: string
  dosage: string
  quantity: number
  instructions: string
  status: string
  created_at: string
}

export interface LabOrder {
  id: string
  tenant_id: string
  encounter_id: string
  test_name: string
  status: string
  specimen_type: string
  priority: string
  patient_name: string
  patient_phone: string
  referred_by: string
  created_at: string
}

export interface LabResult {
  id: string
  tenant_id: string
  lab_order_id: string
  analyte_name: string
  value: string
  reference_range_low: string
  reference_range_high: string
  is_abnormal: boolean
  approved_by: string
  approved_at: string
  status: string
}

export interface RadiologyOrder {
  id: string
  tenant_id: string
  encounter_id: string
  imaging_type: string
  status: string
  report_text: string
  image_path: string
  created_at: string
}

export interface BillingInvoice {
  id: string
  tenant_id: string
  patient_id: string
  encounter_id: string
  total_amount: number
  amount_paid: number
  balance: number
  payment_method: string
  payment_ref: string
  status: string
  created_at: string
}

export interface InventoryItem {
  id: string
  tenant_id: string
  drug_name: string
  batch_number: string
  stock_count: number
  reorder_level: number
  expiry_date: string
  supplier: string
}

export interface StaffUser {
  id: string
  tenant_id: string
  email: string
  name: string
  role: string
  metadata: Record<string, unknown>
}
