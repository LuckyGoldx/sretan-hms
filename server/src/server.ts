import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import multer from 'multer';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { ensureSchema } from './db/init';
import { startSyncDaemon } from './sync/syncDaemon';
import { detectSchemaChanges } from './utils/schemaVersion';
import { startUpdateDaemon } from './utils/updateDaemon';
import pool from './db/pool';
import healthRouter from './routes/health';
import patientsRouter from './routes/patients';
import vitalsRouter from './routes/vitals';
import prescriptionsRouter from './routes/prescriptions';
import labRouter from './routes/lab';
import pharmacyRouter from './routes/pharmacy';
import billingRouter from './routes/billing';
import setupRouter from './routes/setup';
import authRouter from './routes/auth';
import staffRouter from './routes/staff';
import tenantsRouter from './routes/tenants';
import purchaseOrdersRouter from './routes/purchaseOrders';
import encountersRouter from './routes/encounters';
import radiologyOrdersRouter from './routes/radiologyOrders';
import admissionsRouter from './routes/admissions';
import appointmentsRouter from './routes/appointments';
import otcSalesRouter from './routes/otcSales';
import nurseModuleRouter from './routes/nurseModule';
import recordsRouter from './routes/records';
import setupConsoleRouter from './setup/setupConsole';
import paymentsRouter from './routes/payments';
import maternityRouter from './routes/maternity';
import insuranceAuthRouter from './routes/insuranceAuth';
import insuranceProvidersRouter from './routes/insuranceProviders';
import insuranceStaffRouter from './routes/insuranceStaff';
import insuranceCasesRouter from './routes/insuranceCases';
import insuranceInvoicesRouter from './routes/insuranceInvoices';
import insuranceReportsRouter from './routes/insuranceReports';
import insuranceCoverageRouter from './routes/insuranceCoverage';
import consultantsRouter from './routes/consultants';
import notificationsRouter from './routes/notifications';
import visitsRouter from './routes/visits';
import superadminRouter from './routes/superadmin';

declare global {
  var clockTampered: boolean | undefined;
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(healthRouter);
app.use(patientsRouter);
app.use(vitalsRouter);
app.use(prescriptionsRouter);
app.use(labRouter);
app.use(pharmacyRouter);
app.use(billingRouter);
app.use(authRouter);
app.use(staffRouter);
app.use(tenantsRouter);
app.use(purchaseOrdersRouter);
app.use(encountersRouter);
app.use(radiologyOrdersRouter);
app.use(admissionsRouter);
app.use(appointmentsRouter);
app.use(otcSalesRouter);
app.use(nurseModuleRouter);
app.use(recordsRouter);
app.use(setupRouter);
app.use(setupConsoleRouter);
app.use(paymentsRouter);
app.use(maternityRouter);
app.use(insuranceAuthRouter);
app.use(insuranceProvidersRouter);
app.use(insuranceStaffRouter);
app.use(insuranceCasesRouter);
app.use(insuranceInvoicesRouter);
app.use(insuranceReportsRouter);
app.use(insuranceCoverageRouter);
app.use(consultantsRouter);
app.use(notificationsRouter);
app.use(visitsRouter);
app.use(superadminRouter);

app.use(errorHandler);

// Upload directory for radiology images
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir, { recursive: true }); }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    var ext = path.extname(file.originalname) || '.png';
    cb(null, `rad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir));
app.use('/assets', express.static('C:/hms/assets'));

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: true, message: 'No file uploaded' });
  try {
    var ext = path.extname(req.file.filename).toLowerCase();
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      var compressed = await sharp(req.file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      fs.writeFileSync(req.file.path, compressed);
      res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename, compressed: true });
    } else {
      res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename, compressed: false });
    }
  } catch (err: any) {
    // Original file is untouched - sharp failed but file remains
    res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename, compressed: false });
  }
});

// Serve the built React web app from the same port (single-port production
// deployment: http://<host-ip>:3000 serves both the app and the /api routes).
// The Vite build output lives at <install_root>/client/dist. API/upload/asset
// requests are never swallowed by the SPA fallback.
const distDir = path.resolve(__dirname, '..', '..', 'client', 'dist');
const indexPath = path.join(distDir, 'index.html');
app.use(express.static(distDir));
app.get('*', (req: any, res: any) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/assets')) {
    res.status(404).json({ error: true, message: 'Not found' });
    return;
  }
  if (!fs.existsSync(indexPath)) {
    res.status(404).send('Web client is not built. Run `npm run build` in the client folder first.');
    return;
  }
  res.sendFile(indexPath);
});

async function start(): Promise<void> {
  try {
    ['C:/hms/logs', 'C:/hms/assets'].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    try {
      await ensureSchema();
      // Offline-first sync daemon: it reads the active hospital's deployment
      // config each cycle and only syncs when cloud_sync_enabled is true and a
      // Supabase URL/key are configured (Cloud SaaS / Private Supabase). When
      // Offline Standalone, it bypasses and the system stays fully local.
      startSyncDaemon(pool);
      // Detect schema changes (new migration files) and reset sync flags so all
      // rows (including old data) re-push to the cloud after a schema update.
      await detectSchemaChanges(pool);
      // Remote code deployment: auto-pulls new code from the central git repo
      // when auto-update is enabled on this machine (offline-first).
      startUpdateDaemon();
    } catch (dbErr) {
      console.warn('Database initialization failed (server will run without DB):', (dbErr as Error).message);
    }

    app.listen(PORT, () => {
      console.log(`MACHOKO HMS Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
