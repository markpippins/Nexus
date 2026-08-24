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

// Live-only runtime. The UI talks to assembly-srv (/api) and nebula-srv
// (/nebula) through the dev-server proxy or the production-style server.
export const ASSEMBLY_PORT = parseInt(process.env.PORT || '4204', 10);
