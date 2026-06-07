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
  res.json({
    configured,
    hospital_name: profile.hospital_name,
    logo_url: null,
    primary_brand_color: profile.primary_brand_color || '#2563eb',
    secondary_brand_color: profile.secondary_brand_color || '#10b981',
    ui_theme_class: profile.ui_theme_class || 'theme-trust-blue',
    deployment_mode: profile.deployment_mode || 'OFFLINE_STANDALONE',
    cloud_sync_enabled: profile.cloud_sync_enabled,
    module_records: profile.module_records,
    module_triage: profile.module_triage,
    module_consultation: profile.module_consultation,
    module_laboratory: profile.module_laboratory,
    module_pharmacy: profile.module_pharmacy,
    module_radiology: profile.module_radiology,
    module_finance_hmo: profile.module_finance_hmo,
  });
});

router.post('/api/setup/configure', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<ClinicProfile>;

    const currentProfile = readClinicProfile();
    const updatedProfile: ClinicProfile = {
      ...currentProfile,
      ...body,
      cloud_sync_enabled: body.cloud_sync_enabled ?? currentProfile.cloud_sync_enabled,
      module_records: body.module_records ?? currentProfile.module_records,
      module_triage: body.module_triage ?? currentProfile.module_triage,
      module_consultation: body.module_consultation ?? currentProfile.module_consultation,
      module_laboratory: body.module_laboratory ?? currentProfile.module_laboratory,
      module_pharmacy: body.module_pharmacy ?? currentProfile.module_pharmacy,
      module_radiology: body.module_radiology ?? currentProfile.module_radiology,
      module_finance_hmo: body.module_finance_hmo ?? currentProfile.module_finance_hmo,
      deployment_mode: body.deployment_mode || currentProfile.deployment_mode,
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
