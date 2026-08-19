import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Minimal req/res doubles. Enough to drive the handlers directly, so the API
 * behaviour tests never have to start a server.
 */

export interface CapturedResponse {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
}

export function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): VercelRequest {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }

  return {
    method: options.method ?? "POST",
    headers,
    body: options.body,
  } as unknown as VercelRequest;
}

export function createMockResponse(): {
  res: VercelResponse;
  captured: CapturedResponse;
} {
  const captured: CapturedResponse = {
    statusCode: null,
    body: undefined,
    headers: {},
  };

  const res = {
    setHeader(name: string, value: string | number) {
      captured.headers[name.toLowerCase()] = String(value);
      return res;
    },
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    send(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };

  return { res: res as unknown as VercelResponse, captured };
}

/** A request body that passes validation, so tests can vary one field at a time. */
export function validOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderNo: "ORD001",
    customerCode: "C001",
    amount: 1200,
    currency: "THB",
    ...overrides,
  };
}
