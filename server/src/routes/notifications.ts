import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { subscribeNotifications } from '../notifications/stream';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// GET /api/notifications/stream -- Server-Sent Events push for a recipient.
// Pushes an event whenever a notification row is inserted for this recipient
// (via the notifications NOTIFY trigger). Clients keep a slow polling fallback.
router.get('/api/notifications/stream', (req: Request, res: Response) => {
  const tenantId = getTenantId();
  const recipientId = String(req.query.recipient_id || '');
  if (!recipientId) {
    res.status(400).json({ error: true, message: 'recipient_id is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  // no-transform stops the compression middleware from buffering the stream.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();
  res.write('event: ready\ndata: {}\n\n');

  const unsubscribe = subscribeNotifications(tenantId, recipientId, res);
  const heartbeat = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch {}
  }, 25000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch {}
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

// GET /api/notifications -- list notifications for a recipient
router.get('/api/notifications', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const recipientId = String(req.query.recipient_id || '');
    const unreadOnly = req.query.unread_only === 'true';
    if (!recipientId) {
      res.status(400).json({ error: true, message: 'recipient_id is required' });
      return;
    }

    let query = `SELECT n.*,
        p.full_name as patient_name, p.hospital_number,
        s.name as recipient_name
      FROM notifications n
      LEFT JOIN patients p ON p.id = n.patient_id
      LEFT JOIN staff_users s ON s.id = n.recipient_id
      WHERE n.tenant_id = $1 AND n.recipient_id = $2`;
    const params: any[] = [tenantId, recipientId];

    if (unreadOnly) {
      query += ' AND n.is_read = false';
    }
    query += ' ORDER BY n.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/notifications/unread-count
router.get('/api/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const recipientId = String(req.query.recipient_id || '');
    if (!recipientId) {
      res.status(400).json({ error: true, message: 'recipient_id is required' });
      return;
    }
    const result = await pool.query(
      `SELECT COUNT(*)::int as unread FROM notifications
       WHERE tenant_id = $1 AND recipient_id = $2 AND is_read = false`,
      [tenantId, recipientId]
    );
    res.json({ unread: result.rows[0]?.unread || 0 });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/notifications/mark-read -- mark specific ids as read
router.put('/api/notifications/mark-read', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { ids } = req.body;
    const recipientId = typeof req.body.recipient_id === 'string' ? req.body.recipient_id : null;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: true, message: 'ids array is required' });
      return;
    }

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
    const params: any[] = [...ids];
    let query = `UPDATE notifications SET is_read = true WHERE id IN (${placeholders})`;
    if (recipientId) {
      query += ` AND recipient_id = $${params.length + 1}`;
      params.push(recipientId);
    }
    query += ` AND tenant_id = $${params.length + 1}`;
    params.push(tenantId);

    await pool.query(query, params);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/notifications/mark-all-read
router.put('/api/notifications/mark-all-read', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const recipientId = String(req.body.recipient_id || '');
    if (!recipientId) {
      res.status(400).json({ error: true, message: 'recipient_id is required' });
      return;
    }
    await pool.query(
      `UPDATE notifications SET is_read = true
       WHERE tenant_id = $1 AND recipient_id = $2 AND is_read = false`,
      [tenantId, recipientId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
