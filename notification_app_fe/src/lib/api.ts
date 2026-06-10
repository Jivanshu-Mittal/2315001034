/**
 * API Client — Typed fetch utilities for the notification evaluation service.
 * All errors are logged via Log() before being re-thrown.
 *
 * Base URL: http://4.224.186.213/evaluation-service
 *
 * Endpoints used:
 *   GET  /notifications          - All notifications (paginated + filtered)
 *   POST /auth                   - Obtain Bearer token
 */

import { Log } from "@/lib/logger";

const BASE_URL = "http://4.224.186.213/evaluation-service";

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotificationType = "Placement" | "Result" | "Event";

export interface Notification {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string; // "YYYY-MM-DD HH:mm:ss"
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface FetchNotificationsParams {
  limit?: number;
  page?: number;
  notification_type?: NotificationType;
}

export interface AuthCredentials {
  email: string;
  name: string;
  rollNo: string;
  accessCode: string;
  clientID: string;
  clientSecret: string;
}

export interface AuthResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
}

// ── Auth helper ────────────────────────────────────────────────────────────────

function getStoredToken(): string {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("api_token") ?? "";
  }
  return process.env.NEXT_PUBLIC_API_TOKEN ?? "";
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── API Functions ──────────────────────────────────────────────────────────────

/**
 * Fetches notifications from the protected API with optional filters.
 * Supports pagination and type filtering via query parameters.
 */
export async function fetchNotifications(
  params: FetchNotificationsParams = {}
): Promise<Notification[]> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.notification_type) query.set("notification_type", params.notification_type);

  const url = `${BASE_URL}/notifications${query.toString() ? `?${query}` : ""}`;

  await Log("frontend", "info", "api", `Fetching notifications: ${url}`);

  try {
    const res = await fetch(url, { headers: authHeaders() });

    if (!res.ok) {
      await Log("frontend", "warn", "api", `Notifications API returned ${res.status}`);
      throw new Error(`HTTP ${res.status}: Failed to fetch notifications`);
    }

    const data: NotificationsResponse = await res.json();
    await Log("frontend", "info", "api", `Fetched ${data.notifications?.length ?? 0} notifications`);
    return data.notifications ?? [];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("frontend", "error", "api", `fetchNotifications failed: ${message}`);
    throw err;
  }
}

/**
 * Authenticates against the evaluation service and returns a Bearer token.
 * The token is stored in sessionStorage for subsequent requests.
 */
export async function authenticate(
  credentials: AuthCredentials
): Promise<string> {
  await Log("frontend", "info", "auth", "Authenticating with evaluation service");

  try {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      await Log("frontend", "error", "auth", `Auth API returned ${res.status}`);
      throw new Error(`Authentication failed: HTTP ${res.status}`);
    }

    const data: AuthResponse = await res.json();
    const token = data.access_token;

    if (typeof window !== "undefined") {
      sessionStorage.setItem("api_token", token);
    }

    await Log("frontend", "info", "auth", "Authentication successful — token stored");
    return token;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("frontend", "error", "auth", `authenticate failed: ${message}`);
    throw err;
  }
}
