import { readFileSync } from 'node:fs';
import type { CapCert } from '@drakkar.software/starfish-protocol';

/** Runtime Starfish sync settings (admin cap-cert + analytics namespace). */
export interface StarfishConfig {
  baseUrl: string;
  app: string;
  cap: CapCert;
  devEdPrivHex: string;
  cacheDir: string;
}

export interface StarfishConfigInput {
  source?: 'starfish';
  baseUrl?: string;
  app?: string;
  cap?: CapCert | string;
  devEdPrivHex?: string;
  cacheDir?: string;
}

export interface SyncStats {
  totalFiles: number;
  cacheBytes: number;
  lastSyncAt: string | null;
}

export function defaultCacheDir(app: string): string {
  return `.parquet-cache/${app}`;
}

export function configFromEnv(): StarfishConfig | null {
  if (process.env['STARFISH_CONFIGURE_FROM_ENV'] !== 'true') return null;

  const baseUrl = (process.env['STARFISH_BASE_URL'] ?? '').trim();
  const app = (process.env['STARFISH_APP'] ?? '').trim();
  const devEdPrivHex = (process.env['STARFISH_DEV_ED_PRIV_HEX'] ?? '').trim();
  if (!baseUrl || !app || !devEdPrivHex) return null;

  const capPath = (process.env['STARFISH_CAP_PATH'] ?? '').trim();
  const capJson = (process.env['STARFISH_CAP_JSON'] ?? '').trim();

  let cap: CapCert;
  if (capPath) {
    cap = JSON.parse(readFileSync(capPath, 'utf8')) as CapCert;
  } else if (capJson) {
    cap = JSON.parse(capJson) as CapCert;
  } else {
    return null;
  }

  const cacheDir = (process.env['STARFISH_CACHE_DIR'] ?? '').trim() || defaultCacheDir(app);
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    app,
    cap,
    devEdPrivHex,
    cacheDir,
  };
}

export function parseStarfishInput(body: StarfishConfigInput): StarfishConfig | string {
  const baseUrl = body.baseUrl?.trim() ?? '';
  if (!baseUrl) return 'Starfish base URL is required';

  const app = body.app?.trim() ?? '';
  if (!app) return 'App slug is required (e.g. octochat)';

  const devEdPrivHex = body.devEdPrivHex?.trim() ?? '';
  if (!devEdPrivHex) return 'Device Ed25519 private key (hex) is required';

  let cap: CapCert;
  try {
    if (typeof body.cap === 'string') {
      cap = JSON.parse(body.cap) as CapCert;
    } else if (body.cap && typeof body.cap === 'object') {
      cap = body.cap;
    } else {
      return 'Cap certificate JSON is required';
    }
  } catch {
    return 'Cap certificate must be valid JSON';
  }

  const cacheDir = body.cacheDir?.trim() || defaultCacheDir(app);
  return { baseUrl: baseUrl.replace(/\/$/, ''), app, cap, devEdPrivHex, cacheDir };
}
