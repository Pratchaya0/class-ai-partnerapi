import { describe, expect, it } from "vitest";
import { OrderRequestSchema, toValidationErrors } from "../src/contracts/order-request.js";
import { buildOpenApiDocument } from "../src/openapi/document.js";
import { SCENARIOS } from "../src/scenarios/resolve-scenario.js";

/**
 * Contract tests. These exist to make the published docs fail loudly rather than
 * drift away from what the endpoints actually do.
 */

const doc = buildOpenApiDocument();

function at(path: string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string, unknown> | undefined)?.[key],
    doc,
  );
}

const ordersPost = at(["paths", "/api/orders", "post"]) as Record<string, unknown>;

describe("document shape", () => {
  it("is OpenAPI 3.0 and serialises to JSON", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it("emits no $defs, which OpenAPI 3.0 cannot resolve", () => {
    expect(JSON.stringify(doc)).not.toContain("$defs");
  });

  it("advertises a server, so generated clients have a base URL", () => {
    expect(buildOpenApiDocument("https://partner.example.com").servers).toEqual([
      { url: "https://partner.example.com", description: "This deployment" },
    ]);
    // Relative default keeps the spec usable when no host header is available.
    expect(doc.servers).toEqual([{ url: "/", description: "This deployment" }]);
  });

  it("gives every operation an operationId for code generation", () => {
    const operations = [
      ["/api/health", "get", "getHealth"],
      ["/api/openapi", "get", "getOpenApiDocument"],
      ["/api/orders", "post", "createPartnerOrder"],
    ] as const;

    for (const [path, method, id] of operations) {
      expect(at(["paths", path, method, "operationId"])).toBe(id);
    }
  });

  it("documents the workshop key as a security scheme without leaking a value", () => {
    expect(at(["components", "securitySchemes", "WorkshopKey"])).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "X-Workshop-Key",
    });

    const serialized = JSON.stringify(doc);
    for (const secret of ["change-me", process.env.WORKSHOP_API_KEY]) {
      if (secret) expect(serialized).not.toContain(secret);
    }
  });

  it("leaves health and openapi open, and protects orders", () => {
    expect(at(["paths", "/api/health", "get", "security"])).toEqual([]);
    expect(at(["paths", "/api/openapi", "get", "security"])).toEqual([]);
    expect(ordersPost.security).toEqual([{ WorkshopKey: [] }]);
  });
});

describe("scenario coverage", () => {
  it("documents every status code the scenario table can produce", () => {
    const responses = Object.keys(ordersPost.responses as object);
    for (const status of ["200", "400", "401", "405", "429", "500", "503"]) {
      expect(responses).toContain(status);
    }
  });

  it("keeps the X-Mock-Scenario enum in step with the code", () => {
    const enumValues = at([
      "components",
      "parameters",
      "MockScenario",
      "schema",
      "enum",
    ]);
    expect(enumValues).toEqual([...SCENARIOS]);
  });

  it("mentions each OrderNo convention in the endpoint description", () => {
    const description = ordersPost.description as string;
    for (const orderNo of [
      "ORD400",
      "ORD429",
      "ORD500",
      "ORD503",
      "ORDTIMEOUT",
      "ORDRANDOM",
    ]) {
      expect(description).toContain(orderNo);
    }
  });
});

describe("schemas match runtime behaviour", () => {
  it("does not claim extra fields are rejected, since Zod strips them", () => {
    const schema = at(["components", "schemas", "OrderRequest"]) as Record<
      string,
      unknown
    >;
    expect(schema).not.toHaveProperty("additionalProperties");

    const parsed = OrderRequestSchema.safeParse({
      orderNo: "ORD001",
      customerCode: "C001",
      amount: 1,
      currency: "THB",
      unexpected: "field",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires the four documented fields", () => {
    const schema = at(["components", "schemas", "OrderRequest"]) as {
      required: string[];
    };
    expect(schema.required.sort()).toEqual([
      "amount",
      "currency",
      "customerCode",
      "orderNo",
    ]);
  });

  it("shows a 400 example whose errors match what validation really returns", () => {
    const example = at([
      "paths",
      "/api/orders",
      "post",
      "responses",
      "400",
      "content",
      "application/json",
      "example",
    ]) as { errors: string[] };

    const parsed = OrderRequestSchema.safeParse({
      orderNo: "",
      customerCode: "C001",
      amount: -100,
      currency: "THB",
    });
    expect(parsed.success).toBe(false);

    const actual = toValidationErrors(parsed.error!);
    for (const documented of example.errors) {
      expect(actual).toContain(documented);
    }
  });
});
