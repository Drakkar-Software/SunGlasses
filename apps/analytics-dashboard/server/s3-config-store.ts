import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { S3Config } from './s3-config.js';

export interface StoredS3Config {
  config: S3Config;
  useIam: boolean;
}

const DEFAULT_PATH = join(process.cwd(), '.s3-config.local.json');

function configPath(): string {
  return process.env['DASHBOARD_S3_CONFIG_PATH'] ?? DEFAULT_PATH;
}

/** Load S3 settings saved from the UI (gitignored local file). */
export async function loadStoredConfig(): Promise<StoredS3Config | null> {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as StoredS3Config;
    if (!parsed?.config?.s3Bucket) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist UI-provided S3 settings for the next server start. */
export async function storeConfig(config: S3Config, useIam: boolean): Promise<void> {
  const path = configPath();
  const payload: StoredS3Config = { config, useIam };
  await writeFile(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export async function clearStoredConfig(): Promise<void> {
  const path = configPath();
  if (!existsSync(path)) return;
  await unlink(path);
}
