import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

/** Anything outside printable ASCII, which must never reach a response header. */
const NON_PRINTABLE = /[^\x20-\x7E]/g;

/**
 * Reuse the caller's X-Request-ID when present so a workshop backend log line and
 * a partner log line can be joined on the same id. Generate a UUID otherwise.
 *
 * The value is sanitised and length-bounded before it is reflected back, since it
 * lands in both a response header and every log line for the request.
 */
export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const cleaned = value?.replace(NON_PRINTABLE, "").trim();
  if (cleaned) return cleaned.slice(0, 200);
  return randomUUID();
}
