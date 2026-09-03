import "dotenv/config";
import { Service, ServiceBroker } from "moleculer";
import ApiGateway from "moleculer-web";

/**
 * Broker HTTP gateway (moleculer-web).
 *
 * Exposes the worker-tier control surface. The two AdonisJS edges are the
 * primary REST edges; this gateway is for broker-level introspection
 * (health + worker status) and, later, direct dispatch to worker actions
 * for the process-spawning services (Wave 4).
 */
export default class ApiService extends Service {
  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "api",
      mixins: [ApiGateway],

      settings: {
        port: process.env.SERVICE_PORT || 4080,
        ip: "0.0.0.0",

        routes: [
          {
            path: "/api",

            whitelist: ["api.*", "worker.**", "keychain-snapshot.**"],

            aliases: {
              "GET /health": "api.health",
              "GET /workers": "worker.list",
              "GET /workers/execution": "worker.execution.health",
              "GET /workers/pty": "worker.pty.list",
              "POST /workers/pty": "worker.pty.spawn",
              "DELETE /workers/pty/:id": "worker.pty.kill",
              "GET /workers/harness": "worker.harness.health",
              "POST /workers/harness/run": "worker.harness.run",
              "POST /workers/harness/resolve-context": "worker.harness.resolveContext",
              "GET /workers/harness/sessions": "worker.harness.sessions",
              // Keychains — agent-record contextual layer (state vector + rewind)
              // (sol-ir-snapshot retired 2026-09-02 — sol_ir was the retired name for keychains)
              "GET /keychain-snapshot/status": "keychain-snapshot.status",
              "POST /keychain-snapshot/snapshot": "keychain-snapshot.snapshot",
              "GET /keychain-snapshot/agent-records/status": "keychain-snapshot.agentRecordsStatus",
              "POST /keychain-snapshot/agent-records/snapshot": "keychain-snapshot.agentRecordsSnapshot",
              "GET /keychain-snapshot/agent-records/transitions": "keychain-snapshot.agentRecordsTransitions",
              "GET /keychain-snapshot/agent-records/rewind": "keychain-snapshot.agentRecordsRewind",
            },

            bodyParsers: {
              json: {
                strict: false,
                limit: "5mb", // parity with legacy tier (raised for transcript docklang payloads)
              },
              urlencoded: {
                extended: true,
                limit: "5mb",
              },
            },

            cors: {
              origin: "*",
              methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
              allowedHeaders: "*",
              credentials: false,
              maxAge: 3600,
            },
          },
        ],

        log4XXResponses: false,
        logRequestParams: "info",
        logResponseData: "info",
      },

      actions: {
        health: {
          async handler() {
            return {
              status: "ok",
              service: "nexus-broker",
              namespace: "nexus",
              workers: ["worker.harness", "worker.pty", "worker.execution"],
              timestamp: new Date().toISOString(),
            };
          },
        },
      },
    });
  }
}
