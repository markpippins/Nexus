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

            whitelist: ["api.*", "worker.*", "solir.*"],

            aliases: {
              "GET /health": "api.health",
              "GET /workers": "worker.list",
              "GET /solir/status": "solir.status",
              "POST /solir/snapshot": "solir.snapshot",
            },

            bodyParsers: {
              json: {
                strict: false,
                limit: "1MB",
              },
              urlencoded: {
                extended: true,
                limit: "1MB",
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
