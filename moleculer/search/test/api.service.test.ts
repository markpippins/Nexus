import { ServiceBroker } from "moleculer";
import ApiService from "../services/api.service";
import { testBrokerConfig } from "./moleculer.config";

describe("ApiService", () => {
  let broker: ServiceBroker;
  let apiService: ApiService;

  beforeEach(async () => {
    broker = new ServiceBroker(testBrokerConfig);
    apiService = new ApiService(broker);
    await broker.start();
  });

  afterEach(async () => {
    if (broker) {
      await broker.stop();
    }
  });

  describe("service configuration", () => {
    it("should have the correct service name", () => {
      expect(apiService.name).toBe("api");
    });

    it("should be initialized with ApiGateway mixin", () => {
      expect(apiService.settings).toBeDefined();
      expect(Array.isArray(apiService.settings.routes)).toBe(true);
    });
  });

  describe("settings", () => {
    it("should have routes configured", () => {
      const routes = apiService.settings.routes;
      expect(routes).toBeDefined();
      expect(routes.length).toBeGreaterThan(0);
    });

    it("should have /api path configured", () => {
      const routes = apiService.settings.routes;
      const apiRoute = routes.find((r: any) => r.path === "/api");
      expect(apiRoute).toBeDefined();
    });

    it("should have correct whitelist entries", () => {
      const routes = apiService.settings.routes;
      const apiRoute = routes.find((r: any) => r.path === "/api");
      expect(apiRoute.whitelist).toContain("google-search.*");
      expect(apiRoute.whitelist).toContain("api.*");
    });

    it("should have search and health aliases configured", () => {
      const routes = apiService.settings.routes;
      const apiRoute = routes.find((r: any) => r.path === "/api");
      expect(apiRoute.aliases["POST /search/simple"]).toBe("google-search.simpleSearch");
      expect(apiRoute.aliases["GET /health"]).toBe("api.health");
    });

    it("should have CORS configured with wildcard origin", () => {
      const routes = apiService.settings.routes;
      const apiRoute = routes.find((r: any) => r.path === "/api");
      expect(apiRoute.cors.origin).toBe("*");
    });
  });

  describe("health action", () => {
    it("should return correct response structure", async () => {
      const result = await broker.call("api.health");
      expect(result).toHaveProperty("status", "ok");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("service", "moleculer-search");
    });

    it("should return a valid ISO timestamp", async () => {
      const result = await broker.call("api.health") as { timestamp: string };
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe("Invalid Date");
    });
  });
});
