import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildOpenApiDocument } from "../src/openapi/document";

/**
 * Advertise the URL this request actually arrived on, so a preview deployment
 * documents itself instead of pointing tooling at production.
 */
function serverUrlFrom(req: VercelRequest): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (!host) return "/";

  const hostname = Array.isArray(host) ? host[0] : host;
  if (!hostname) return "/";

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  // Vercel always sets x-forwarded-proto; the local fallback keeps a plain
  // `node`/`vercel dev` run on http so the docs page can call itself.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(hostname);
  return `${proto ?? (isLocal ? "http" : "https")}://${hostname}`;
}

/**
 * Serves the OpenAPI document. Open on purpose: learners need to read the contract
 * before they have been given a workshop key.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Allow external editors (Swagger Editor, Postman) to fetch the spec.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json(buildOpenApiDocument(serverUrlFrom(req)));
}
