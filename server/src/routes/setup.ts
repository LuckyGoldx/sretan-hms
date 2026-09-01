import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { readClinicProfile, writeProfile, ClinicProfile } from '../config/reader';
import { ensureSchema } from '../db/init';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'C:/hms/assets';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, 'logo.png');
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG files are allowed'));
    }
  },
});

router.get('/api/setup/status', (req: Request, res: Response) => {
  const profile = readClinicProfile();
  const configured = !!(profile.hospital_name && profile.hospital_name.trim().length > 0);
  const logoExists = fs.existsSync('C:/hms/assets/logo.png');
  res.json({
    configured,
    hospital_name: profile.hospital_name,
    address: profile.address || '',
    phone_number: profile.phone_number || '',
    currency_symbol: profile.currency_symbol || '₦',
    logo_url: logoExists ? '/assets/logo.png' : null,
    primary_brand_color: profile.primary_brand_color || '#2563eb',
    secondary_brand_color: profile.secondary_brand_color || '#10b981',
    ui_theme_class: profile.ui_theme_class || 'theme-trust-blue',
    deployment_mode: profile.deployment_mode || 'OFFLINE_STANDALONE',
    cloud_sync_enabled: profile.cloud_sync_enabled,
    hospital_number_prefix: profile.hospital_number_prefix || 'SRT',
    hospital_number_include_year: profile.hospital_number_include_year ?? true,
    module_records: profile.module_records,
    module_triage: profile.module_triage,
    module_consultation: profile.module_consultation,
    module_laboratory: profile.module_laboratory,
    module_pharmacy: profile.module_pharmacy,
    module_radiology: profile.module_radiology,
    module_finance_hmo: profile.module_finance_hmo,
    module_maternity: profile.module_maternity,
    module_insurance: profile.module_insurance,
    module_referrals: profile.module_referrals,
    module_appointments: profile.module_appointments,
    module_admissions: profile.module_admissions,
    module_paypoint: profile.module_paypoint,
    module_store: profile.module_store,
    module_doctor: profile.module_doctor,
    module_nurses: profile.module_nurses,
    module_consultants: profile.module_consultants,
  });
});

router.post('/api/setup/configure', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, any>;
    const currentProfile = readClinicProfile();
    const bool = (v: any, dflt: boolean): boolean => {
      if (v === undefined || v === null) return dflt;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v === 'true' || v === '1';
      return !!v;
    };

    const updatedProfile: ClinicProfile = {
      ...currentProfile,
      hospital_name: body.hospital_name || body.name || currentProfile.hospital_name,
      address: body.address ?? currentProfile.address,
      phone_number: body.phone_number ?? body.phone ?? currentProfile.phone_number,
      currency_symbol: body.currency_symbol || currentProfile.currency_symbol || '₦',
      primary_brand_color: body.primary_brand_color || currentProfile.primary_brand_color,
      secondary_brand_color: body.secondary_brand_color || currentProfile.secondary_brand_color,
      ui_theme_class: body.ui_theme_class || currentProfile.ui_theme_class,
      deployment_mode: body.deployment_mode || body.deployment || currentProfile.deployment_mode,
      cloud_sync_enabled: bool(body.cloud_sync_enabled, currentProfile.cloud_sync_enabled),
      module_records: bool(body.module_records, currentProfile.module_records),
      module_triage: bool(body.module_triage, currentProfile.module_triage),
      module_consultation: bool(body.module_consultation, currentProfile.module_consultation),
      module_laboratory: bool(body.module_laboratory, currentProfile.module_laboratory),
      module_pharmacy: bool(body.module_pharmacy, currentProfile.module_pharmacy),
      module_radiology: bool(body.module_radiology, currentProfile.module_radiology),
      module_finance_hmo: bool(body.module_finance_hmo, currentProfile.module_finance_hmo),
      module_maternity: bool(body.module_maternity, currentProfile.module_maternity),
      module_insurance: bool(body.module_insurance, currentProfile.module_insurance),
      module_referrals: bool(body.module_referrals, currentProfile.module_referrals),
      module_appointments: bool(body.module_appointments, currentProfile.module_appointments),
      module_admissions: bool(body.module_admissions, currentProfile.module_admissions),
      module_paypoint: bool(body.module_paypoint, currentProfile.module_paypoint),
      module_store: bool(body.module_store, currentProfile.module_store),
      module_doctor: bool(body.module_doctor, currentProfile.module_doctor),
      module_nurses: bool(body.module_nurses, currentProfile.module_nurses),
      module_consultants: bool(body.module_consultants, currentProfile.module_consultants),
      hospital_number_prefix: body.hospital_number_prefix || currentProfile.hospital_number_prefix,
      hospital_number_include_year: bool(body.hospital_number_include_year, currentProfile.hospital_number_include_year),
    };

    writeProfile(updatedProfile);
    await ensureSchema();

    res.json({ success: true, message: 'Configuration saved and database initialized' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/setup/verify-token', (req: Request, res: Response) => {
  const { passphrase } = req.body;
  if (passphrase === 'SRETAN_EMR_SETUP_2026') {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false, message: 'Invalid passphrase' });
  }
});

router.post('/api/setup/upload-logo', (req: Request, res: Response) => {
  upload.single('logo')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: true, message: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: true, message: 'No file uploaded' });
      return;
    }
    res.json({ success: true, path: 'C:/hms/assets/logo.png' });
  });
});

export default router;
