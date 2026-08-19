import { z } from "zod";
import { OrderRequestSchema } from "../contracts/order-request";
import {
  HealthResponseSchema,
  PartnerErrorSchema,
  PartnerSuccessSchema,
} from "../contracts/partner-response";
import { SCENARIOS } from "../scenarios/resolve-scenario";

/**
 * The OpenAPI document is generated from the same Zod schemas the endpoints
 * validate with, so the published docs cannot drift from the running contract.
 */

type JsonSchema = Record<string, unknown>;

/**
 * Zod objects strip unknown keys rather than rejecting them, so the
 * `additionalProperties: false` that z.toJSONSchema emits would overstate the
 * contract and make learners think an extra field causes a 400. Drop it.
 */
function toOpenApiSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { target: "openapi-3.0" }) as JsonSchema;
  delete json.$schema;
  delete json.additionalProperties;
  return json;
}

const SCENARIO_TABLE = `
| OrderNo | Result |
|---|---|
| \`ORD001\`, \`ORD002\`, anything else | 200 Success |
| \`ORD400\` | 400 Bad Request (\`INVALID_ORDER\`) |
| \`ORD429\` | 429 Too Many Requests (\`RATE_LIMITED\`) |
| \`ORD500\` | 500 Internal Server Error (\`PARTNER_INTERNAL_ERROR\`) |
| \`ORD503\` | 503 Service Unavailable (\`PARTNER_TEMPORARY_FAILURE\`) |
| \`ORDTIMEOUT\` | 200, but only after \`MOCK_TIMEOUT_MS\` - use it to trigger a client timeout |
| \`ORDRANDOM\` | Weighted random outcome (can be disabled per deployment) |

The \`X-Mock-Scenario\` header overrides the OrderNo convention. An unrecognised
header value is ignored and the OrderNo convention applies instead.
`.trim();

const errorSchemaRef = { $ref: "#/components/schemas/PartnerError" };

function jsonContent(schema: unknown, example: unknown) {
  return { "application/json": { schema, example } };
}

const EXAMPLE_REQUEST_ID = "3f6c1c7e-6b8e-4c2f-9f1a-4a0f1b2c3d4e";

/**
 * @param serverUrl Base URL to advertise. The endpoint passes the URL the request
 *   actually arrived on, so a preview deployment documents itself rather than
 *   pointing tooling at production.
 */
export function buildOpenApiDocument(serverUrl = "/"): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    servers: [{ url: serverUrl, description: "This deployment" }],
    info: {
      title: "Partner Mock API",
      version: "1.0.0",
      description: [
        "Mock external partner system for the **Bulk Order Processing & Partner Integration** workshop.",
        "",
        "It exists to produce *controlled, reproducible* failures - success, validation error,",
        "rate limit, server error, service unavailable and slow responses - so a backend worker's",
        "retry and recovery behaviour can be observed without depending on a real partner.",
        "",
        "This is a teaching mock. Do not send real customer data to it.",
      ].join("\n"),
    },
    tags: [
      { name: "Orders", description: "Partner order submission" },
      { name: "System", description: "Health and documentation" },
    ],
    components: {
      securitySchemes: {
        WorkshopKey: {
          type: "apiKey",
          in: "header",
          name: "X-Workshop-Key",
          description:
            "Shared workshop key. Handed out by the instructor; configured per deployment as WORKSHOP_API_KEY.",
        },
      },
      parameters: {
        MockScenario: {
          name: "X-Mock-Scenario",
          in: "header",
          required: false,
          description:
            "Force a scenario, overriding the OrderNo convention. Unknown values are ignored.",
          schema: { type: "string", enum: [...SCENARIOS] },
          example: "service-unavailable",
        },
        RequestId: {
          name: "X-Request-ID",
          in: "header",
          required: false,
          description:
            "Correlation id. Echoed back in the response header and body; generated when omitted.",
          schema: { type: "string" },
        },
      },
      schemas: {
        OrderRequest: toOpenApiSchema(OrderRequestSchema),
        PartnerSuccess: toOpenApiSchema(PartnerSuccessSchema),
        PartnerError: toOpenApiSchema(PartnerErrorSchema),
        HealthResponse: toOpenApiSchema(HealthResponseSchema),
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          operationId: "getHealth",
          summary: "Liveness check",
          description: "No workshop key required.",
          security: [],
          responses: {
            "200": {
              description: "Service is up",
              content: jsonContent(
                { $ref: "#/components/schemas/HealthResponse" },
                { status: "ok", service: "partner-mock-api" },
              ),
            },
          },
        },
      },

      "/api/openapi": {
        get: {
          tags: ["System"],
          operationId: "getOpenApiDocument",
          summary: "This OpenAPI document",
          description: "No workshop key required.",
          security: [],
          responses: {
            "200": {
              description: "OpenAPI 3.0 document",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },

      "/api/orders": {
        post: {
          tags: ["Orders"],
          operationId: "createPartnerOrder",
          summary: "Submit an order to the partner",
          description: [
            "Validates the request, resolves a scenario, then returns the response that scenario dictates.",
            "",
            "### Scenario selection",
            "",
            SCENARIO_TABLE,
          ].join("\n"),
          security: [{ WorkshopKey: [] }],
          parameters: [
            { $ref: "#/components/parameters/MockScenario" },
            { $ref: "#/components/parameters/RequestId" },
          ],
          requestBody: {
            required: true,
            content: jsonContent(
              { $ref: "#/components/schemas/OrderRequest" },
              {
                orderNo: "ORD001",
                customerCode: "C001",
                amount: 1200,
                currency: "THB",
              },
            ),
          },
          responses: {
            "200": {
              description:
                "Accepted by the partner. The `timeout` scenario also returns 200, but only after the configured delay.",
              headers: {
                "X-Request-ID": {
                  description: "Correlation id for this request",
                  schema: { type: "string" },
                },
              },
              content: jsonContent(
                { $ref: "#/components/schemas/PartnerSuccess" },
                {
                  success: true,
                  referenceId: "PTR-9a1b2c3d",
                  orderNo: "ORD001",
                  requestId: EXAMPLE_REQUEST_ID,
                },
              ),
            },
            "400": {
              description:
                "Either the request failed schema validation (`VALIDATION_ERROR`) or the partner rejected the order (`INVALID_ORDER`, the `bad-request` scenario). Neither should be retried.",
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "VALIDATION_ERROR",
                message: "Invalid partner order request.",
                errors: ["orderNo is required", "amount must be greater than 0"],
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
            "401": {
              description: "Missing or wrong X-Workshop-Key.",
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "UNAUTHORIZED",
                message: "Missing or invalid workshop key.",
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
            "405": {
              description: "Only POST is accepted on this endpoint.",
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "METHOD_NOT_ALLOWED",
                message: "Only POST is supported on this endpoint.",
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
            "429": {
              description: "Rate limited. Retryable. Sends a `Retry-After` header.",
              headers: {
                "Retry-After": {
                  description: "Seconds to wait before retrying",
                  schema: { type: "string" },
                },
              },
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "RATE_LIMITED",
                message: "Too many requests. Please retry later.",
                orderNo: "ORD429",
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
            "500": {
              description: "Partner internal error. Retryable.",
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "PARTNER_INTERNAL_ERROR",
                message: "Partner service failed to process the order.",
                orderNo: "ORD500",
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
            "503": {
              description: "Partner temporarily unavailable. Retryable.",
              content: jsonContent(errorSchemaRef, {
                success: false,
                code: "PARTNER_TEMPORARY_FAILURE",
                message: "Partner service is temporarily unavailable.",
                orderNo: "ORD503",
                requestId: EXAMPLE_REQUEST_ID,
              }),
            },
          },
        },
      },
    },
  };
}
