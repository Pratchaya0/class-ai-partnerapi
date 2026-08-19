/**
 * Runtime configuration read from environment variables.
 *
 * Read lazily on every call so tests can change process.env between cases and
 * so a Vercel instance picks up redeployed values without a cold-start cache.
 */

/** Upper bound for any artificial delay. Must stay meaningfully below vercel.json maxDuration. */
export const MAX_DELAY_MS = 8_000;

/** Used when MOCK_TIMEOUT_MS is missing or unparseable. */
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Clamp a delay so nobody can push the function past its duration limit. */
export function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(ms), 0), MAX_DELAY_MS);
}

/** Artificial delay for the `timeout` scenario, already clamped. */
export function getMockTimeoutMs(): number {
  const raw = process.env.MOCK_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;

  return clampDelay(parsed);
}

/** Whether the random/chaos scenario is allowed. Defaults to enabled. */
export function isRandomScenarioEnabled(): boolean {
  const raw = process.env.ENABLE_RANDOM_SCENARIO;
  if (raw === undefined || raw.trim() === "") return true;
  return raw.trim().toLowerCase() !== "false";
}

/** The shared workshop key, or undefined when the deployment has none configured. */
export function getWorkshopApiKey(): string | undefined {
  const raw = process.env.WORKSHOP_API_KEY;
  return raw && raw.length > 0 ? raw : undefined;
}
