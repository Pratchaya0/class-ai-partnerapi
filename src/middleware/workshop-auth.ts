import { getWorkshopApiKey } from "../config";

export const WORKSHOP_KEY_HEADER = "x-workshop-key";

/**
 * Shared workshop key check. The value is never logged and never echoed back.
 *
 * Fail closed: a deployment with no WORKSHOP_API_KEY configured rejects everything
 * rather than exposing an open endpoint on the public internet. Copy .env.example
 * to .env.local for local development.
 */
export function isAuthorized(headerValue: string | string[] | undefined): boolean {
  const expected = getWorkshopApiKey();
  if (expected === undefined) return false;

  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return provided === expected;
}
