/**
 * heartbeat-client CLI entry point.
 *
 * Split from index.ts so that CJS-compiled consumers (dockerized *-srv
 * builds with `module: commonjs`) never pull `import.meta` syntax into
 * their compilation. Run via:
 *
 *   npx tsx cli.ts --service-id <id> --service-name <name>
 */
import { fileURLToPath } from "url";
import { startHeartbeat } from "./index.js";

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const serviceId = get("--service-id");
  const serviceName = get("--service-name");

  if (!serviceId || !serviceName) {
    console.error(
      "Usage: npx tsx cli.ts --service-id <id> --service-name <name>",
    );
    process.exit(1);
  }

  startHeartbeat({
    serviceId: parseInt(serviceId, 10),
    serviceName,
    log: (...a) => console.log(new Date().toISOString(), ...a),
  });

  console.log(`Heartbeat running for ${serviceName} (Ctrl+C to stop)...`);

  // Keep process alive
  setInterval(() => {}, 1000);
}
