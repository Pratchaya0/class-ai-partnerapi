# Partner Mock API

Mock external partner system for the **Bulk Order Processing & Partner Integration** workshop.

It exists to produce *controlled, reproducible* failures — success, validation error, rate limit,
server error, service unavailable and slow responses — so learners can watch how their .NET order
processing worker retries and recovers, without depending on a real partner system.

> **Predictable before chaos.** The default behaviour is fully deterministic: the same OrderNo
> always produces the same result for every learner. Random mode is opt-in.

**Interactive API reference:** `https://<your-deployment>/api/docs`

---

## 1. Architecture

```text
orders.xlsx
     │
     ▼
Order Import API ──► SQL Server ──► RabbitMQ ──► Order Processing Worker
                                                        │
                                                        │ RestSharp / HTTP
                                                        ▼
                                            ┌───────────────────────┐
                                            │ Partner Mock API      │
                                            │ (this repo, Vercel)   │
                                            │                       │
                                            │ POST /api/orders      │
                                            └───────────┬───────────┘
                                                        │
                              ┌─────────────┬───────────┼──────────┬─────────────┐
                              ▼             ▼           ▼          ▼             ▼
                             200           400         429    500 / 503     slow response
                              │             │           │          │             │
                          Completed      Failed     Retryable   Retry      Client timeout
                                        (no retry)                          ► Retry policy
```

Inside the service:

```text
Request ─► Request ID ─► Method guard ─► Workshop key ─► Schema validation
        ─► Scenario resolver ─► Scenario execution ─► Structured log ─► Response
```

Scenario logic lives in [`src/scenarios/`](src/scenarios/) as pure functions with no knowledge of
HTTP. The files in [`api/`](api/) are thin adapters. Nothing is persisted — the service is
stateless, which is what makes it safe on a serverless runtime.

---

## 2. Local development

```bash
npm install
cp .env.example .env.local     # then edit WORKSHOP_API_KEY

npm run typecheck              # tsc --noEmit
npm test                       # vitest, 64 tests
npm run test:watch

npm i -g vercel                # once
npm run dev                    # vercel dev, serves on http://localhost:3000
```

Requires Node.js 22 or newer.

---

## 3. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WORKSHOP_API_KEY` | *(none)* | Shared key clients send as `X-Workshop-Key`. **Without it `/api/orders` rejects everything** — it fails closed on purpose. |
| `MOCK_TIMEOUT_MS` | `5000` | Delay used by the `timeout` scenario. Clamped to `0..8000` at runtime. |
| `ENABLE_RANDOM_SCENARIO` | `true` | Set to `false` to turn the chaos scenario into plain success. |

Set the real values through **Vercel → Project → Settings → Environment Variables**.
Never commit a real key.

---

## 4. API contract

### `GET /api/health`

No key required.

```json
{ "status": "ok", "service": "partner-mock-api" }
```

### `GET /api/openapi` and `GET /api/docs`

No key required — learners need to read the contract before they have been given a key.
`/api/openapi` serves the OpenAPI 3.0 document; `/api/docs` renders it as a browsable reference
with a request runner.

The document is generated from the same Zod schemas the endpoint validates with, so the docs cannot
drift from the running contract.

### `POST /api/orders`

```http
POST /api/orders
Content-Type: application/json
X-Workshop-Key: <key>
X-Mock-Scenario: <optional scenario>
X-Request-ID: <optional correlation id>
```

Request body:

```json
{
  "orderNo": "ORD001",
  "customerCode": "C001",
  "amount": 1200,
  "currency": "THB"
}
```

| Field | Type | Rule |
|---|---|---|
| `orderNo` | string | required, non-empty |
| `customerCode` | string | required, non-empty |
| `amount` | number | must be greater than 0 |
| `currency` | string | required, non-empty |

Unknown fields are ignored rather than rejected.

**Success — 200**

```json
{
  "success": true,
  "referenceId": "PTR-9a1b2c3d",
  "orderNo": "ORD001",
  "requestId": "3f6c1c7e-6b8e-4c2f-9f1a-4a0f1b2c3d4e"
}
```

**Every failure uses one shape**, so the backend only needs a single error parser — including 401
and 405:

```json
{
  "success": false,
  "code": "PARTNER_TEMPORARY_FAILURE",
  "message": "Partner service is temporarily unavailable.",
  "orderNo": "ORD503",
  "requestId": "3f6c1c7e-6b8e-4c2f-9f1a-4a0f1b2c3d4e"
}
```

Schema validation failures add an `errors` array:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Invalid partner order request.",
  "errors": ["orderNo is required", "amount must be greater than 0"],
  "requestId": "..."
}
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request failed schema validation |
| `INVALID_ORDER` | 400 | Partner rejected a well-formed order (business error) |
| `UNAUTHORIZED` | 401 | Missing or wrong `X-Workshop-Key` |
| `METHOD_NOT_ALLOWED` | 405 | Endpoint only accepts POST |
| `RATE_LIMITED` | 429 | Rate limited, retryable, sends `Retry-After: 2` |
| `PARTNER_INTERNAL_ERROR` | 500 | Partner internal error, retryable |
| `PARTNER_TEMPORARY_FAILURE` | 503 | Partner temporarily down, retryable |

### Request ID

Send `X-Request-ID` and it is echoed back in both the response header and the `requestId` body
field. Omit it and a UUID is generated. Use it to join a backend log line to a partner log line.

---

## 5. Scenarios

### By OrderNo — drive scenarios straight from the Excel sheet

| OrderNo | Response | Expected backend behaviour |
|---|---|---|
| `ORD001`, `ORD002`, anything else | 200 Success | Order → Completed |
| `ORD400` | 400 `INVALID_ORDER` | Do not retry → Failed |
| `ORD429` | 429 `RATE_LIMITED` + `Retry-After: 2` | Retryable failure |
| `ORD500` | 500 `PARTNER_INTERNAL_ERROR` | MassTransit retry |
| `ORD503` | 503 `PARTNER_TEMPORARY_FAILURE` | MassTransit retry |
| `ORDTIMEOUT` | 200 after `MOCK_TIMEOUT_MS` | Client timeout → retry / recovery |
| `ORDRANDOM` | Weighted random | Chaos demo |

Matching is case-insensitive.

### By header — overrides the OrderNo convention

```http
X-Mock-Scenario: service-unavailable
```

Accepted values:

```text
success  bad-request  rate-limit  server-error  service-unavailable  timeout  random
```

An unrecognised value is ignored and the OrderNo convention applies instead, so a typo never breaks
a request.

### Timeout scenario

The server waits, then answers 200. Configure the client to give up first:

```text
Partner Mock delay = 5000 ms   (MOCK_TIMEOUT_MS)
RestSharp timeout  = 2000 ms
```

The delay is clamped to 8 s so it always finishes inside the function duration limit.

### Random scenario

Reserved for the end of the workshop or a chaos demo. Distribution lives in
[`src/scenarios/scenario-handler.ts`](src/scenarios/scenario-handler.ts):

```text
70% → 200        10% → 400        10% → 500        5% → 503        5% → slow response
```

Set `ENABLE_RANDOM_SCENARIO=false` to disable it for a deployment.

### Not implemented on purpose

Stateful retry-then-success (`500, 500, 200`) is **not** supported. Serverless instances are not a
reliable state store — an in-memory counter is not guaranteed to land on the same instance. If this
demo is needed later, either have the caller send `X-Mock-Attempt: 1` or keep the counter in an
external KV store.

---

## 6. Curl examples

```bash
export PARTNER_URL="https://<your-deployment>"
export WORKSHOP_API_KEY="<key>"

# health
curl -s "$PARTNER_URL/api/health"

# success
curl -si -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -d '{"orderNo":"ORD001","customerCode":"C001","amount":1200,"currency":"THB"}'

# retryable failure (503)
curl -si -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -d '{"orderNo":"ORD503","customerCode":"C004","amount":2100,"currency":"THB"}'

# force a scenario regardless of OrderNo
curl -si -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -H "X-Mock-Scenario: rate-limit" \
  -d '{"orderNo":"ORD001","customerCode":"C001","amount":1200,"currency":"THB"}'

# client timeout: give curl 2s against a 5s partner delay
curl -si --max-time 2 -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -d '{"orderNo":"ORDTIMEOUT","customerCode":"C005","amount":990,"currency":"THB"}'

# validation error
curl -si -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -d '{"orderNo":"","customerCode":"C001","amount":-100,"currency":"THB"}'

# trace a request across services
curl -si -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -H "X-Request-ID: my-trace-001" \
  -d '{"orderNo":"ORD001","customerCode":"C001","amount":1200,"currency":"THB"}'
```

---

## 7. Workshop usage

Backend configuration:

```json
{
  "PartnerApi": {
    "BaseUrl": "https://<partner-service>",
    "ApiKey": "<workshop-key>"
  }
}
```

Starter dataset for `orders.xlsx`:

| OrderNo | CustomerCode | Amount | Currency | Expected |
|---|---|---:|---|---|
| ORD001 | C001 | 1200 | THB | Success |
| ORD002 | C002 | 3500 | THB | Success |
| ORD400 | C003 | 800 | THB | Permanent failure |
| ORD429 | C006 | 1500 | THB | Retryable failure (rate limit) |
| ORD503 | C004 | 2100 | THB | Retryable failure |
| ORDTIMEOUT | C005 | 990 | THB | Timeout |

Instructors can open or close scenarios per lab by changing which OrderNo values appear in the
sheet — no redeploy needed.

Every request writes one structured log line, visible in the Vercel logs:

```json
{"requestId":"abc123","orderNo":"ORD503","scenario":"service-unavailable","responseStatus":503,"durationMs":12}
```

The workshop key is never logged.

---

## 8. Deployment

```text
Git push ──► Vercel build ──┬── Preview deployment (per pull request)
                            └── Production deployment (the URL handed to learners)
```

1. Import this repository in the Vercel dashboard.
2. Set `WORKSHOP_API_KEY`, `MOCK_TIMEOUT_MS` and `ENABLE_RANDOM_SCENARIO` in Environment Variables.
3. Deploy, then verify `GET /api/health` and open `/api/docs`.

If the plan's function duration limit rejects `maxDuration: 30`, lower it in
[`vercel.json`](vercel.json) — it only has to stay comfortably above the 8 s delay clamp.

---

## 9. Security warning

**This is a public teaching mock, not a production API.**

- Never send real customer data to it.
- The `X-Workshop-Key` is a shared secret handed to a class — treat it as public and rotate it after
  the workshop.
- No endpoint accepts an arbitrary status code or an unbounded sleep duration; the only configurable
  delay is clamped to 8 s.
- Request body size is capped by the Vercel platform (~4.5 MB), so no payload limit is hand-rolled.
- Unsupported HTTP methods are rejected with 405.
- The workshop key is never written to a log or echoed in a response.

`npm audit` reports advisories in the transitive dependencies of `@vercel/node`. That package is a
**devDependency used only for its TypeScript types** — the deployed functions run on Vercel's own
runtime and ship only `zod`.
