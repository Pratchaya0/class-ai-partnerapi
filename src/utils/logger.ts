/**
 * Structured request log. One JSON line per partner request so learners can grep
 * their requestId across the backend log and this service's Vercel log.
 *
 * Never add the workshop key or raw customer payloads to this shape.
 */
export interface PartnerRequestLog {
  requestId: string;
  orderNo: string | null;
  scenario: string;
  responseStatus: number;
  durationMs: number;
}

export function logPartnerRequest(entry: PartnerRequestLog): void {
  console.log(JSON.stringify(entry));
}
