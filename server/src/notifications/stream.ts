import { Response } from 'express';
import { Client } from 'pg';
import { createListenerClient } from '../db/pool';

// Server-Sent Events fan-out for notifications.
//
// A single dedicated (non-pooled) LISTEN connection receives Postgres NOTIFY
// events emitted by the trg_notifications_notify trigger and forwards each one
// to any connected SSE client for the matching tenant + recipient. If the
// listener drops, it reconnects while subscribers remain; clients also keep a
// low-frequency polling fallback so a broken stream never loses notifications.

const CHANNEL = 'sretan_notifications';
const RECONNECT_MS = 5000;

const subscribers = new Map<string, Set<Response>>();
let listener: Client | null = null;
let connecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;

function subscriberKey(tenantId: string, recipientId: string): string {
  return `${tenantId}:${recipientId}`;
}

export function subscribeNotifications(tenantId: string, recipientId: string, res: Response): () => void {
  const key = subscriberKey(tenantId, recipientId);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set<Response>();
    subscribers.set(key, set);
  }
  set.add(res);
  ensureListener();
  return () => {
    const current = subscribers.get(key);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) subscribers.delete(key);
  };
}

function dispatch(payload: any): void {
  if (!payload) return;
  const key = subscriberKey(String(payload.tenant_id || ''), String(payload.recipient_id || ''));
  const set = subscribers.get(key);
  if (!set || set.size === 0) return;
  const frame = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch {
      // Client vanished; its close handler will remove it.
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer || subscribers.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureListener();
  }, RECONNECT_MS);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

function ensureListener(): void {
  if (listener || connecting || subscribers.size === 0) return;
  connecting = true;
  const client = createListenerClient();
  let dead = false;

  const fail = (message: string) => {
    if (dead) return;
    dead = true;
    console.warn('[notifications]', message);
    try { client.removeAllListeners(); } catch {}
    try { client.end().catch(() => {}); } catch {}
    if (listener === client) listener = null;
    connecting = false;
    scheduleReconnect();
  };

  client.on('notification', (msg: any) => {
    if (msg?.channel !== CHANNEL || !msg.payload) return;
    try {
      dispatch(JSON.parse(msg.payload));
    } catch {}
  });
  client.on('error', (err: Error) => fail(`LISTEN connection error: ${err.message}`));
  client.on('end', () => {
    if (listener === client) {
      listener = null;
      connecting = false;
      scheduleReconnect();
    }
  });

  client.connect()
    .then(() => client.query(`LISTEN ${CHANNEL}`))
    .then(() => {
      if (dead) return;
      listener = client;
      connecting = false;
    })
    .catch((err: Error) => fail(`failed to LISTEN: ${err.message}`));
}

export function notificationSubscriberCount(): number {
  let count = 0;
  for (const set of subscribers.values()) count += set.size;
  return count;
}
