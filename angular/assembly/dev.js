import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSEMBLY_MODE, ASSEMBLY_PORT, IS_MOCK_MODE } from './runtime-config.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const ngBin = path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const children = [];

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', code => {
    if (code && !shuttingDown) process.exitCode = code;
    if (!shuttingDown) {
      shutdown();
      setTimeout(() => process.exit(process.exitCode || 0), 100);
    }
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (IS_MOCK_MODE) {
  const mockApiPort = process.env.MOCK_API_PORT || '33107';
  start(process.execPath, ['server.js'], { ASSEMBLY_API_ONLY: 'true', MOCK_API_PORT: mockApiPort });
  start(process.execPath, [ngBin, 'serve', '--port', String(ASSEMBLY_PORT), '--proxy-config', 'proxy.conf.mock.json']);
  console.log(`[assembly] MOCK mode: UI on http://localhost:${ASSEMBLY_PORT}, API fixtures on http://localhost:${mockApiPort}`);
} else {
  start(process.execPath, [ngBin, 'serve', '--port', String(ASSEMBLY_PORT), '--proxy-config', 'proxy.conf.json']);
  console.log(`[assembly] LIVE mode: UI on http://localhost:${ASSEMBLY_PORT}`);
}

console.log(`[assembly] Runtime mode: ${ASSEMBLY_MODE}`);
