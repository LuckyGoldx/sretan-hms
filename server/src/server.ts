import express from 'express';
import * as fs from 'fs';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { ensureSchema } from './db/init';
import { startSyncDaemon } from './sync/syncDaemon';
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

declare global {
  var clockTampered: boolean | undefined;
}

const app = express();
const PORT = 3000;

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

app.use(errorHandler);

async function start(): Promise<void> {
  try {
    ['C:/hms/logs', 'C:/hms/assets'].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    try {
      await ensureSchema();
      startSyncDaemon(pool);
    } catch (dbErr) {
      console.warn('Database initialization failed (server will run without DB):', (dbErr as Error).message);
    }

    app.listen(PORT, () => {
      console.log(`Sretan EMR Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
