import { Service, ServiceBroker, Context } from "moleculer";

interface SpawnParams {
  service: string;
  args?: string[];
}

/**
 * Worker tier — hosts the process-spawning services re-homed from the
 * Express fleet (harness-srv, pty-srv, execution-srv — Wave 4).
 *
 * Wave 0.3 scaffold: actions are declared (contract frozen) but raise
 * NOT_IMPLEMENTED until the Wave 4 migrations land the real handlers.
 */
export default class WorkerService extends Service {
  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "worker",

      actions: {
        list: {
          async handler(ctx: Context) {
            return {
              workers: [
                { name: "worker.harness", status: "scaffolded", wave: 4 },
                { name: "worker.pty", status: "scaffolded", wave: 4 },
                { name: "worker.execution", status: "scaffolded", wave: 4 },
              ],
              nodeID: ctx.nodeID,
            };
          },
        },

        spawn: {
          params: {
            service: "string",
            args: { type: "array", items: "string", optional: true },
          },
          async handler(ctx: Context<SpawnParams>) {
            throw new Error(`worker.spawn not implemented yet (Wave 4) — service=${ctx.params.service}`);
          },
        },

        kill: {
          params: {
            service: "string",
          },
          async handler(ctx: Context<{ service: string }>) {
            throw new Error(`worker.kill not implemented yet (Wave 4) — service=${ctx.params.service}`);
          },
        },

        status: {
          params: {
            service: "string",
          },
          async handler(ctx: Context<{ service: string }>) {
            return {
              service: ctx.params.service,
              status: "scaffolded",
              running: false,
              pid: null,
            };
          },
        },
      },
    });
  }
}
