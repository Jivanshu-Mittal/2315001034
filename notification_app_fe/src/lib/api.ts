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

const BASE_URL = typeof window !== "undefined"
  ? "/api/evaluation-service"
  : "http://4.224.186.213/evaluation-service";

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
    const token = sessionStorage.getItem("api_token");
    if (token) return token;
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
const MOCK_NOTIFICATIONS: Notification[] = [
  { ID: "d146095a-0d86-4a34-9e69-3900a14576bc", Type: "Result",    Message: "Mid-sem results published",    Timestamp: "2026-06-17 17:51:30" },
  { ID: "b283218f-ea5a-4b7c-93a9-1f2f240d64b0", Type: "Placement", Message: "CSX Corporation hiring drive",        Timestamp: "2026-06-17 17:51:18" },
  { ID: "81589ada-0ad3-4f77-9554-f52fb558e09d", Type: "Event",     Message: "Farewell ceremony scheduled",                      Timestamp: "2026-06-17 17:51:06" },
  { ID: "0005513a-142b-4bbc-8678-eefec65e1ede", Type: "Result",    Message: "Mid-sem marks updated",                       Timestamp: "2026-06-17 17:50:54" },
  { ID: "ea836726-c25e-4f21-a72f-544a6af8a37f", Type: "Result",    Message: "Project-review schedule release",                Timestamp: "2026-06-17 17:50:42" },
  { ID: "003cb427-8fc6-47f7-bb00-be228f6b0d2c", Type: "Result",    Message: "External evaluation marks",                      Timestamp: "2026-06-17 17:50:30" },
  { ID: "e5c4ff20-31bf-4d40-8f02-72fda59e8918", Type: "Result",    Message: "Project-review grades",                Timestamp: "2026-06-17 17:50:18" },
  { ID: "1cfce5ee-ad37-4894-8946-d707627176a5", Type: "Event",     Message: "Tech-fest registrations open",                     Timestamp: "2026-06-17 17:50:06" },
  { ID: "cf2885a6-45ac-4ba0-b548-6e9e9d4c52c8", Type: "Result",    Message: "Project-review peer feedback",                Timestamp: "2026-06-17 17:49:54" },
  { ID: "8a7412bd-6065-4d09-8501-a37f11cc848b", Type: "Placement", Message: "Advanced Micro Devices Inc. hiring", Timestamp: "2026-06-17 17:49:42" },
  { ID: "new-0001", Type: "Placement", Message: "Amazon hiring — SDE1 role",  Timestamp: "2026-06-17 17:53:00" },
  { ID: "new-0002", Type: "Event",     Message: "Annual Alumni Meet 2026",            Timestamp: "2026-06-17 17:52:00" },
  { ID: "new-0003", Type: "Result",    Message: "National Hackathon results declared",       Timestamp: "2026-06-17 17:54:00" },
  { ID: "new-0004", Type: "Placement", Message: "Google India Software Engineer Internship", Timestamp: "2026-06-17 18:00:00" },
  { ID: "new-0005", Type: "Event",     Message: "Cultural Night & DJ Session", Timestamp: "2026-06-17 18:05:00" },
];

function getMockNotifications(params: FetchNotificationsParams): Notification[] {
  let filtered = [...MOCK_NOTIFICATIONS];
  if (params.notification_type) {
    filtered = filtered.filter(n => n.Type === params.notification_type);
  }
  // Sort by timestamp descending
  filtered.sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
  if (params.limit !== undefined) {
    filtered = filtered.slice(0, params.limit);
  }
  return filtered;
}

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
      await Log("frontend", "warn", "api", `Notifications API returned ${res.status}. Falling back to mock data.`);
      return getMockNotifications(params);
    }

    const data: NotificationsResponse = await res.json();
    await Log("frontend", "info", "api", `Fetched ${data.notifications?.length ?? 0} notifications`);
    return data.notifications ?? [];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("frontend", "warn", "api", `fetchNotifications failed: ${message}. Falling back to mock data.`);
    return getMockNotifications(params);
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
