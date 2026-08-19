import type { VercelRequest, VercelResponse } from "@vercel/node";
import { REQUEST_ID_HEADER, resolveRequestId } from "../src/utils/request-id.js";

/** Liveness probe. Intentionally open - no workshop key required. */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader("X-Request-ID", requestId);
  res.status(200).json({ status: "ok", service: "partner-mock-api" });
}
