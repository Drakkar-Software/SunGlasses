import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StarfishConfig } from './starfish-config.js';

export interface StoredStarfishConfig {
  config: StarfishConfig;
}

const DEFAULT_PATH = join(process.cwd(), '.starfish-config.local.json');

function configPath(): string {
  return process.env['DASHBOARD_STARFISH_CONFIG_PATH'] ?? DEFAULT_PATH;
}

export async function loadStoredStarfishConfig(): Promise<StoredStarfishConfig | null> {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as StoredStarfishConfig;
    if (!parsed?.config?.baseUrl || !parsed.config.app) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function storeStarfishConfig(config: StarfishConfig): Promise<void> {
  const path = configPath();
  const payload: StoredStarfishConfig = { config };
  await writeFile(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export async function clearStoredStarfishConfig(): Promise<void> {
  const path = configPath();
  if (!existsSync(path)) return;
  await unlink(path);
}
