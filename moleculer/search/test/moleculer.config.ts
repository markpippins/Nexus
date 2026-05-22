import { BrokerOptions } from "moleculer";

export const testBrokerConfig: BrokerOptions = {
  namespace: "test",
  nodeID: "test-node",
  logger: false,
  transporter: null,
  requestTimeout: 5000,
  retryPolicy: {
    enabled: false,
    retries: 0,
  },
  registry: {
    strategy: "RoundRobin",
    preferLocal: true,
  },
  internalServices: false,
  internalMiddlewares: false,
};
