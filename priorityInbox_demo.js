/**
 * ============================================================
 *  Campus Notifications Microservice — Stage 1
 *  DEMO runner using sample data from the Notification API spec
 * ============================================================
 *
 *  Usage:  node priorityInbox_demo.js [topN]
 *
 *  This file uses the exact notification payloads shown in the
 *  evaluation task image to demonstrate the Priority Inbox
 *  algorithm without requiring an API token.
 * ============================================================
 */

"use strict";

// ─── Inline Logger (Logging Middleware) ───────────────────────────────────────
const Logger = (() => {
  const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const LABELS = ["DEBUG", "INFO ", "WARN ", "ERROR"];
  let minLevel = LEVELS.INFO;

  function _log(level, context, message, meta) {
    if (level < minLevel) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level: LABELS[level],
      context,
      message,
      ...(meta !== undefined ? { meta } : {}),
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (ctx, msg, meta) => _log(LEVELS.DEBUG, ctx, msg, meta),
    info:  (ctx, msg, meta) => _log(LEVELS.INFO,  ctx, msg, meta),
    warn:  (ctx, msg, meta) => _log(LEVELS.WARN,  ctx, msg, meta),
    error: (ctx, msg, meta) => _log(LEVELS.ERROR, ctx, msg, meta),
  };
})();

// ─── Sample data from the evaluation task spec ────────────────────────────────
const SAMPLE_NOTIFICATIONS = [
  { ID: "d146095a-0d86-4a34-9e69-3900a14576bc", Type: "Result",    Message: "mid-sem",                       Timestamp: "2026-04-22 17:51:30" },
  { ID: "b283218f-ea5a-4b7c-93a9-1f2f240d64b0", Type: "Placement", Message: "CSX Corporation hiring",        Timestamp: "2026-04-22 17:51:18" },
  { ID: "81589ada-0ad3-4f77-9554-f52fb558e09d", Type: "Event",     Message: "farewell",                      Timestamp: "2026-04-22 17:51:06" },
  { ID: "0005513a-142b-4bbc-8678-eefec65e1ede", Type: "Result",    Message: "mid-sem",                       Timestamp: "2026-04-22 17:50:54" },
  { ID: "ea836726-c25e-4f21-a72f-544a6af8a37f", Type: "Result",    Message: "project-review",                Timestamp: "2026-04-22 17:50:42" },
  { ID: "003cb427-8fc6-47f7-bb00-be228f6b0d2c", Type: "Result",    Message: "external",                      Timestamp: "2026-04-22 17:50:30" },
  { ID: "e5c4ff20-31bf-4d40-8f02-72fda59e8918", Type: "Result",    Message: "project-review",                Timestamp: "2026-04-22 17:50:18" },
  { ID: "1cfce5ee-ad37-4894-8946-d707627176a5", Type: "Event",     Message: "tech-fest",                     Timestamp: "2026-04-22 17:50:06" },
  { ID: "cf2885a6-45ac-4ba0-b548-6e9e9d4c52c8", Type: "Result",    Message: "project-review",                Timestamp: "2026-04-22 17:49:54" },
  { ID: "8a7412bd-6065-4d09-8501-a37f11cc848b", Type: "Placement", Message: "Advanced Micro Devices Inc. hiring", Timestamp: "2026-04-22 17:49:42" },
  // Extra simulated notifications to show heap eviction
  { ID: "aaaa0001-0000-0000-0000-000000000001", Type: "Event",     Message: "sports-day",                    Timestamp: "2026-04-22 17:48:00" },
  { ID: "aaaa0002-0000-0000-0000-000000000002", Type: "Event",     Message: "cultural-night",                Timestamp: "2026-04-22 17:47:00" },
  { ID: "aaaa0003-0000-0000-0000-000000000003", Type: "Result",    Message: "end-sem",                       Timestamp: "2026-04-22 17:46:00" },
  { ID: "aaaa0004-0000-0000-0000-000000000004", Type: "Placement", Message: "Google hiring",                 Timestamp: "2026-04-22 17:45:00" },
  { ID: "aaaa0005-0000-0000-0000-000000000005", Type: "Placement", Message: "Microsoft hiring",              Timestamp: "2026-04-22 17:44:00" },
];

// ─── Type Priority Weights ─────────────────────────────────────────────────────
const TYPE_WEIGHTS = { Placement: 3, Result: 2, Event: 1 };
const TYPE_SCALE   = 2_000_000_000; // Guarantees type always dominates recency

function computePriorityScore(notification) {
  const weight          = TYPE_WEIGHTS[notification.Type] ?? 0;
  const recencySeconds  = Math.floor(new Date(notification.Timestamp).getTime() / 1000);
  const score           = weight * TYPE_SCALE + recencySeconds;

  Logger.debug("Score", `${notification.ID.slice(0, 8)} → score=${score}`, {
    type: notification.Type, weight, recencySeconds,
  });

  return score;
}

// ─── Min-Heap ──────────────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this.heap = []; }
  get size() { return this.heap.length; }
  peek()  { return this.heap[0] ?? null; }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (!this.heap.length) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length) { this.heap[0] = last; this._sinkDown(0); }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p].priority <= this.heap[i].priority) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.heap[l].priority < this.heap[s].priority) s = l;
      if (r < n && this.heap[r].priority < this.heap[s].priority) s = r;
      if (s === i) break;
      [this.heap[s], this.heap[i]] = [this.heap[i], this.heap[s]];
      i = s;
    }
  }

  toSortedArray() {
    return [...this.heap].sort((a, b) => b.priority - a.priority).map(e => e.notification);
  }
}

// ─── Priority Inbox ────────────────────────────────────────────────────────────
class PriorityInbox {
  constructor(topN) {
    this.topN    = topN;
    this.heap    = new MinHeap();
    this.seenIds = new Set();
    Logger.info("PriorityInbox", `Initialised`, { topN });
  }

  offer(notification) {
    if (this.seenIds.has(notification.ID)) {
      Logger.debug("PriorityInbox", "Duplicate skipped", { id: notification.ID });
      return false;
    }

    const priority = computePriorityScore(notification);
    const entry    = { priority, notification };

    if (this.heap.size < this.topN) {
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      Logger.info("PriorityInbox", "Accepted (heap not full)", {
        id: notification.ID, type: notification.Type,
        message: notification.Message, priority, heapSize: this.heap.size,
      });
      return true;
    }

    const minEntry = this.heap.peek();
    if (priority > minEntry.priority) {
      Logger.info("PriorityInbox", "Evicting → accepting higher-priority notification", {
        evicted: { id: minEntry.notification.ID, type: minEntry.notification.Type },
        incoming: { id: notification.ID, type: notification.Type, message: notification.Message },
      });
      this.seenIds.delete(minEntry.notification.ID);
      this.heap.pop();
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      return true;
    }

    Logger.info("PriorityInbox", "Rejected (below heap minimum)", {
      id: notification.ID, type: notification.Type, priority,
      currentMin: minEntry.priority,
    });
    return false;
  }

  loadBatch(notifications) {
    Logger.info("PriorityInbox", `Loading batch`, { count: notifications.length });
    let accepted = 0;
    for (const n of notifications) { if (this.offer(n)) accepted++; }
    Logger.info("PriorityInbox", "Batch complete", {
      total: notifications.length, accepted, rejected: notifications.length - accepted,
    });
  }

  getTopNotifications() { return this.heap.toSortedArray(); }
}

// ─── Display ───────────────────────────────────────────────────────────────────
function displayResults(topN, notifications) {
  const LINE = "═".repeat(76);
  const line = "─".repeat(76);

  process.stdout.write(`\n${LINE}\n`);
  process.stdout.write(`  🏆  TOP ${topN} PRIORITY NOTIFICATIONS\n`);
  process.stdout.write(`  📅  Generated at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n`);
  process.stdout.write(`${LINE}\n`);
  process.stdout.write(
    `  ${"RANK".padEnd(5)} ${"TYPE".padEnd(12)} ${"TIMESTAMP".padEnd(22)} MESSAGE\n`
  );
  process.stdout.write(`${line}\n`);

  notifications.forEach((n, i) => {
    const rank  = `#${i + 1}`.padEnd(5);
    const type  = (n.Type || "").padEnd(12);
    const ts    = (n.Timestamp || "").padEnd(22);
    const msg   = n.Message || "";
    const icon  = n.Type === "Placement" ? "💼" : n.Type === "Result" ? "📊" : "🎉";
    process.stdout.write(`  ${rank} ${icon} ${type} ${ts} ${msg}\n`);
  });

  process.stdout.write(`${LINE}\n\n`);
}

// ─── Simulate new notifications arriving ──────────────────────────────────────
function simulateStream(inbox, newBatch, delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      Logger.info("Stream", `New notifications arrived`, { count: newBatch.length });
      inbox.loadBatch(newBatch);
      resolve();
    }, delayMs);
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const TOP_N = parseInt(process.argv[2], 10) || 10;

  Logger.info("Main", "=== Campus Priority Inbox — Stage 1 DEMO ===", { topN: TOP_N });

  const inbox = new PriorityInbox(TOP_N);

  // ── Round 1: Initial API response (first 10 notifications from spec) ─────────
  Logger.info("Main", "── Round 1: Initial batch from API ──");
  inbox.loadBatch(SAMPLE_NOTIFICATIONS.slice(0, 10));

  process.stdout.write("\n>>> AFTER INITIAL BATCH (10 notifications from API)\n");
  displayResults(TOP_N, inbox.getTopNotifications());

  // ── Round 2: More notifications arrive (simulate streaming) ──────────────────
  const INCOMING = [
    { ID: "new-0001", Type: "Placement", Message: "Amazon hiring — SDE1",  Timestamp: "2026-04-22 17:53:00" },
    { ID: "new-0002", Type: "Event",     Message: "alumni-meet",            Timestamp: "2026-04-22 17:52:00" },
    { ID: "new-0003", Type: "Result",    Message: "hackathon-result",       Timestamp: "2026-04-22 17:54:00" },
  ];

  await simulateStream(inbox, INCOMING, 100);

  process.stdout.write(">>> AFTER STREAMING UPDATE (3 new notifications arrived)\n");
  displayResults(TOP_N, inbox.getTopNotifications());

  Logger.info("Main", "Demo complete ✓");
}

main().catch((err) => {
  Logger.error("Main", "Fatal error", { error: err.message });
  process.exit(1);
});
