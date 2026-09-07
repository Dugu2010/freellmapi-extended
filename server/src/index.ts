import './env.js';
import { createApp } from './app.js';
import { initDb, getDb } from './db/index.js';
import { startHealthChecker } from './services/health.js';
import { getBatchWorker } from './services/batchWorker.js';
import { getWebhookDispatcher } from './services/batchWebhook.js';
import { startBatchRetention } from './services/batchRetention.js';
import { startImageRetention } from './services/imageStorage.js';
import { startRequestsRetention } from './services/requestsRetention.js';
import { restoreDbBackup, startDbBackup } from './services/dbBackup.js';
import { isDbBackupConfigured, restoreDbBackupIfNeeded, startDbBackupPump } from './lib/db-backup.js';

const PORT = process.env.PORT ?? 3001;

async function main() {
  // Use the exact FreeLLMAPI backup contract when FREEAPI_DB_BACKUP_TARGET,
  // FREEAPI_DB_BACKUP_URL, or FREEAPI_DB_BACKUP_PATH is configured.
  // Keep the existing Filebase implementation as a fallback so existing
  // Extended deployments do not need their current Render env vars changed.
  if (isDbBackupConfigured()) {
    await restoreDbBackupIfNeeded();
  } else {
    await restoreDbBackup();
  }

  initDb();
  const app = createApp();

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Proxy endpoint: http://0.0.0.0:${PORT}/v1/chat/completions`);
    startHealthChecker();
    getBatchWorker().start();
    getWebhookDispatcher().start();
    startBatchRetention();
    startImageRetention();
    startRequestsRetention();

    if (isDbBackupConfigured()) {
      startDbBackupPump(getDb(), { every: (ms: number, fn: () => void) => {
        const timer = setInterval(fn, ms);
        timer.unref?.();
        return () => clearInterval(timer);
      }} as never);
    } else {
      startDbBackup();
    }
  });
}

main().catch(console.error);
