import { describe, expect, it, vi } from "vitest";
import { registerToolHandlers, toolDefinitions } from "./tools";

describe("bootstrap_unclaimed_plans MCP tool", () => {
  it("is advertised with an empty input schema", () => {
    const definition = toolDefinitions.find(
      (tool) => tool.name === "bootstrap_unclaimed_plans",
    );

    expect(definition).toEqual({
      name: "bootstrap_unclaimed_plans",
      description: expect.stringContaining("bootstrap"),
      inputSchema: {
        type: "object",
        properties: {},
      },
    });
  });

  it("delegates to the watcher and returns the pass result", async () => {
    const bootstrapUnclaimedPlans = vi
      .fn()
      .mockResolvedValue({ bootstrapped: 2, failed: 0 });
    const handlers = registerToolHandlers({
      bootstrapUnclaimedPlans,
    } as any);

    const result = await handlers.bootstrap_unclaimed_plans({});

    expect(bootstrapUnclaimedPlans).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ bootstrapped: 2, failed: 0 });
    expect(result.timestamp).toEqual(expect.any(String));
  });
});
