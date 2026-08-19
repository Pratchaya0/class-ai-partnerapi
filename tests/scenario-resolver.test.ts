import { describe, expect, it } from "vitest";
import {
  resolveScenario,
  scenarioFromHeader,
  scenarioFromOrderNo,
  type Scenario,
} from "../src/scenarios/resolve-scenario.js";

describe("OrderNo convention", () => {
  const cases: Array<[string, Scenario]> = [
    ["ORD400", "bad-request"],
    ["ORD429", "rate-limit"],
    ["ORD500", "server-error"],
    ["ORD503", "service-unavailable"],
    ["ORDTIMEOUT", "timeout"],
    ["ORDRANDOM", "random"],
    ["ORD001", "success"],
    ["ORD002", "success"],
    ["UNKNOWN", "success"],
  ];

  it.each(cases)("%s resolves to %s", (orderNo, expected) => {
    expect(resolveScenario({ orderNo })).toBe(expected);
  });

  it("is case insensitive", () => {
    expect(resolveScenario({ orderNo: "ord503" })).toBe("service-unavailable");
  });

  it("returns null for an OrderNo with no mapping", () => {
    expect(scenarioFromOrderNo("ORD001")).toBeNull();
    expect(scenarioFromOrderNo(undefined)).toBeNull();
  });
});

describe("header override", () => {
  it("wins over the OrderNo convention", () => {
    expect(
      resolveScenario({ headerValue: "server-error", orderNo: "ORD001" }),
    ).toBe("server-error");
  });

  it("wins even when the OrderNo maps to a different scenario", () => {
    expect(
      resolveScenario({ headerValue: "success", orderNo: "ORD503" }),
    ).toBe("success");
  });

  it("is case insensitive and trims whitespace", () => {
    expect(scenarioFromHeader("  Service-Unavailable ")).toBe(
      "service-unavailable",
    );
  });

  it("ignores an unknown value and falls through to the OrderNo", () => {
    expect(
      resolveScenario({ headerValue: "explode", orderNo: "ORD429" }),
    ).toBe("rate-limit");
  });

  it("uses the first value when the header arrives repeated", () => {
    expect(scenarioFromHeader(["timeout", "success"])).toBe("timeout");
  });
});

describe("default", () => {
  it("is success when nothing selects a scenario", () => {
    expect(resolveScenario({})).toBe("success");
  });
});
