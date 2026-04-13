// utils/cli-flags.js
import path from 'path';

export function parseFlags(defaultPort, defaultRootEnv, defaultRootFallback) {
  const args = process.argv.slice(2);
  let port = defaultPort;
  let root = defaultRootEnv || defaultRootFallback;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (arg === '--root' && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i++;
    } else if (!arg.startsWith('--') && !root) {
      // positional fallback for convenience: node serv.js ./myroot
      root = path.resolve(arg);
    }
  }

  return { port, root };
}
