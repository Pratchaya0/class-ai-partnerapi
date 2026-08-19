/**
 * Scenario selection. Pure - knows nothing about req/res.
 *
 *   scenario = headerScenario ?? scenarioFromOrderNo ?? "success"
 *
 * The default must stay deterministic: every learner running the same OrderNo has
 * to get the same result, otherwise the lab is not reproducible.
 */

export const SCENARIOS = [
  "success",
  "bad-request",
  "rate-limit",
  "server-error",
  "service-unavailable",
  "timeout",
  "random",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_HEADER = "x-mock-scenario";

/** OrderNo convention, so a learner can drive scenarios straight from the Excel sheet. */
const ORDER_NO_SCENARIOS: Record<string, Scenario> = {
  ORD400: "bad-request",
  ORD429: "rate-limit",
  ORD500: "server-error",
  ORD503: "service-unavailable",
  ORDTIMEOUT: "timeout",
  ORDRANDOM: "random",
};

function isScenario(value: string): value is Scenario {
  return (SCENARIOS as readonly string[]).includes(value);
}

/** An unrecognised header value is ignored rather than rejected - it falls through to OrderNo. */
export function scenarioFromHeader(
  headerValue: string | string[] | undefined,
): Scenario | null {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return isScenario(normalized) ? normalized : null;
}

export function scenarioFromOrderNo(orderNo: string | undefined): Scenario | null {
  if (!orderNo) return null;
  return ORDER_NO_SCENARIOS[orderNo.trim().toUpperCase()] ?? null;
}

/** The header wins over the OrderNo convention; success is the fallback. */
export function resolveScenario(params: {
  headerValue?: string | string[] | undefined;
  orderNo?: string | undefined;
}): Scenario {
  return (
    scenarioFromHeader(params.headerValue) ??
    scenarioFromOrderNo(params.orderNo) ??
    "success"
  );
}
