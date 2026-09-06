import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const ALGORITHM = 'aes-256-gcm';
const MAGIC = Buffer.from('FREEAPI-BACKUP-V1\n', 'utf8');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/freeapi.db');

function config() {
  const url = process.env.FREEAPI_DB_BACKUP_URL?.trim();
  const token = process.env.FREEAPI_DB_BACKUP_TOKEN?.trim();
  const keyHex = process.env.FREEAPI_DB_BACKUP_KEY?.trim();
  if (!url || !token || !keyHex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('Invalid FREEAPI_DB_BACKUP_KEY: expected exactly 64 hex chars (32 bytes).');
  const interval = Number(process.env.FREEAPI_DB_BACKUP_INTERVAL_MS ?? 300000);
  return { url, token, key: Buffer.from(keyHex, 'hex'), intervalMs: Number.isFinite(interval) && interval >= 60000 ? interval : 300000 };
}

async function encryptBackup(data: Buffer, key: Buffer): Promise<Buffer> {
  const compressed = await gzip(data, { level: 9 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

async function decryptBackup(data: Buffer, key: Buffer): Promise<Buffer> {
  const headerLength = MAGIC.length + 12 + 16;
  if (data.length <= headerLength || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid or unsupported database backup format.');
  const ivStart = MAGIC.length;
  const tagStart = ivStart + 12;
  const encryptedStart = tagStart + 16;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, data.subarray(ivStart, tagStart));
  decipher.setAuthTag(data.subarray(tagStart, encryptedStart));
  const compressed = Buffer.concat([decipher.update(data.subarray(encryptedStart)), decipher.final()]);
  return gunzip(compressed);
}

async function downloadBackup(cfg: NonNullable<ReturnType<typeof config>>): Promise<Buffer | null> {
  const response = await fetch(cfg.url, { method: 'GET', headers: { Authorization: `Bearer ${cfg.token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backup download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadBackup(cfg: NonNullable<ReturnType<typeof config>>, payload: Buffer): Promise<void> {
  const response = await fetch(cfg.url, { method: 'PUT', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) }, body: payload });
  if (!response.ok) throw new Error(`Backup upload failed: HTTP ${response.status}`);
}

export async function restoreDbBackup(): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    const backup = await downloadBackup(cfg);
    if (!backup) { console.log('[db-backup] No remote backup found; starting with local DB.'); return; }
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    const tempPath = `${DB_PATH}.restore-${process.pid}`;
    await fs.writeFile(tempPath, await decryptBackup(backup, cfg.key), { mode: 0o600 });
    await fs.rename(tempPath, DB_PATH);
    console.log('[db-backup] Restored database from remote backup.');
  } catch (error) {
    console.error('[db-backup] Restore failed; keeping the local DB to avoid data loss.', error);
  }
}

async function createAndUploadBackup(): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const tempPath = `${DB_PATH}.backup-${process.pid}`;
  try {
    await getDb().backup(tempPath);
    const sqliteFile = await fs.readFile(tempPath);
    await uploadBackup(cfg, await encryptBackup(sqliteFile, cfg.key));
    console.log('[db-backup] Remote backup uploaded.');
  } catch (error) {
    console.error('[db-backup] Backup failed:', error);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export function startDbBackup(): void {
  const cfg = config();
  if (!cfg) { console.log('[db-backup] Remote persistence disabled (backup env vars not configured).'); return; }
  setTimeout(() => void createAndUploadBackup(), 5000);
  const timer = setInterval(() => void createAndUploadBackup(), cfg.intervalMs);
  timer.unref?.();
  const shutdown = () => void createAndUploadBackup();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
