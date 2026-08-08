import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const ASSEMBLY_MODE = (
  process.env.ASSEMBLY_MODE || process.env.VITE_ASSEMBLY_MODE || 'mock'
).toLowerCase();

export const IS_MOCK_MODE = ASSEMBLY_MODE === 'mock';
export const DEFAULT_PORT = IS_MOCK_MODE ? 3000 : 4204;
export const ASSEMBLY_PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
