import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { Db } from '../db/types.js';
import { restrictToOwner } from './file-permissions.js';

const MAGIC = Buffer.from('FAPIBK1\0');
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;
const PLACEHOLDER_KEY = 'replace-with-64-char-hex';
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/freeapi.db');

type BackupScheduler = { every(ms: number, fn: () => void): () => void };

function getDefaultDbPath(): string { return process.env.FREEAPI_DB_PATH?.trim() || DEFAULT_DB_PATH; }

export interface DbBackupResult { ok: boolean; target?: string; bytes?: number; restored?: boolean; skipped?: string; }

function backupTarget(): string | null {
  const raw = process.env.FREEAPI_DB_BACKUP_TARGET ?? process.env.FREEAPI_DB_BACKUP_URL ?? process.env.FREEAPI_DB_BACKUP_PATH ?? '';
  const trimmed = raw.trim();
  return trimmed || null;
}

export function isDbBackupConfigured(): boolean { return backupTarget() !== null; }

function backupIntervalMs(): number {
  const n = Number(process.env.FREEAPI_DB_BACKUP_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_INTERVAL_MS;
}

function isHttpTarget(target: string): boolean { return target.startsWith('https://') || target.startsWith('http://'); }

function parseBackupKey(): Buffer {
  const raw = (process.env.FREEAPI_DB_BACKUP_KEY || process.env.ENCRYPTION_KEY || '').trim();
  if (!raw || raw === PLACEHOLDER_KEY || !/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('FREEAPI_DB_BACKUP_KEY or ENCRYPTION_KEY must be a 64-character hex key when DB backup is enabled');
  return Buffer.from(raw, 'hex');
}

function encryptBackup(plain: Buffer): Buffer {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', parseBackupKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}

function decryptBackup(payload: Buffer): Buffer {
  if (payload.length < MAGIC.length + 28 || !payload.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('backup payload has an unsupported format');
  const ivStart = MAGIC.length, tagStart = ivStart + 12, bodyStart = tagStart + 16;
  const decipher = crypto.createDecipheriv('aes-256-gcm', parseBackupKey(), payload.subarray(ivStart, tagStart));
  decipher.setAuthTag(payload.subarray(tagStart, bodyStart));
  return Buffer.concat([decipher.update(payload.subarray(bodyStart)), decipher.final()]);
}

export function parseHuggingFaceTarget(target: string): { commitUrl: string; filePath: string } | null {
  let url: URL;
  try { url = new URL(target); } catch { return null; }
  if (url.hostname !== 'huggingface.co') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const prefixed = segments[0] === 'datasets' || segments[0] === 'spaces';
  const type = prefixed ? segments[0] : 'models';
  const rest = prefixed ? segments.slice(1) : segments;
  if (rest.length < 5 || rest[2] !== 'resolve') return null;
  const [namespace, repo, , revision] = rest;
  const filePath = rest.slice(4).map(decodeURIComponent).join('/');
  if (!namespace || !repo || !revision || !filePath) return null;
  return { commitUrl: `https://huggingface.co/api/${type}/${namespace}/${repo}/commit/${revision}`, filePath };
}

async function uploadToHuggingFace(commitUrl: string, filePath: string, payload: Buffer, token: string): Promise<void> {
  const lines = [
    { key: 'header', value: { summary: `chore: update ${filePath}` } },
    { key: 'file', value: { path: filePath, content: payload.toString('base64'), encoding: 'utf-8' } },
  ];
  const res = await fetch(commitUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-ndjson', Authorization: `Bearer ${token}` }, body: lines.map(line => JSON.stringify(line)).join('\n'), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`backup upload failed: HF commit HTTP ${res.status}`);
}

function decodeHuggingFacePayload(raw: Buffer): Buffer { return raw.subarray(0, MAGIC.length).equals(MAGIC) ? raw : Buffer.from(raw.toString('utf8'), 'base64'); }

async function readTarget(target: string): Promise<Buffer | null> {
  if (isHttpTarget(target)) {
    const headers: Record<string, string> = {};
    const token = process.env.FREEAPI_DB_BACKUP_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(target, { method: 'GET', headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`backup restore failed: HTTP ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    return parseHuggingFaceTarget(target) ? decodeHuggingFacePayload(raw) : raw;
  }
  return fs.existsSync(target) ? fs.readFileSync(target) : null;
}

async function writeTarget(target: string, payload: Buffer): Promise<void> {
  if (isHttpTarget(target)) {
    const token = process.env.FREEAPI_DB_BACKUP_TOKEN?.trim();
    const hf = parseHuggingFaceTarget(target);
    if (hf) {
      if (!token) throw new Error('FREEAPI_DB_BACKUP_TOKEN is required to upload a backup to Hugging Face');
      await uploadToHuggingFace(hf.commitUrl, hf.filePath, payload, token);
      return;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(target, { method: 'PUT', headers, body: payload, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`backup upload failed: HTTP ${res.status}`);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, payload, { mode: 0o600 });
  if (!restrictToOwner(target)) console.warn(`[db-backup] could not restrict permissions on ${target}`);
}

export async function restoreDbBackupIfNeeded(dbPath = getDefaultDbPath()): Promise<DbBackupResult> {
  const target = backupTarget();
  if (!target || dbPath === ':memory:') return { ok: true, target: target ?? undefined, skipped: !target ? 'not configured' : 'memory database' };
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) return { ok: true, target, skipped: 'database already exists' };
  const payload = await readTarget(target);
  if (!payload?.length) return { ok: true, target, skipped: 'no backup found' };
  let restored: Buffer;
  try { restored = gunzipSync(decryptBackup(payload)); } catch (err) { throw new Error(`could not restore SQLite backup from ${target}: ${err instanceof Error ? err.message : String(err)}`); }
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  fs.writeFileSync(dbPath, restored, { mode: 0o600 });
  if (!restrictToOwner(dbPath)) console.warn(`[db-backup] could not restrict permissions on the restored database at ${dbPath}`);
  console.log(`[db-backup] restored ${restored.length} bytes from ${target}`);
  return { ok: true, target, bytes: restored.length, restored: true };
}

export async function backupDbNow(db: Db, dbPath = getDefaultDbPath()): Promise<DbBackupResult> {
  const target = backupTarget();
  if (!target) return { ok: true, skipped: 'not configured' };
  if (dbPath === ':memory:') return { ok: true, target, skipped: 'memory database' };
  if (!fs.existsSync(dbPath)) return { ok: false, target, skipped: 'database file missing' };
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* best effort */ }
  const plain = fs.readFileSync(dbPath);
  await writeTarget(target, encryptBackup(gzipSync(plain)));
  console.log(`[db-backup] uploaded ${plain.length} bytes to ${target}`);
  return { ok: true, target, bytes: plain.length };
}

export function startDbBackupPump(db: Db, scheduler: BackupScheduler, dbPath = getDefaultDbPath()): (() => void) | null {
  if (!backupTarget()) return null;
  const run = () => { void backupDbNow(db, dbPath).catch(err => console.warn(`[db-backup] ${err instanceof Error ? err.message : err}`)); };
  run();
  return scheduler.every(backupIntervalMs(), run);
}
