/**
 * Campus Notifications Microservice — Stage 1
 * Priority Inbox: TypeScript implementation using a fixed-size Min-Heap
 *
 * Priority Rules:
 *   1. Type weight: Placement (3) > Result (2) > Event (1)
 *   2. Recency: higher Unix timestamp = higher score within same type
 *
 * Algorithm: Min-Heap of size N
 *   - Insert cost:  O(log N)
 *   - Space:        O(N)
 *
 * Run:  npx ts-node notification_app_be/priorityInbox.ts [topN]
 *       (default N = 10)
 */

import * as http from "http";
import { Log } from "../logging_middleware/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Notification {
  ID: string;
  Type: "Placement" | "Result" | "Event";
  Message: string;
  Timestamp: string; // e.g. "2026-04-22 17:51:30"
}

interface HeapEntry {
  priority: number;
  notification: Notification;
}

// ── Configuration ──────────────────────────────────────────────────────────────

const CONFIG = {
  apiBaseUrl: "http://4.224.186.213",
  apiPath: "/evaluation-service/notifications",
  apiToken: process.env.API_TOKEN ?? "",
  topN: parseInt(process.argv[2] ?? "10", 10) || 10,
  pollIntervalMs: parseInt(process.env.POLL_MS ?? "10000", 10) || 10_000,
};

// ── Priority weights ───────────────────────────────────────────────────────────

const TYPE_WEIGHTS: Record<Notification["Type"], number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

/**
 * Computes a single numeric priority score.
 *
 * TYPE_SCALE (2 × 10⁹) is chosen to be greater than the max plausible
 * Unix timestamp (~1.7 × 10⁹ in 2026), so the type weight always dominates
 * and recency cleanly breaks ties within the same type.
 *
 * Time complexity: O(1)
 */
function getPriorityScore(notification: Notification): number {
  const TYPE_SCALE = 2_000_000_000;
  const weight = TYPE_WEIGHTS[notification.Type] ?? 0;
  const timestampSeconds = Math.floor(
    new Date(notification.Timestamp).getTime() / 1000
  );
  return weight * TYPE_SCALE + timestampSeconds;
}

// ── Min-Heap ───────────────────────────────────────────────────────────────────

/**
 * Fixed-size Min-Heap that tracks the top-N highest-priority notifications.
 *
 * The root is always the element with the LOWEST priority among the top-N,
 * allowing O(1) comparison for incoming candidates and O(log N) eviction.
 */
class MinHeap {
  private elements: HeapEntry[] = [];

  get size(): number {
    return this.elements.length;
  }

  peek(): HeapEntry | null {
    return this.elements[0] ?? null;
  }

  push(item: HeapEntry): void {
    this.elements.push(item);
    this.bubbleUp(this.elements.length - 1);
  }

  pop(): HeapEntry | null {
    if (this.elements.length === 0) return null;
    const minItem = this.elements[0]!;
    const lastItem = this.elements.pop()!;
    if (this.elements.length > 0) {
      this.elements[0] = lastItem;
      this.sinkDown(0);
    }
    return minItem;
  }

  getSortedList(): Notification[] {
    return [...this.elements]
      .sort((a, b) => b.priority - a.priority)
      .map((e) => e.notification);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.elements[parentIndex]!.priority <= this.elements[index]!.priority) break;
      this.swap(parentIndex, index);
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.elements.length;
    while (true) {
      let smallestIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < length && this.elements[leftChild]!.priority < this.elements[smallestIndex]!.priority)
        smallestIndex = leftChild;
      if (rightChild < length && this.elements[rightChild]!.priority < this.elements[smallestIndex]!.priority)
        smallestIndex = rightChild;

      if (smallestIndex === index) break;
      this.swap(index, smallestIndex);
      index = smallestIndex;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.elements[i]!;
    this.elements[i] = this.elements[j]!;
    this.elements[j] = temp;
  }
}

// ── Priority Inbox ─────────────────────────────────────────────────────────────

/**
 * PriorityInbox maintains only the top-N highest-priority notifications.
 *
 * Streaming update strategy (O(log N) per new notification):
 *   1. Compute score  → O(1)
 *   2. If heap not full → push directly  → O(log N)
 *   3. If new score > root score → evict root, insert new → O(log N)
 *   4. Otherwise → discard  → O(1)
 */
class PriorityInbox {
  private heap = new MinHeap();
  private seenIds = new Set<string>();

  constructor(private readonly topN: number) {}

  offer(notification: Notification): boolean {
    if (this.seenIds.has(notification.ID)) return false;

    const priority = getPriorityScore(notification);
    const entry: HeapEntry = { priority, notification };

    if (this.heap.size < this.topN) {
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      Log("backend", "info", "service", `Notification accepted: ID=${notification.ID} Type=${notification.Type}`);
      return true;
    }

    const minEntry = this.heap.peek()!;
    if (priority > minEntry.priority) {
      this.seenIds.delete(minEntry.notification.ID);
      this.heap.pop();
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      Log("backend", "info", "service", `Evicted ID=${minEntry.notification.ID} → inserted ID=${notification.ID} (${notification.Type})`);
      return true;
    }

    return false;
  }

  loadBatch(notifications: Notification[]): void {
    let inserted = 0;
    for (const n of notifications) {
      if (this.offer(n)) inserted++;
    }
    Log("backend", "info", "service", `Batch processed: total=${notifications.length} inserted=${inserted}`);
  }

  getTopNotifications(): Notification[] {
    return this.heap.getSortedList();
  }
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

function fetchNotifications(): Promise<Notification[]> {
  return new Promise((resolve, reject) => {
    Log("backend", "info", "service", "Requesting notifications from external API");

    const url = new URL(CONFIG.apiBaseUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: CONFIG.apiPath,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(CONFIG.apiToken ? { Authorization: `Bearer ${CONFIG.apiToken}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      Log("backend", "info", "service", `API response status: ${res.statusCode}`);
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const body = JSON.parse(data) as { notifications: Notification[] };
            resolve(body.notifications ?? []);
          } catch (err) {
            Log("backend", "error", "service", `JSON parse error: ${(err as Error).message}`);
            reject(err);
          }
        } else {
          Log("backend", "warn", "service", `Non-200 status received: ${res.statusCode}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err: Error) => {
      Log("backend", "error", "service", `Connection error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(8000, () => {
      Log("backend", "error", "service", "Request timed out after 8 seconds");
      req.destroy(new Error("Timeout"));
    });

    req.end();
  });
}

// ── Display ────────────────────────────────────────────────────────────────────

function renderTable(notifications: Notification[], limit: number): void {
  const line = "═".repeat(75);
  const thin = "─".repeat(75);
  process.stdout.write(`\n${line}\n`);
  process.stdout.write(`  🏆  TOP ${limit} NOTIFICATIONS\n`);
  process.stdout.write(`  📅  ${new Date().toLocaleString()}\n`);
  process.stdout.write(`${line}\n`);
  process.stdout.write(`  ${"RANK".padEnd(6)} ${"TYPE".padEnd(12)} ${"TIMESTAMP".padEnd(22)} MESSAGE\n`);
  process.stdout.write(`${thin}\n`);
  notifications.forEach((n, i) => {
    process.stdout.write(
      `  ${ `#${i + 1}`.padEnd(6)} ${n.Type.padEnd(12)} ${n.Timestamp.padEnd(22)} ${n.Message}\n`
    );
  });
  process.stdout.write(`${line}\n\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function startApp(): Promise<void> {
  Log("backend", "info", "service", `Priority Inbox App started — topN=${CONFIG.topN}`);
  const inbox = new PriorityInbox(CONFIG.topN);

  async function poll(): Promise<void> {
    try {
      const data = await fetchNotifications();
      inbox.loadBatch(data);
      renderTable(inbox.getTopNotifications(), CONFIG.topN);
    } catch (err) {
      Log("backend", "error", "service", `Poll cycle failed: ${(err as Error).message}`);
    }
  }

  await poll();
  Log("backend", "info", "cron_job", `Polling every ${CONFIG.pollIntervalMs}ms`);
  setInterval(poll, CONFIG.pollIntervalMs);
}

startApp().catch((err: Error) => {
  Log("backend", "fatal", "service", `Process crashed: ${err.message}`);
  process.exit(1);
});
