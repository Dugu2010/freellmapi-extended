import fs from 'fs';

/** Best-effort owner-only permissions for persisted DB/backup files. */
export function restrictToOwner(target: string): boolean {
  try {
    fs.chmodSync(target, 0o600);
    return true;
  } catch {
    return false;
  }
}
