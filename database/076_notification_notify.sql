-- 076_notification_notify.sql
-- Push new notifications to connected clients instead of relying on polling.
--
-- An AFTER INSERT trigger emits a Postgres NOTIFY on the sretan_notifications
-- channel. The API holds a LISTEN connection and forwards matching payloads to
-- Server-Sent Events subscribers (see server/src/notifications/stream.ts).
-- Client polling remains as a fallback if the stream is unavailable.

CREATE OR REPLACE FUNCTION notify_notification_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'sretan_notifications',
    json_build_object(
      'id', NEW.id,
      'tenant_id', NEW.tenant_id,
      'recipient_id', NEW.recipient_id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'ref_table', NEW.ref_table,
      'ref_id', NEW.ref_id,
      'patient_id', NEW.patient_id,
      'is_read', NEW.is_read,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notifications_notify ON notifications;
CREATE TRIGGER trg_notifications_notify
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_notification_insert();
