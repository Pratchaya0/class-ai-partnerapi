# PLAN.md — Partner Mock API for Workshop

## 1. Project Summary

สร้าง **Partner Mock API** แยกเป็นอีก Repository สำหรับใช้ใน Workshop  
**Bulk Order Processing & Partner Integration**

Service นี้ทำหน้าที่จำลอง External Partner System ที่ Backend หลักจะเรียกผ่าน HTTP/RestSharp เพื่อให้ผู้เรียนสามารถทดลองกับสถานการณ์จริง เช่น:

- Success
- Validation Error
- Rate Limit
- Internal Server Error
- Service Unavailable
- Slow Response / Client Timeout
- Random Failure (optional)

Service ต้อง **เล็ก, Stateless, Deploy ง่ายบน Vercel และไม่ต้องมี Database** ใน MVP

---

## 2. Primary Goal

ทำให้ Workshop สามารถสาธิต Flow นี้ได้จริง:

```text
Order Processing Worker
        │
        │ RestSharp / HTTP
        ▼
┌──────────────────────────┐
│ Partner Mock API         │
│ Hosted on Vercel         │
│                          │
│ POST /api/orders         │
└─────────────┬────────────┘
              │
      ┌───────┼───────────────┐
      │       │               │
     2xx     4xx             5xx / Slow
      │       │               │
      ▼       ▼               ▼
Completed   Failed      Retry / Recovery
```

เป้าหมายไม่ใช่การสร้าง Mock Server ที่มี Feature เยอะ  
แต่เป็นการสร้าง **Controlled External Failure Environment** สำหรับใช้สอน Backend Integration

---

# 3. Tech Stack

## Runtime

- TypeScript
- Node.js
- Vercel Functions

## Testing

- Vitest

## Deployment

- Git Repository แยกจาก Workshop Backend
- Deploy ผ่าน Vercel
- Preview Deployment สำหรับ Pull Request
- Production Deployment สำหรับ URL ที่แจกผู้เรียน

## Persistence

ไม่มี Database ใน MVP

Service ต้องออกแบบเป็น Stateless เพื่อให้เหมาะกับ Serverless Runtime

---

# 4. Scope

## In Scope

- `GET /api/health`
- `POST /api/orders`
- Validate Request
- Deterministic Mock Scenarios
- Optional Random Scenario
- Artificial Latency
- Standard Error Response
- Request ID
- Simple Workshop API Key
- Structured Logging
- Automated Tests
- Vercel Deployment

## Out of Scope

- Database
- User Management
- OAuth
- Admin UI
- Message Queue
- Dashboard
- Stateful retry counters
- Production-grade Partner Simulator
- Persistent request history
- Complex rate limiting infrastructure
- OpenTelemetry stack

---

# 5. Repository Structure

```text
partner-mock-api/
│
├── api/
│   ├── health.ts
│   └── orders.ts
│
├── src/
│   ├── contracts/
│   │   ├── order-request.ts
│   │   └── partner-response.ts
│   │
│   ├── scenarios/
│   │   ├── resolve-scenario.ts
│   │   └── scenario-handler.ts
│   │
│   ├── middleware/
│   │   └── workshop-auth.ts
│   │
│   └── utils/
│       ├── request-id.ts
│       └── sleep.ts
│
├── tests/
│   ├── scenario-resolver.test.ts
│   └── order-handler.test.ts
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
├── README.md
└── PLAN.md
```

> ไม่ต้องสร้าง Layer/Abstraction เพิ่มหากไม่ได้เพิ่มประโยชน์ต่อ Workshop

---

# 6. API Contract

## 6.1 Health Check

```http
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "service": "partner-mock-api"
}
```

Expected Status:

```text
200 OK
```

---

# 6.2 Create Partner Order

```http
POST /api/orders
Content-Type: application/json
X-Workshop-Key: <secret>
```

Request:

```json
{
  "orderNo": "ORD001",
  "customerCode": "C001",
  "amount": 1200,
  "currency": "THB"
}
```

Required Fields:

| Field | Type | Rule |
|---|---|---|
| orderNo | string | required |
| customerCode | string | required |
| amount | number | must be > 0 |
| currency | string | required |

---

# 7. Standard Success Response

```http
200 OK
```

```json
{
  "success": true,
  "referenceId": "PTR-xxxxxxxx",
  "orderNo": "ORD001",
  "requestId": "xxxxxxxx"
}
```

`referenceId` สามารถ generate ใหม่ทุก Request ได้

---

# 8. Standard Error Response

Error ทุก Scenario ควรมี Shape เดียวกัน:

```json
{
  "success": false,
  "code": "PARTNER_TEMPORARY_FAILURE",
  "message": "Partner service is temporarily unavailable.",
  "orderNo": "ORD503",
  "requestId": "xxxxxxxx"
}
```

Backend Workshop ไม่ควรต้อง Parse Error Format หลายแบบโดยไม่จำเป็น

---

# 9. Scenario Design

## Important Rule

**Default Scenario ต้อง Deterministic**

ไม่ใช้ Random Failure เป็นค่า Default เพราะผู้เรียนแต่ละคนต้องสามารถ reproduce ผลลัพธ์เดียวกันได้

Scenario สามารถเลือกได้ 2 วิธี:

```text
Priority 1: X-Mock-Scenario Header
Priority 2: OrderNo Convention
Priority 3: success
```

---

# 10. OrderNo Scenario Convention

ใช้ OrderNo เพื่อให้ผู้เรียนควบคุม Scenario ได้จาก Excel โดยตรง

| OrderNo | Response |
|---|---|
| `ORD001` | 200 Success |
| `ORD002` | 200 Success |
| `ORD400` | 400 Bad Request |
| `ORD429` | 429 Too Many Requests |
| `ORD500` | 500 Internal Server Error |
| `ORD503` | 503 Service Unavailable |
| `ORDTIMEOUT` | Artificial slow response |
| `ORDRANDOM` | Random scenario |

สำหรับ OrderNo อื่น:

```text
Default → 200 OK
```

---

# 11. Header Scenario Override

รองรับ:

```http
X-Mock-Scenario: success
```

Possible Values:

```text
success
bad-request
rate-limit
server-error
service-unavailable
timeout
random
```

ตัวอย่าง:

```http
POST /api/orders
X-Mock-Scenario: service-unavailable
```

ให้ตอบ:

```text
503 Service Unavailable
```

Header นี้มี Priority สูงกว่า OrderNo Convention

---

# 12. Scenario Behavior

## success

```text
HTTP 200
```

Order Processing Worker:

```text
Processing
    ↓
Completed
```

---

## bad-request

```text
HTTP 400
```

Response Code:

```text
INVALID_ORDER
```

Expected Workshop Behavior:

```text
Do not retry
     ↓
Order → Failed
```

---

## rate-limit

```text
HTTP 429
```

Optional Header:

```http
Retry-After: 2
```

Expected Workshop Behavior:

```text
Retryable Failure
```

---

## server-error

```text
HTTP 500
```

Expected Workshop Behavior:

```text
MassTransit Retry
```

---

## service-unavailable

```text
HTTP 503
```

Expected Workshop Behavior:

```text
MassTransit Retry
```

---

## timeout

Server intentionally waits before responding.

Configuration:

```text
MOCK_TIMEOUT_MS
```

Default recommendation:

```text
5000 ms
```

Workshop Backend should configure RestSharp timeout shorter than the Mock API delay.

Example:

```text
Partner Mock Delay = 5000 ms
RestSharp Timeout   = 2000 ms
```

Expected:

```text
RestSharp
    ↓
Client Timeout
    ↓
Retry Policy
```

Do not hard-code an excessively long delay.

---

# 13. Optional Random Scenario

Random mode มีไว้สำหรับท้าย Workshop หรือ Chaos Demo เท่านั้น

```text
X-Mock-Scenario: random
```

หรือ:

```text
OrderNo = ORDRANDOM
```

Example Distribution:

```text
70% → 200
10% → 400
10% → 500
 5% → 503
 5% → slow response
```

ค่าจริงควรเก็บเป็น Configuration หรือ Constants ที่แก้ไขได้ง่าย

Random Mode ต้องไม่ถูกใช้ใน Automated Tests โดยตรง

---

# 14. Retry-Then-Success

ไม่ทำ Stateful:

```text
Request 1 → 500
Request 2 → 500
Request 3 → 200
```

ใน MVP

เหตุผล:

Vercel Function instances ไม่ควรถูกใช้เป็น Persistent State Store และ In-memory Counter ไม่รับประกันว่าจะอยู่ใน Instance เดิม

ถ้าต้องการ Demo นี้ในอนาคตให้เลือกหนึ่งในสองแนวทาง:

### Option A — Caller Controlled Attempt

Backend ส่ง:

```http
X-Mock-Attempt: 1
```

Mock Service ตอบตาม attempt number

### Option B — External State

ใช้ Redis/KV ภายนอกเก็บ Counter

**ไม่ทำใน Phase 1**

---

# 15. Workshop Authentication

เนื่องจาก Production URL จะอยู่บน Internet ให้มี Shared Workshop Key แบบง่าย

Environment Variable:

```text
WORKSHOP_API_KEY
```

Client ส่ง:

```http
X-Workshop-Key: <key>
```

ถ้า Key ไม่ถูกต้อง:

```text
401 Unauthorized
```

Health Endpoint ไม่จำเป็นต้องใช้ Key

ห้าม Log ค่า API Key

---

# 16. Environment Variables

`.env.example`

```env
WORKSHOP_API_KEY=change-me
MOCK_TIMEOUT_MS=5000
ENABLE_RANDOM_SCENARIO=true
```

Production Secret ต้องตั้งผ่าน Vercel Environment Variables

ห้าม Commit Secret จริงเข้า Repository

---

# 17. Request ID

ทุก Request ต้องมี `requestId`

ถ้า Client ส่ง:

```http
X-Request-ID
```

ให้ใช้ค่าที่ส่งมา

ถ้าไม่มี:

```text
Generate UUID
```

Response:

```http
X-Request-ID: <uuid>
```

และ Response Body:

```json
{
  "requestId": "<uuid>"
}
```

ประโยชน์ใน Workshop:

```text
Backend Log
    │
    │ requestId
    ▼
Partner Mock Log
```

ผู้เรียนสามารถ Trace Request ข้าม Service ได้

---

# 18. Logging

ทุก Partner Request Log อย่างน้อย:

```text
requestId
orderNo
scenario
responseStatus
durationMs
```

ตัวอย่าง:

```json
{
  "requestId": "abc123",
  "orderNo": "ORD503",
  "scenario": "service-unavailable",
  "responseStatus": 503,
  "durationMs": 12
}
```

Do Not Log:

```text
X-Workshop-Key
Secrets
Sensitive Customer Data ที่ไม่จำเป็น
```

---

# 19. Validation

Validation ทำก่อน Scenario Processing

ตัวอย่าง Invalid Request:

```json
{
  "orderNo": "",
  "customerCode": "C001",
  "amount": -100,
  "currency": "THB"
}
```

Response:

```http
400 Bad Request
```

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Invalid partner order request.",
  "errors": [
    "orderNo is required",
    "amount must be greater than 0"
  ],
  "requestId": "..."
}
```

Scenario `bad-request` ใช้จำลอง Business Error หลัง Request ผ่าน Schema Validation แล้ว

แยกให้ออกจาก Input Validation ของ Mock API

---

# 20. Security / Abuse Protection

Service นี้เป็น Public Workshop Mock Service ไม่ใช่ Production API

Minimum Protection:

- Require `X-Workshop-Key`
- Never expose secret in Repository
- Clamp configurable delay
- Limit accepted JSON payload sizeถ้าทำได้โดยไม่เพิ่ม complexity สูง
- Reject unsupported HTTP methods
- Disable random scenario ได้จาก Environment Variable
- Avoid endpoints that allow arbitrary status codes or arbitrary sleep duration without bounds

---

# 21. Implementation Rules

Implementation ต้อง:

- Keep functions small
- Keep scenario logic separate from HTTP plumbing
- Avoid framework unless needed
- Avoid database
- Avoid unnecessary classes
- Avoid dependency-heavy architecture
- Use async APIs where needed
- Return consistent JSON contracts
- Keep scenario behavior easy to read by workshop instructors

---

# 22. Scenario Resolver

Expected conceptual behavior:

```text
Incoming Request
      │
      ▼
Validate Workshop Key
      │
      ▼
Validate Request Body
      │
      ▼
Resolve Scenario
      │
      ├── X-Mock-Scenario
      │
      ├── OrderNo
      │
      └── success
      │
      ▼
Execute Scenario
      │
      ▼
Return HTTP Response
```

Pseudo Logic:

```text
scenario =
    headerScenario
    ?? scenarioFromOrderNo
    ?? success
```

---

# 23. Automated Tests

## Scenario Resolver Tests

Test:

```text
ORD400     → bad-request
ORD429     → rate-limit
ORD500     → server-error
ORD503     → service-unavailable
ORDTIMEOUT → timeout
ORD001     → success
UNKNOWN    → success
```

Test Header Override:

```text
OrderNo = ORD001
Header = server-error

Expected:
server-error
```

---

## API Behavior Tests

At minimum:

```text
✓ health returns 200

✓ missing workshop key returns 401

✓ invalid request returns 400

✓ valid normal order returns 200

✓ ORD400 returns 400

✓ ORD429 returns 429

✓ ORD500 returns 500

✓ ORD503 returns 503

✓ timeout scenario waits configured delay

✓ response contains requestId

✓ incoming X-Request-ID is preserved
```

Random distribution does not require exact statistical test.

---

# 24. Manual Test Cases

## Success

```bash
curl -X POST "$PARTNER_URL/api/orders" \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Key: $WORKSHOP_API_KEY" \
  -d '{
    "orderNo": "ORD001",
    "customerCode": "C001",
    "amount": 1200,
    "currency": "THB"
  }'
```

Expected:

```text
200
```

---

## Temporary Failure

Change:

```text
ORD001
```

to:

```text
ORD503
```

Expected:

```text
503
```

---

## Client Timeout

Use:

```text
ORDTIMEOUT
```

Expected:

```text
Partner waits longer than Workshop Backend client timeout
```

---

# 25. Deployment Flow

```text
Git Repository
      │
      ▼
Push / Pull Request
      │
      ▼
Vercel Build
      │
      ├── Preview Deployment
      │
      └── Production Deployment
                  │
                  ▼
       https://<partner-service>/api/orders
```

Production URL จะถูกแจกให้ผู้เรียนผ่าน Workshop Configuration

ตัวอย่าง Backend Configuration:

```json
{
  "PartnerApi": {
    "BaseUrl": "https://<partner-service>",
    "ApiKey": "<workshop-key>"
  }
}
```

---

# 26. README Requirements

README ต้องมี:

1. Project purpose
2. Architecture
3. Local development
4. Environment variables
5. Deployment
6. API contract
7. Available scenarios
8. Curl examples
9. Workshop usage
10. Security warning

ควรมี Scenario Table ที่ Copy/Paste ได้ง่าย

---

# 27. Workshop Scenario Dataset

Excel ที่ใช้ใน Workshop สามารถเตรียมข้อมูลแบบนี้:

| OrderNo | CustomerCode | Amount | Currency | Expected |
|---|---|---:|---|---|
| ORD001 | C001 | 1200 | THB | Success |
| ORD002 | C002 | 3500 | THB | Success |
| ORD400 | C003 | 800 | THB | Permanent Failure |
| ORD503 | C004 | 2100 | THB | Retryable Failure |
| ORDTIMEOUT | C005 | 990 | THB | Timeout |

Instructor สามารถเลือกเปิด/ปิด Scenario ตามช่วงของ Lab

---

# 28. Workshop Integration

Partner Mock API ต้องรองรับ Story นี้:

```text
orders.xlsx
     │
     ▼
Order Import API
     │
     ▼
SQL Server
     │
     ▼
RabbitMQ
     │
     ▼
Order Processing Worker
     │
     │ RestSharp
     ▼
Partner Mock API
     │
     ├── 200
     │     ↓
     │  Completed
     │
     ├── 400
     │     ↓
     │  Failed
     │
     ├── 503
     │     ↓
     │  MassTransit Retry
     │
     └── Timeout
           ↓
        Retry / Recovery
```

---

# 29. Implementation Phases

## Phase 1 — Bootstrap

- Create TypeScript project
- Configure Vercel
- Add `/api/health`
- Configure tests

Acceptance:

```text
GET /api/health → 200
Tests pass
Deployment works
```

---

## Phase 2 — Order Contract

- Create request contract
- Create response contract
- Add validation
- Implement `/api/orders`

Acceptance:

```text
Valid request → 200
Invalid request → 400
```

---

## Phase 3 — Deterministic Scenarios

Implement:

```text
success
bad-request
rate-limit
server-error
service-unavailable
timeout
```

Support:

```text
OrderNo Convention
X-Mock-Scenario
```

Acceptance:

All deterministic scenario tests pass.

---

## Phase 4 — Workshop Protection

- Add Workshop API Key
- Add Request ID
- Add structured logs
- Clamp delays

Acceptance:

Unauthorized requests are rejected and secrets are never logged.

---

## Phase 5 — Random / Chaos Mode

Implement optional:

```text
random
```

Acceptance:

Can be disabled via Environment Variable.

---

## Phase 6 — Documentation & Deployment

- README
- Curl examples
- Scenario table
- `.env.example`
- Production Vercel deployment
- Verify Workshop Backend can call service

---

# 30. Definition of Done

Project ถือว่าเสร็จเมื่อ:

- [ ] Repository แยกจาก Backend Workshop
- [ ] Deploy บน Vercel สำเร็จ
- [ ] `/api/health` ใช้งานได้
- [ ] `/api/orders` ใช้งานได้
- [ ] Success scenario ทำงาน
- [ ] 400 scenario ทำงาน
- [ ] 429 scenario ทำงาน
- [ ] 500 scenario ทำงาน
- [ ] 503 scenario ทำงาน
- [ ] Timeout scenario ทำงาน
- [ ] Scenario เลือกจาก OrderNo ได้
- [ ] Scenario override ด้วย Header ได้
- [ ] Workshop API Key ทำงาน
- [ ] Request ID ทำงาน
- [ ] Automated tests ผ่าน
- [ ] README มี Workshop instructions
- [ ] Backend .NET Workshop เรียกผ่าน RestSharp ได้จริง

---

# 31. Recommended MVP Cut Line

ถ้ามีเวลาน้อย ให้ทำแค่:

```text
GET  /api/health

POST /api/orders

ORD001     → 200
ORD400     → 400
ORD500     → 500
ORD503     → 503
ORDTIMEOUT → delay
```

พร้อม:

```text
X-Workshop-Key
X-Request-ID
```

**ไม่ต้องทำ Random Mode ก่อน Workshop ก็ได้**

เพราะ Deterministic Failure Scenarios มีคุณค่าต่อการสอนมากกว่า

---

# 32. Final Architecture

```text
                        Internet

                           │
                           ▼

                 ┌───────────────────┐
                 │ Vercel            │
                 │                   │
                 │ Partner Mock API  │
                 │                   │
                 │ /api/health       │
                 │ /api/orders       │
                 └─────────▲─────────┘
                           │
                           │ HTTP
                           │ RestSharp
                           │
                 ┌─────────┴─────────┐
                 │ Workshop Backend  │
                 │                   │
                 │ Order Processing  │
                 │ Worker            │
                 └───────────────────┘


Partner Mock API

     Request
        │
        ▼
   Authentication
        │
        ▼
     Validation
        │
        ▼
  Scenario Resolver
        │
   ┌────┼─────┬──────┬─────────┐
   ▼    ▼     ▼      ▼         ▼
 200   400   429    5xx       Slow
   │    │     │      │         │
   └────┴─────┴──────┴─────────┘
        │
        ▼
   HTTP Response
```

---

# 33. Core Design Principle

> Mock Service ต้อง Predictable ก่อนที่จะ Chaos

Workshop ควรเริ่มจาก:

```text
Known Input
    ↓
Known Failure
    ↓
Observe Backend Behavior
```

แล้วค่อยไป:

```text
Random Failure
    ↓
Can our system survive?
```

จุดประสงค์คือให้ผู้เรียนสามารถเข้าใจและ Debug Distributed Backend Flow ได้
โดยไม่ต้องพึ่ง External Partner จริง
