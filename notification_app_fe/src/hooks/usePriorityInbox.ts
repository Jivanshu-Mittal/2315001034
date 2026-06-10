/**
 * usePriorityInbox — Custom React hook implementing the Min-Heap priority
 * algorithm on the frontend to surface the top-N most important notifications.
 *
 * Priority: Placement (3) > Result (2) > Event (1), then Recency.
 * Data structure: Fixed-size Min-Heap, O(log N) per insertion.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchNotifications, Notification } from "@/lib/api";
import { Log } from "@/lib/logger";

// ── Type weights ───────────────────────────────────────────────────────────────
const TYPE_WEIGHTS: Record<Notification["Type"], number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function getPriorityScore(notification: Notification): number {
  const weight = TYPE_WEIGHTS[notification.Type] ?? 0;
  const seconds = Math.floor(new Date(notification.Timestamp).getTime() / 1000);
  return weight * 2_000_000_000 + seconds;
}

// ── Min-Heap ───────────────────────────────────────────────────────────────────
interface HeapEntry {
  priority: number;
  notification: Notification;
}

class MinHeap {
  private elements: HeapEntry[] = [];

  get size(): number { return this.elements.length; }
  peek(): HeapEntry | null { return this.elements[0] ?? null; }

  push(item: HeapEntry): void {
    this.elements.push(item);
    this.bubbleUp(this.elements.length - 1);
  }

  pop(): HeapEntry | null {
    if (!this.elements.length) return null;
    const top = this.elements[0]!;
    const last = this.elements.pop()!;
    if (this.elements.length) { this.elements[0] = last; this.sinkDown(0); }
    return top;
  }

  getSorted(): Notification[] {
    return [...this.elements]
      .sort((a, b) => b.priority - a.priority)
      .map((e) => e.notification);
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.elements[p]!.priority <= this.elements[i]!.priority) break;
      [this.elements[p], this.elements[i]] = [this.elements[i]!, this.elements[p]!];
      i = p;
    }
  }

  private sinkDown(i: number): void {
    const n = this.elements.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.elements[l]!.priority < this.elements[s]!.priority) s = l;
      if (r < n && this.elements[r]!.priority < this.elements[s]!.priority) s = r;
      if (s === i) break;
      [this.elements[i], this.elements[s]] = [this.elements[s]!, this.elements[i]!];
      i = s;
    }
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export interface UsePriorityInboxResult {
  topNotifications: Notification[];
  readIds: Set<string>;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => void;
  refetch: () => void;
}

export function usePriorityInbox(topN = 10): UsePriorityInboxResult {
  const [topNotifications, setTopNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Log("frontend", "debug", "hook", `usePriorityInbox: fetching for top ${topN}`);
      const data = await fetchNotifications({ limit: 100 });

      // Build priority inbox using Min-Heap
      const heap = new MinHeap();
      const seenIds = new Set<string>();

      for (const notification of data) {
        if (seenIds.has(notification.ID)) continue;
        const priority = getPriorityScore(notification);

        if (heap.size < topN) {
          heap.push({ priority, notification });
          seenIds.add(notification.ID);
        } else {
          const min = heap.peek()!;
          if (priority > min.priority) {
            seenIds.delete(min.notification.ID);
            heap.pop();
            heap.push({ priority, notification });
            seenIds.add(notification.ID);
          }
        }
      }

      const sorted = heap.getSorted();
      setTopNotifications(sorted);
      await Log("frontend", "info", "hook", `usePriorityInbox: top ${sorted.length} notifications ranked`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to build priority inbox";
      setError(message);
      await Log("frontend", "error", "hook", `usePriorityInbox failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [topN]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void Log("frontend", "debug", "hook", `usePriorityInbox: marked ${id} as read`);
  }, []);

  return { topNotifications, readIds, loading, error, markAsRead, refetch: load };
}
