/**
 * useNotifications — Custom React hook for fetching all notifications.
 *
 * Features:
 *   - Fetches with optional limit, page, and type filters
 *   - Tracks read/unread state per notification ID
 *   - Exposes loading, error, and empty states
 *   - Uses Log() for all observability (no console.log)
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchNotifications, Notification, FetchNotificationsParams } from "@/lib/api";
import { Log } from "@/lib/logger";

export interface UseNotificationsResult {
  notifications: Notification[];
  readIds: Set<string>;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refetch: () => void;
}

export function useNotifications(
  params: FetchNotificationsParams = {}
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Log("frontend", "debug", "hook", "useNotifications: starting fetch");
      const data = await fetchNotifications(params);
      setNotifications(data);
      await Log("frontend", "info", "hook", `useNotifications: received ${data.length} items`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load notifications";
      setError(message);
      await Log("frontend", "error", "hook", `useNotifications: fetch failed — ${message}`);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.limit, params.page, params.notification_type]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void Log("frontend", "debug", "hook", `useNotifications: marked ${id} as read`);
  }, []);

  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.ID));
      return next;
    });
    void Log("frontend", "info", "hook", "useNotifications: marked all as read");
  }, [notifications]);

  return {
    notifications,
    readIds,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refetch: load,
  };
}
