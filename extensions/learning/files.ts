import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function fileHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Reject user symlinks at every existing component, including the destination. */
export async function assertSafePath(filePath: string): Promise<void> {
  if (!path.isAbsolute(filePath) || filePath.includes('\0')) throw new Error('An absolute safe path is required.');
  if (filePath.split(path.sep).includes('..')) throw new Error('Path traversal is not allowed.');
  const parsed = path.parse(filePath);
  let current = parsed.root;
  const segments = filePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]!);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) { if (isMissing(error)) return; throw error; }
    if (stat.isSymbolicLink()) {
      // macOS exposes these system-owned aliases in normal paths, including
      // os.tmpdir(). Do not generalize this exception to user-created links.
      if (process.platform === 'darwin' && ['/tmp', '/var', '/etc'].includes(current) && await fs.realpath(current) === `/private${current}`) {
        stat = await fs.stat(current);
      } else {
        throw new Error(`Unsafe symlink in path: ${current}`);
      }
    }
    if (i < segments.length - 1 && !stat.isDirectory()) throw new Error(`Path component is not a directory: ${current}`);
    if (!stat.isDirectory() && !stat.isFile()) throw new Error(`Unsafe special file: ${current}`);
  }
}

function replacementRecord(filePath: string): string { return `${filePath}.pi-learn-replacement.json`; }

async function linkIfAbsent(source: string, destination: string): Promise<void> {
  await assertSafePath(source);
  await assertSafePath(destination);
  try { await fs.link(source, destination); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
}

/** Recover a killed writer without replacing any file an external editor has since saved. */
async function recoverReplacement(filePath: string): Promise<void> {
  const location = replacementRecord(filePath);
  const deadline = Date.now() + 5000;
  for (;;) {
    await assertSafePath(location);
    let raw: string;
    try { raw = await fs.readFile(location, 'utf8'); } catch (error) { if (isMissing(error)) return; throw error; }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error(`Invalid replacement recovery record: ${location}. Preserve the note and its backups before repair.`); }
    if (!value || typeof value !== 'object' || !('pid' in value) || !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0 || !('backup' in value) || typeof value.backup !== 'string'
      || !value.backup.startsWith(`${path.basename(filePath)}.`) || !value.backup.endsWith('.bak') || path.basename(value.backup) !== value.backup || /[\\/\0]/.test(value.backup)) {
      throw new Error(`Invalid replacement recovery record: ${location}.`);
    }
    let alive = true;
    try { process.kill(Number(value.pid), 0); } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false;
    }
    if (alive) {
      if (Date.now() >= deadline) throw new Error(`A file replacement is still active: ${location}. Retry when that writer has stopped.`);
      await delay(20);
      continue;
    }
    const backup = path.join(path.dirname(filePath), '.pi-learn-backups', value.backup);
    await assertSafePath(backup);
    try { await linkIfAbsent(backup, filePath); } catch (error) { if (!isMissing(error)) throw error; }
    await fs.unlink(location).catch(error => { if (!isMissing(error)) throw error; });
    return;
  }
}

export async function readOptional(filePath: string): Promise<string | null> {
  await recoverReplacement(filePath);
  await assertSafePath(filePath);
  try { return await fs.readFile(filePath, 'utf8'); } catch (error) { if (isMissing(error)) return null; throw error; }
}

/** Atomic same-directory replacement, optionally guarded against a changed destination. */
export async function atomicWriteFile(filePath: string, content: string | Uint8Array, expectedHash?: string | null): Promise<void> {
  await recoverReplacement(filePath);
  await assertSafePath(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await assertSafePath(filePath);
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertSafePath(filePath);
    if (expectedHash !== undefined) {
      let actual: string | null;
      try { actual = fileHash(await fs.readFile(filePath)); } catch (error) { if (!isMissing(error)) throw error; actual = null; }
      if (actual !== expectedHash) throw new Error(`Concurrent edit detected; refusing to overwrite ${filePath}. Retry after inspecting the file.`);
    }
    if (expectedHash === null) {
      // A hard link publishes the completed file atomically without replacing an
      // editor's newly-created destination between the check above and publication.
      try { await fs.link(temporary, filePath); } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(`Concurrent edit detected; refusing to overwrite ${filePath}. Retry after inspecting the file.`);
        if (error instanceof Error && 'code' in error && ['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS'].includes(String(error.code))) throw new Error(`Cannot publish ${filePath} atomically. Use a writable filesystem with hard-link support (such as APFS, NTFS or ext4); check directory permissions.`, { cause: error });
        throw error;
      }
    } else {
      // Displace the actual last file atomically before publication. A second
      // hash check detects an editor save after the optimistic check above.
      // Publishing by hard link never overwrites a new concurrent editor file.
      const backupDir = path.join(path.dirname(filePath), '.pi-learn-backups');
      await assertSafePath(backupDir);
      await fs.mkdir(backupDir, {recursive: true, mode: 0o700});
      const backup = path.join(backupDir, `${path.basename(filePath)}.${randomUUID()}.bak`);
      const recovery = replacementRecord(filePath);
      await assertSafePath(recovery);
      await atomicWriteFile(recovery, JSON.stringify({pid: process.pid, backup: path.basename(backup)}), null);
      let displaced = false;
      try {
        try { await fs.rename(filePath, backup); displaced = true; } catch (error) { if (!isMissing(error)) throw error; }
        if (expectedHash !== undefined) {
          await assertSafePath(backup);
          const displacedHash = displaced ? fileHash(await fs.readFile(backup)) : null;
          if (displacedHash !== expectedHash) throw new Error(`Concurrent edit detected; the editor's file is preserved at ${backup}.`);
        }
        try { await fs.link(temporary, filePath); } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(`Concurrent edit detected; the current file and recovery copy at ${backup} were preserved.`);
          throw error;
        }
      } finally {
        // Also covers cancellation/error before publication. If another editor
        // has published a file, keep it and leave the displaced bytes as backup.
        if (displaced) await linkIfAbsent(backup, filePath);
        await fs.unlink(recovery).catch(error => { if (!isMissing(error)) throw error; });
      }
    }
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch(error => { if (!isMissing(error)) throw error; });
  }
}

/** Cooperative cross-process lock. Interrupted locks require explicit inspection/removal. */
export async function withFileLock<T>(target: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const lockPath = `${target}.lock`;
  await assertSafePath(lockPath);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const token = JSON.stringify({ pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() });
  // Durable note transactions can queue behind several writers on slower disks.
  const deadline = Date.now() + 30_000;
  for (;;) {
    signal?.throwIfAborted();
    await assertSafePath(lockPath);
    let handle;
    try {
      handle = await fs.open(lockPath, 'wx', 0o600);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      // Windows can deny an open briefly while another writer unlinks the lock.
      // Retry acquisition only; persistent permission errors retain their cause.
      const sharingConflict = process.platform === 'win32' && code === 'EPERM';
      if (code !== 'EEXIST' && !sharingConflict) throw error;
      if (Date.now() >= deadline) {
        if (sharingConflict) throw error;
        throw new Error(`Storage is locked: ${lockPath}. If its owner has stopped, inspect and remove the stale lock before retrying.`);
      }
      await delay(15 + Math.floor(Math.random() * 20), undefined, {signal});
      continue;
    }
    try { await handle.writeFile(token); } finally { await handle.close(); }
    break;
  }
  try { signal?.throwIfAborted(); return await work(); } finally {
    if (await readOptional(lockPath) === token) await fs.unlink(lockPath);
  }
}
