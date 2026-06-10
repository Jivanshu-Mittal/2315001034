/**
 * Frontend Logging Middleware
 * Browser-compatible implementation of the Log() function.
 * Uses the Fetch API (available in all modern browsers and Next.js server components).
 *
 * Import: import { Log } from "@/lib/logger";
 */

export type Stack = "backend" | "frontend";
export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type FrontendPackage =
  | "api" | "component" | "hook" | "page"
  | "state" | "style"
  | "auth" | "config" | "middleware" | "utils";

export type BackendPackage =
  | "cache" | "controller" | "cron_job" | "db" | "domain"
  | "handler" | "repository" | "route" | "service"
  | "auth" | "config" | "middleware" | "utils";

export type LogPackage = FrontendPackage | BackendPackage;

const LOG_API_URL = "http://4.224.186.213/evaluation-service/logs";

/**
 * Retrieves the auth token from the browser session/env.
 * In Next.js, this can be stored in sessionStorage after login.
 */
function getToken(): string {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("api_token") ?? "";
  }
  return process.env.NEXT_PUBLIC_API_TOKEN ?? "";
}

/**
 * Primary logging function — the ONLY way to emit logs in this application.
 * DO NOT use console.log, console.error, or any other built-in logging.
 *
 * @param stack   - "frontend" for UI code, "backend" for server/API code
 * @param level   - Severity level
 * @param pkg     - The application layer/package originating this log
 * @param message - A descriptive, human-readable message about the event
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: LogPackage,
  message: string
): Promise<void> {
  const payload = { stack, level, package: pkg, message };
  const token = getToken();

  // Skip remote call if no token is available yet (e.g. before auth)
  if (!token) return;

  try {
    await fetch(LOG_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      // Fire-and-forget: don't block UI for logging
      keepalive: true,
    });
  } catch {
    // Silently swallow logging errors — never crash the app due to logging
  }
}

export default Log;
