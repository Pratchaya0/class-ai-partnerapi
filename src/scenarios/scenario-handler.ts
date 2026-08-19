import { getMockTimeoutMs, isRandomScenarioEnabled } from "../config";
import {
  ERROR_CODES,
  errorResponse,
  successResponse,
  type PartnerResponse,
} from "../contracts/partner-response";
import type { Scenario } from "./resolve-scenario";

/**
 * What the HTTP layer should do. Building this is pure: no timers are started and
 * no response is written here, which keeps the scenario table readable for
 * instructors and trivially testable.
 */
export interface ScenarioOutcome {
  /** Scenario actually executed - differs from the requested one when `random` resolved. */
  scenario: Exclude<Scenario, "random">;
  status: number;
  headers: Record<string, string>;
  body: PartnerResponse;
  /** Artificial delay to await before writing the response. */
  delayMs: number;
}

/**
 * Weighted outcomes for the chaos scenario. Edit these numbers to retune the demo;
 * they must add up to 1.
 */
export const RANDOM_DISTRIBUTION: ReadonlyArray<{
  scenario: Exclude<Scenario, "random">;
  weight: number;
}> = [
  { scenario: "success", weight: 0.7 },
  { scenario: "bad-request", weight: 0.1 },
  { scenario: "server-error", weight: 0.1 },
  { scenario: "service-unavailable", weight: 0.05 },
  { scenario: "timeout", weight: 0.05 },
];

/** RNG is injected so tests stay deterministic - never assert on real randomness. */
export function pickRandomScenario(
  rng: () => number = Math.random,
): Exclude<Scenario, "random"> {
  const roll = rng();
  let cumulative = 0;
  for (const entry of RANDOM_DISTRIBUTION) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.scenario;
  }
  return "success";
}

export function executeScenario(params: {
  scenario: Scenario;
  orderNo: string;
  requestId: string;
  rng?: () => number;
}): ScenarioOutcome {
  const { orderNo, requestId } = params;

  let scenario = params.scenario;
  if (scenario === "random") {
    scenario = isRandomScenarioEnabled()
      ? pickRandomScenario(params.rng)
      : "success";
  }

  switch (scenario) {
    case "bad-request":
      return {
        scenario,
        status: 400,
        headers: {},
        delayMs: 0,
        body: errorResponse({
          code: ERROR_CODES.INVALID_ORDER,
          message: "Partner rejected the order.",
          requestId,
          orderNo,
        }),
      };

    case "rate-limit":
      return {
        scenario,
        status: 429,
        headers: { "Retry-After": "2" },
        delayMs: 0,
        body: errorResponse({
          code: ERROR_CODES.RATE_LIMITED,
          message: "Too many requests. Please retry later.",
          requestId,
          orderNo,
        }),
      };

    case "server-error":
      return {
        scenario,
        status: 500,
        headers: {},
        delayMs: 0,
        body: errorResponse({
          code: ERROR_CODES.PARTNER_INTERNAL_ERROR,
          message: "Partner service failed to process the order.",
          requestId,
          orderNo,
        }),
      };

    case "service-unavailable":
      return {
        scenario,
        status: 503,
        headers: {},
        delayMs: 0,
        body: errorResponse({
          code: ERROR_CODES.PARTNER_TEMPORARY_FAILURE,
          message: "Partner service is temporarily unavailable.",
          requestId,
          orderNo,
        }),
      };

    // Answers 200, but only after a delay long enough for a shorter client
    // timeout to fire first.
    case "timeout":
      return {
        scenario,
        status: 200,
        headers: {},
        delayMs: getMockTimeoutMs(),
        body: successResponse(orderNo, requestId),
      };

    case "success":
      return {
        scenario,
        status: 200,
        headers: {},
        delayMs: 0,
        body: successResponse(orderNo, requestId),
      };
  }
}
