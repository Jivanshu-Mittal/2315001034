/**
 * Logging Middleware
 * Reusable Log() function that posts structured log entries to the evaluation
 * service. All parameters are strictly typed and validated against allowed enums.
 *
 * Usage:
 *   import { Log } from "../logging_middleware/logger";
 *   await Log("backend", "info", "service", "Notification batch processed");
 */

// ── Allowed enum types ─────────────────────────────────────────────────────────

export type Stack = "backend" | "frontend";

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type BackendPackage =
  | "cache" | "controller" | "cron_job" | "db" | "domain"
  | "handler" | "repository" | "route" | "service"
  | "auth" | "config" | "middleware" | "utils";

export type FrontendPackage =
  | "api" | "component" | "hook" | "page"
  | "state" | "style"
  | "auth" | "config" | "middleware" | "utils";

export type LogPackage = BackendPackage | FrontendPackage;

// ── Internal log payload ───────────────────────────────────────────────────────

interface LogPayload {
  stack: Stack;
  level: Level;
  package: LogPackage;
  message: string;
}

// ── Configuration ──────────────────────────────────────────────────────────────

const LOG_API_URL = "http://4.224.186.213/evaluation-service/logs";

// API token should be injected via environment variable
const getToken = (): string =>
  (typeof process !== "undefined" && process.env?.API_TOKEN) ||
  (typeof window !== "undefined" && (window as any).__API_TOKEN__) ||
  "";

// ── Core Log function ──────────────────────────────────────────────────────────

/**
 * Sends a structured log entry to the evaluation service API.
 *
 * This is the ONLY logging mechanism to be used across the entire codebase.
 * Never use console.log, console.error, or any other built-in logger.
 *
 * @param stack    - "backend" or "frontend"
 * @param level    - log severity level
 * @param pkg      - the application package/layer originating the log
 * @param message  - human-readable description of the event
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: LogPackage,
  message: string
): Promise<void> {
  const payload: LogPayload = {
    stack,
    level,
    package: pkg,
    message,
  };

  // Write to stdout for local visibility (structured JSON, not console.log)
  process.stdout?.write(
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + "\n"
  );

  const token = getToken();
  if (!token) {
    // No token available — skip remote call but keep local output
    return;
  }

  try {
    const response = await fetch(LOG_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Fire-and-forget: write failure note without throwing
      process.stdout?.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          context: "LogMiddleware",
          message: `Remote log API returned ${response.status}`,
        }) + "\n"
      );
    }
  } catch (err: unknown) {
    // Network or fetch error — do not propagate; log locally
    const errorMsg = err instanceof Error ? err.message : String(err);
    process.stdout?.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        context: "LogMiddleware",
        message: `Failed to send log to remote API: ${errorMsg}`,
      }) + "\n"
    );
  }
}

export default Log;
