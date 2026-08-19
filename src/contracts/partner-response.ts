import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Every failure - validation, auth, method, and every mock scenario - uses the
 * same error shape so the workshop backend only has to write one error parser.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_ORDER: "INVALID_ORDER",
  RATE_LIMITED: "RATE_LIMITED",
  PARTNER_INTERNAL_ERROR: "PARTNER_INTERNAL_ERROR",
  PARTNER_TEMPORARY_FAILURE: "PARTNER_TEMPORARY_FAILURE",
  UNAUTHORIZED: "UNAUTHORIZED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const PartnerSuccessSchema = z.object({
  success: z.literal(true),
  referenceId: z.string(),
  orderNo: z.string(),
  requestId: z.string(),
});

export const PartnerErrorSchema = z.object({
  success: z.literal(false),
  code: z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]),
  message: z.string(),
  orderNo: z.string().nullable().optional(),
  requestId: z.string(),
  errors: z.array(z.string()).optional(),
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("partner-mock-api"),
});

export type PartnerSuccess = z.infer<typeof PartnerSuccessSchema>;
export type PartnerError = z.infer<typeof PartnerErrorSchema>;
export type PartnerResponse = PartnerSuccess | PartnerError;

/** Fresh on every request - this service keeps no state. */
export function newReferenceId(): string {
  return `PTR-${randomBytes(4).toString("hex")}`;
}

export function successResponse(
  orderNo: string,
  requestId: string,
): PartnerSuccess {
  return {
    success: true,
    referenceId: newReferenceId(),
    orderNo,
    requestId,
  };
}

export function errorResponse(params: {
  code: ErrorCode;
  message: string;
  requestId: string;
  orderNo?: string | null;
  errors?: string[];
}): PartnerError {
  const body: PartnerError = {
    success: false,
    code: params.code,
    message: params.message,
    requestId: params.requestId,
  };
  if (params.orderNo !== undefined) body.orderNo = params.orderNo;
  if (params.errors !== undefined) body.errors = params.errors;
  return body;
}
