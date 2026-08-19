import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RANDOM_DISTRIBUTION,
  executeScenario,
  pickRandomScenario,
} from "../src/scenarios/scenario-handler";

/**
 * Random mode is never exercised through real randomness - the RNG is injected so
 * every case here stays deterministic.
 */

beforeEach(() => {
  process.env.ENABLE_RANDOM_SCENARIO = "true";
});

afterEach(() => {
  delete process.env.ENABLE_RANDOM_SCENARIO;
});

describe("random distribution", () => {
  it("sums to 1", () => {
    const total = RANDOM_DISTRIBUTION.reduce((sum, e) => sum + e.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  const boundaries: Array<[number, string]> = [
    [0, "success"],
    [0.69, "success"],
    [0.7, "bad-request"],
    [0.79, "bad-request"],
    [0.8, "server-error"],
    [0.89, "server-error"],
    [0.9, "service-unavailable"],
    [0.94, "service-unavailable"],
    [0.95, "timeout"],
    [0.999, "timeout"],
  ];

  it.each(boundaries)("a roll of %s picks %s", (roll, expected) => {
    expect(pickRandomScenario(() => roll)).toBe(expected);
  });
});

describe("random scenario execution", () => {
  it("reports the concrete scenario it resolved to, not 'random'", () => {
    const outcome = executeScenario({
      scenario: "random",
      orderNo: "ORDRANDOM",
      requestId: "r1",
      rng: () => 0.95,
    });

    expect(outcome.scenario).toBe("timeout");
    expect(outcome.status).toBe(200);
    expect(outcome.delayMs).toBeGreaterThan(0);
  });

  it("falls back to success when disabled by environment variable", () => {
    process.env.ENABLE_RANDOM_SCENARIO = "false";

    const outcome = executeScenario({
      scenario: "random",
      orderNo: "ORDRANDOM",
      requestId: "r1",
      rng: () => 0.99,
    });

    expect(outcome.scenario).toBe("success");
    expect(outcome.status).toBe(200);
    expect(outcome.delayMs).toBe(0);
  });
});
