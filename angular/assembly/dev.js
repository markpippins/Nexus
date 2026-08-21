import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSEMBLY_PORT } from './runtime-config.js';

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

// Live-only dev runner: Angular dev server with the live proxy config.
// /api -> assembly-srv (3107), /nebula -> nebula-srv (3101).
start(process.execPath, [ngBin, 'serve', '--port', String(ASSEMBLY_PORT), '--proxy-config', 'proxy.conf.json']);
console.log(`[assembly] LIVE mode: UI on http://localhost:${ASSEMBLY_PORT}`);
