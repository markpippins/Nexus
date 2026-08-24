import { describe, test, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Stub the Python subprocess so we can fake reject/accept + failures without
// spawning real Python. Also stub ./db so the real PG pool is never created.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./db", () => ({
  insertCirViolation: vi.fn().mockResolvedValue(1),
}));

import { enforceTransition, gateWrTransition } from "./cirsdm";

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

function fakeProc(stdoutData: string, exitCode: number): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = vi.fn();
  setTimeout(() => {
    proc.stdout.emit("data", Buffer.from(stdoutData));
    proc.emit("close", exitCode);
  }, 0);
  return proc;
}

function fakeErrorProc(err: Error): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = vi.fn();
  setTimeout(() => proc.emit("error", err), 0);
  return proc;
}

const DECISION = {
  violation_id: "abc123",
  rule_id: "cir-sdm.one-way-gate",
  rule_version: "2",
  severity: "blocking",
  event_id: "e6",
  cer_id: null,
  description: "illegal WR transition",
  detected_at: null,
  blocking: true,
};

describe("cirsdm stub-CLI bridge (fail-closed)", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  test("accept: reject=false passes through", async () => {
    spawnMock.mockReturnValue(fakeProc(
      JSON.stringify({ state: "enforced", enforced: true, rules: ["cir-sdm.one-way-gate"], violations: [], decisions: [], reject: false }),
      0,
    ));
    const result = await enforceTransition([], {});
    expect(result.reject).toBe(false);
    expect(result.decisions).toEqual([]);
  });

  test("reject: reject=true surfaces the governed decision", async () => {
    spawnMock.mockReturnValue(fakeProc(
      JSON.stringify({ state: "enforced", enforced: true, rules: ["cir-sdm.one-way-gate"], violations: [DECISION], decisions: [DECISION], reject: true }),
      0,
    ));
    const result = await gateWrTransition([], "WR_CLAIMED", "wr-1");
    expect(result.reject).toBe(true);
    expect(result.decisions[0].violation_id).toBe("abc123");
  });

  test("non-zero exit → throws (fail-closed)", async () => {
    spawnMock.mockReturnValue(fakeProc("", 1));
    await expect(enforceTransition([], {})).rejects.toThrow(/failed \(1\)/);
  });

  test("spawn error → rejects (fail-closed)", async () => {
    spawnMock.mockReturnValue(fakeErrorProc(new Error("python missing")));
    await expect(enforceTransition([], {})).rejects.toThrow(/python missing/);
  });
});
