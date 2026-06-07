import { Pool } from 'pg';
import { readClinicProfile } from '../config/reader';
import { upwardSync } from './upwardSync';
import { downwardSync } from './downwardSync';
import { migrationListener } from './migrationListener';

export function startSyncDaemon(pool: Pool): void {
  const loop = async () => {
    try {
      const profile = readClinicProfile();

      if (!profile.cloud_sync_enabled) {
        console.log('Sync bypassed: cloud_sync_enabled is false');
        setTimeout(loop, 15000);
        return;
      }

      console.log('Sync cycle starting...');
      await upwardSync(pool, profile);
      await downwardSync(pool, profile);

      const updatedProfile = await migrationListener(pool, profile);
      if (updatedProfile !== profile) {
        console.log('Configuration updated via migration listener.');
      }
    } catch (err: any) {
      console.error('Sync daemon error:', err.message);
    }

    setTimeout(loop, 15000);
  };

  setTimeout(loop, 15000);
  console.log('Sync daemon started (15s interval).');
}
