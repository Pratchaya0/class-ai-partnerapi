import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  OrderRequestSchema,
  isPlainObject,
  toValidationErrors,
} from "../src/contracts/order-request";
import { ERROR_CODES, errorResponse } from "../src/contracts/partner-response";
import { WORKSHOP_KEY_HEADER, isAuthorized } from "../src/middleware/workshop-auth";
import {
  SCENARIO_HEADER,
  resolveScenario,
} from "../src/scenarios/resolve-scenario";
import { executeScenario } from "../src/scenarios/scenario-handler";
import { logPartnerRequest } from "../src/utils/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "../src/utils/request-id";
import { sleep } from "../src/utils/sleep";

/**
 * POST /api/orders - the endpoint the workshop's order processing worker calls.
 *
 * Thin adapter only: read headers, validate, delegate to the pure scenario
 * functions, write the response. All scenario behaviour lives in src/scenarios.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const startedAt = Date.now();
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader("X-Request-ID", requestId);

  const finish = (params: {
    status: number;
    body: unknown;
    orderNo: string | null;
    scenario: string;
    headers?: Record<string, string>;
  }): void => {
    for (const [name, value] of Object.entries(params.headers ?? {})) {
      res.setHeader(name, value);
    }
    logPartnerRequest({
      requestId,
      orderNo: params.orderNo,
      scenario: params.scenario,
      responseStatus: params.status,
      durationMs: Date.now() - startedAt,
    });
    res.status(params.status).json(params.body);
  };

  if (req.method !== "POST") {
    finish({
      status: 405,
      scenario: "method-not-allowed",
      orderNo: null,
      headers: { Allow: "POST" },
      body: errorResponse({
        code: ERROR_CODES.METHOD_NOT_ALLOWED,
        message: "Only POST is supported on this endpoint.",
        requestId,
      }),
    });
    return;
  }

  // The key itself is never logged, echoed, or included in the error body.
  if (!isAuthorized(req.headers[WORKSHOP_KEY_HEADER])) {
    finish({
      status: 401,
      scenario: "unauthorized",
      orderNo: null,
      body: errorResponse({
        code: ERROR_CODES.UNAUTHORIZED,
        message: "Missing or invalid workshop key.",
        requestId,
      }),
    });
    return;
  }

  // Schema validation runs before scenario processing, so a malformed request
  // never reaches the mock scenarios.
  const rawBody: unknown = req.body;
  const parsed = isPlainObject(rawBody)
    ? OrderRequestSchema.safeParse(rawBody)
    : null;

  if (parsed === null || !parsed.success) {
    const errors =
      parsed === null
        ? ["request body must be a JSON object"]
        : toValidationErrors(parsed.error);

    finish({
      status: 400,
      scenario: "validation-error",
      orderNo: isPlainObject(rawBody) && typeof rawBody.orderNo === "string"
        ? rawBody.orderNo
        : null,
      body: errorResponse({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid partner order request.",
        requestId,
        errors,
      }),
    });
    return;
  }

  const order = parsed.data;
  const requested = resolveScenario({
    headerValue: req.headers[SCENARIO_HEADER],
    orderNo: order.orderNo,
  });

  const outcome = executeScenario({
    scenario: requested,
    orderNo: order.orderNo,
    requestId,
  });

  await sleep(outcome.delayMs);

  finish({
    status: outcome.status,
    body: outcome.body,
    orderNo: order.orderNo,
    scenario: outcome.scenario,
    headers: outcome.headers,
  });
}
