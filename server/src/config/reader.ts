import * as fs from 'fs';
import * as path from 'path';

export interface ClinicProfile {
  GLOBAL_SAAS_TENANT_ID: string;
  hospital_name: string;
  address: string;
  phone_number: string;
  currency_symbol: string;
  cloud_sync_enabled: boolean;
  primary_brand_color: string;
  secondary_brand_color: string;
  ui_theme_class: string;
  deployment_mode: 'OFFLINE_STANDALONE' | 'CLOUD_SAAS' | 'PRIVATE_SUPABASE';
  private_supabase_url: string;
  private_supabase_anon_key: string;
  module_records: boolean;
  module_triage: boolean;
  module_consultation: boolean;
  module_laboratory: boolean;
  module_pharmacy: boolean;
  module_radiology: boolean;
  module_finance_hmo: boolean;
  hospital_number_prefix: string;
  hospital_number_include_year: boolean;
}

const CONFIG_PATH = 'C:/hms/config/clinic_profile.json';

export function readClinicProfile(): ClinicProfile {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw) as ClinicProfile;
    }
  } catch {
  }
  return {
    GLOBAL_SAAS_TENANT_ID: '',
    hospital_name: '',
    address: '',
    phone_number: '',
    currency_symbol: '₦',
    cloud_sync_enabled: false,
    primary_brand_color: '#2563eb',
    secondary_brand_color: '#10b981',
    ui_theme_class: 'theme-trust-blue',
    deployment_mode: 'OFFLINE_STANDALONE',
    private_supabase_url: '',
    private_supabase_anon_key: '',
    module_records: true,
    module_triage: true,
    module_consultation: true,
    module_laboratory: false,
    module_pharmacy: false,
    module_radiology: false,
    module_finance_hmo: false,
    hospital_number_prefix: 'SRT',
    hospital_number_include_year: true,
  };
}

export function writeProfile(profile: ClinicProfile): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(profile, null, 2), 'utf-8');
}
