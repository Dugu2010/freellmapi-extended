import './env.js';
import { createApp } from './app.js';
import { initDb } from './db/index.js';
import { startHealthChecker } from './services/health.js';
import { getBatchWorker } from './services/batchWorker.js';
import { getWebhookDispatcher } from './services/batchWebhook.js';
import { startBatchRetention } from './services/batchRetention.js';
import { startImageRetention } from './services/imageStorage.js';
import { startRequestsRetention } from './services/requestsRetention.js';
import { restoreDbBackup, startDbBackup } from './services/dbBackup.js';

const PORT = process.env.PORT ?? 3001;

async function main() {
  // If remote DB persistence is configured, restore the latest encrypted
  // snapshot before SQLite opens the database. Existing deployments without
  // the backup variables keep the exact old startup behaviour.
  await restoreDbBackup();
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
    startDbBackup();
  });
}

main().catch(console.error);
