import { z } from "zod";

/**
 * Schema for POST /api/orders.
 *
 * Messages are written out explicitly because they are part of the documented
 * contract (they appear in the 400 response body and in the OpenAPI examples),
 * not just internal validation noise.
 */
export const OrderRequestSchema = z.object({
  orderNo: z.string("orderNo is required").min(1, "orderNo is required"),
  customerCode: z
    .string("customerCode is required")
    .min(1, "customerCode is required"),
  amount: z
    .number("amount is required")
    .positive("amount must be greater than 0"),
  currency: z.string("currency is required").min(1, "currency is required"),
});

export type OrderRequest = z.infer<typeof OrderRequestSchema>;

/** Flatten Zod issues into the plain string list used by the 400 response. */
export function toValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

/**
 * Vercel parses application/json bodies for us, but a different content type can
 * leave req.body as a string, a Buffer, or undefined. Only a plain object can be
 * handed to the schema.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
