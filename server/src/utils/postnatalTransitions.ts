import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

// A patient remains in postnatal care for 42 days (6 weeks) after delivery.
// Once that window elapses the pregnancy is automatically moved from the
// Postnatal Ward into Postnatal History by flipping its status from
// 'delivered' to 'postnatal_closed'. The clinical records are kept.
export const POSTNATAL_DAYS = 42;

export async function closeOverduePostnatal(tenantId?: string): Promise<number> {
  const tid = tenantId || readClinicProfile().GLOBAL_SAAS_TENANT_ID;
  const result = await pool.query(
    `UPDATE maternity_patients mp
        SET status = 'postnatal_closed', updated_at = NOW()
      WHERE mp.tenant_id = $1
        AND mp.status = 'delivered'
        AND (
          -- Dated delivery past the 42-day window.
          EXISTS (
            SELECT 1 FROM maternity_deliveries md
             WHERE md.maternity_patient_id = mp.id
               AND md.delivery_date IS NOT NULL
               AND md.delivery_date <= CURRENT_DATE - make_interval(days => $2::int)
          )
          -- Safety net: a delivered record with no delivery date (data gap) is
          -- closed using the stable booking/creation date as the anchor.
          OR (
            NOT EXISTS (
              SELECT 1 FROM maternity_deliveries md
               WHERE md.maternity_patient_id = mp.id AND md.delivery_date IS NOT NULL
            )
            AND COALESCE(mp.booked_at, mp.created_at) <= NOW() - make_interval(days => $2::int)
          )
        )`,
    [tid, POSTNATAL_DAYS]
  );
  return result.rowCount || 0;
}

// Runs once on boot and then every 6 hours. The maternity list endpoints also
// run the same idempotent transition on read, so the ward/history are correct
// even if the process restarted recently.
export function startPostnatalDaemon(): void {
  const run = async () => {
    try {
      const moved = await closeOverduePostnatal();
      if (moved > 0) console.log(`[postnatal] Moved ${moved} record(s) to postnatal history.`);
    } catch (err: any) {
      console.error('[postnatal] auto-close failed:', err?.message);
    }
    setTimeout(run, 6 * 60 * 60 * 1000);
  };
  setTimeout(run, 5000);
}
