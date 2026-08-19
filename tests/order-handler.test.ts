import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import healthHandler from "../api/health";
import { MAX_DELAY_MS } from "../src/config";
import ordersHandler from "../api/orders";
import {
  createMockRequest,
  createMockResponse,
  validOrder,
} from "./helpers/mock-http";

const KEY = "test-key";
const authHeaders = { "X-Workshop-Key": KEY };

beforeEach(() => {
  process.env.WORKSHOP_API_KEY = KEY;
  process.env.MOCK_TIMEOUT_MS = "5000";
  process.env.ENABLE_RANDOM_SCENARIO = "true";
  // Handlers log one JSON line per request; keep the test output readable.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Drive POST /api/orders and hand back what it wrote. */
async function postOrder(options: {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
} = {}) {
  const req = createMockRequest({
    method: options.method ?? "POST",
    headers: options.headers ?? authHeaders,
    body: "body" in options ? options.body : validOrder(),
  });
  const { res, captured } = createMockResponse();
  await ordersHandler(req, res);
  return captured;
}

describe("GET /api/health", () => {
  it("returns 200 without a workshop key", () => {
    const req = createMockRequest({ method: "GET", headers: {} });
    const { res, captured } = createMockResponse();
    healthHandler(req, res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ status: "ok", service: "partner-mock-api" });
  });
});

describe("authentication", () => {
  it("rejects a missing workshop key with 401", async () => {
    const captured = await postOrder({ headers: {} });

    expect(captured.statusCode).toBe(401);
    expect(captured.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a wrong workshop key with 401", async () => {
    const captured = await postOrder({ headers: { "X-Workshop-Key": "nope" } });
    expect(captured.statusCode).toBe(401);
  });

  it("never echoes the key back in the response", async () => {
    const captured = await postOrder({ headers: { "X-Workshop-Key": "nope" } });
    const serialized = JSON.stringify({
      body: captured.body,
      headers: captured.headers,
    });
    expect(serialized).not.toContain(KEY);
  });

  it("fails closed when the deployment has no key configured", async () => {
    delete process.env.WORKSHOP_API_KEY;
    const captured = await postOrder();
    expect(captured.statusCode).toBe(401);
  });
});

describe("method guard", () => {
  it("rejects GET with 405 and the shared error shape", async () => {
    const captured = await postOrder({ method: "GET" });

    expect(captured.statusCode).toBe(405);
    expect(captured.headers.allow).toBe("POST");
    expect(captured.body).toMatchObject({
      success: false,
      code: "METHOD_NOT_ALLOWED",
    });
  });

  it("checks the method before the workshop key", async () => {
    const captured = await postOrder({ method: "DELETE", headers: {} });
    expect(captured.statusCode).toBe(405);
  });
});

describe("validation", () => {
  it("returns 400 with the documented messages", async () => {
    const captured = await postOrder({
      body: { orderNo: "", customerCode: "C001", amount: -100, currency: "THB" },
    });

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Invalid partner order request.",
    });
    const errors = (captured.body as { errors: string[] }).errors;
    expect(errors).toContain("orderNo is required");
    expect(errors).toContain("amount must be greater than 0");
  });

  it("returns 400 when the body is not a JSON object", async () => {
    const captured = await postOrder({ body: "not json" });

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when the body is missing entirely", async () => {
    const captured = await postOrder({ body: undefined });
    expect(captured.statusCode).toBe(400);
  });

  it("runs before scenario processing, so ORD503 with a bad body is still 400", async () => {
    const captured = await postOrder({
      body: validOrder({ orderNo: "ORD503", amount: 0 }),
    });

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("deterministic scenarios", () => {
  it("returns 200 with a referenceId for a normal order", async () => {
    const captured = await postOrder();

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ success: true, orderNo: "ORD001" });
    expect((captured.body as { referenceId: string }).referenceId).toMatch(
      /^PTR-[0-9a-f]{8}$/,
    );
  });

  const cases: Array<[string, number, string]> = [
    ["ORD400", 400, "INVALID_ORDER"],
    ["ORD429", 429, "RATE_LIMITED"],
    ["ORD500", 500, "PARTNER_INTERNAL_ERROR"],
    ["ORD503", 503, "PARTNER_TEMPORARY_FAILURE"],
  ];

  it.each(cases)("%s returns %i / %s", async (orderNo, status, code) => {
    const captured = await postOrder({ body: validOrder({ orderNo }) });

    expect(captured.statusCode).toBe(status);
    expect(captured.body).toMatchObject({ success: false, code, orderNo });
  });

  it("sends Retry-After on the rate-limit scenario", async () => {
    const captured = await postOrder({ body: validOrder({ orderNo: "ORD429" }) });
    expect(captured.headers["retry-after"]).toBe("2");
  });

  it("lets the X-Mock-Scenario header override the OrderNo", async () => {
    const captured = await postOrder({
      headers: { ...authHeaders, "X-Mock-Scenario": "server-error" },
      body: validOrder({ orderNo: "ORD001" }),
    });

    expect(captured.statusCode).toBe(500);
  });
});

describe("timeout scenario", () => {
  it("waits the configured delay before responding", async () => {
    vi.useFakeTimers();

    const req = createMockRequest({
      headers: authHeaders,
      body: validOrder({ orderNo: "ORDTIMEOUT" }),
    });
    const { res, captured } = createMockResponse();

    // Do not await yet - the handler is parked on the artificial delay.
    const pending = ordersHandler(req, res);

    await vi.advanceTimersByTimeAsync(4999);
    expect(captured.statusCode).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ success: true });
  });

  it("clamps a delay configured above the maximum", async () => {
    process.env.MOCK_TIMEOUT_MS = "999999";
    vi.useFakeTimers();

    const req = createMockRequest({
      headers: authHeaders,
      body: validOrder({ orderNo: "ORDTIMEOUT" }),
    });
    const { res, captured } = createMockResponse();
    const pending = ordersHandler(req, res);

    // Pins the clamp value itself, not just "it eventually responds".
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS - 1);
    expect(captured.statusCode).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(captured.statusCode).toBe(200);
  });
});

describe("request id", () => {
  it("is present in the body and the response header", async () => {
    const captured = await postOrder();

    const requestId = (captured.body as { requestId: string }).requestId;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(captured.headers["x-request-id"]).toBe(requestId);
  });

  it("preserves an incoming X-Request-ID", async () => {
    const captured = await postOrder({
      headers: { ...authHeaders, "X-Request-ID": "trace-from-backend" },
    });

    expect(captured.headers["x-request-id"]).toBe("trace-from-backend");
    expect(captured.body).toMatchObject({ requestId: "trace-from-backend" });
  });

  it("is present on error responses too", async () => {
    const captured = await postOrder({ body: validOrder({ orderNo: "ORD503" }) });
    expect((captured.body as { requestId: string }).requestId).toBeTruthy();
  });
});

describe("structured logging", () => {
  it("logs the documented fields and never the workshop key", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      logged.push(String(line));
    });

    await postOrder({ body: validOrder({ orderNo: "ORD503" }) });

    expect(logged).toHaveLength(1);
    const entry = JSON.parse(logged[0]!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      orderNo: "ORD503",
      scenario: "service-unavailable",
      responseStatus: 503,
    });
    expect(typeof entry.durationMs).toBe("number");
    expect(logged[0]).not.toContain(KEY);
  });
});

describe("request id sanitisation", () => {
  it("drops non-printable characters before reflecting the value", async () => {
    const captured = await postOrder({
      headers: { ...authHeaders, "X-Request-ID": `trace\u0007-001` },
    });

    expect(captured.headers["x-request-id"]).toBe("trace-001");
  });

  it("bounds an over-long value", async () => {
    const captured = await postOrder({
      headers: { ...authHeaders, "X-Request-ID": "x".repeat(500) },
    });

    expect(captured.headers["x-request-id"]).toHaveLength(200);
  });
});
