/**
 * ============================================================
 *  Campus Notifications Microservice — Stage 1
 *  Priority Inbox: Top-N Unread Notifications
 * ============================================================
 *
 *  Priority is determined by:
 *    1. Type Weight  : Placement (3) > Result (2) > Event (1)
 *    2. Recency      : More recent timestamp → higher priority
 *
 *  Data structure  : Min-Heap of fixed size N
 *  Insertion cost  : O(log N) per notification
 *  Space           : O(N)
 *
 *  Usage:
 *    node priorityInbox.js [topN]          (default N = 10)
 *    node priorityInbox.js 15              (show top 15)
 *
 *  Environment variables:
 *    API_TOKEN   — Bearer token for the protected notification API
 *    POLL_MS     — Polling interval in milliseconds (default 10000)
 * ============================================================
 */

"use strict";

const http = require("http");

// ─── Logger (Logging Middleware) ──────────────────────────────────────────────
const Logger = (() => {
  const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const LABELS = ["DEBUG", "INFO ", "WARN ", "ERROR"];

  let minLevel = LEVELS.DEBUG;

  function _timestamp() {
    return new Date().toISOString();
  }

  function _log(level, context, message, meta) {
    if (level < minLevel) return;
    const entry = {
      timestamp: _timestamp(),
      level: LABELS[level],
      context,
      message,
      ...(meta !== undefined ? { meta } : {}),
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    setLevel: (level) => { minLevel = LEVELS[level] ?? LEVELS.DEBUG; },
    debug: (ctx, msg, meta) => _log(LEVELS.DEBUG, ctx, msg, meta),
    info:  (ctx, msg, meta) => _log(LEVELS.INFO,  ctx, msg, meta),
    warn:  (ctx, msg, meta) => _log(LEVELS.WARN,  ctx, msg, meta),
    error: (ctx, msg, meta) => _log(LEVELS.ERROR, ctx, msg, meta),
  };
})();

// ─── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
  API_BASE_URL : "http://4.224.186.213",
  API_PATH     : "/evaluation-service/notifications",
  API_TOKEN    : process.env.API_TOKEN || "",
  TOP_N        : parseInt(process.argv[2], 10) || 10,
  POLL_MS      : parseInt(process.env.POLL_MS, 10) || 10_000,
};

Logger.info("Config", "Loaded configuration", {
  topN: CONFIG.TOP_N,
  pollIntervalMs: CONFIG.POLL_MS,
  hasToken: CONFIG.API_TOKEN.length > 0,
});

// ─── Type Priority Weights ──────────────────────────────────────────────────────
const TYPE_WEIGHTS = {
  Placement : 3,
  Result    : 2,
  Event     : 1,
};

/**
 * Compute a numeric priority score for a notification.
 *
 * Formula:
 *   score = typeWeight * TYPE_SCALE + timestampSeconds
 *
 *   TYPE_SCALE is chosen so that the lowest-weight type difference (1 point)
 *   always outweighs a recency difference of up to ~31 years of seconds
 *   (≈ 10^9 s), guaranteeing type always dominates, while Unix seconds
 *   cleanly break ties within the same type.
 *
 * @param {{ Type: string, Timestamp: string }} notification
 * @returns {number}
 */
function computePriorityScore(notification) {
  const TYPE_SCALE = 2_000_000_000; // > max plausible Unix timestamp
  const weight = TYPE_WEIGHTS[notification.Type] ?? 0;
  const recencySeconds = Math.floor(
    new Date(notification.Timestamp).getTime() / 1000
  );

  const score = weight * TYPE_SCALE + recencySeconds;

  Logger.debug("Score", `Computed score for ${notification.ID}`, {
    type: notification.Type,
    weight,
    recencySeconds,
    score,
  });

  return score;
}

// ─── Min-Heap ──────────────────────────────────────────────────────────────────
/**
 * MinHeap<T> where T has a numeric `.priority` field.
 * Maintains the N highest-priority items seen so far.
 *
 * Invariant: heap[0] is always the item with the LOWEST priority,
 * making it cheap to decide whether a new arrival displaces it.
 */
class MinHeap {
  constructor() {
    /** @type {Array<{priority: number, notification: object}>} */
    this.heap = [];
  }

  get size() { return this.heap.length; }

  /** Cheaply read the current minimum (the item most likely to be evicted). */
  peek() { return this.heap[0] ?? null; }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
    Logger.debug("MinHeap", "Pushed item", { heapSize: this.heap.length, priority: item.priority });
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    Logger.debug("MinHeap", "Popped minimum item", { priority: top.priority });
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.heap[l].priority < this.heap[smallest].priority) smallest = l;
      if (r < n && this.heap[r].priority < this.heap[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }

  /** Return items sorted highest-priority first (non-destructive). */
  toSortedArray() {
    return [...this.heap]
      .sort((a, b) => b.priority - a.priority)
      .map((e) => e.notification);
  }
}

// ─── Priority Inbox ────────────────────────────────────────────────────────────
/**
 * PriorityInbox keeps only the top-N highest-priority unread notifications.
 *
 * Efficient streaming update strategy:
 *   - Every new notification is scored in O(1).
 *   - If heap has fewer than N items  → push unconditionally  O(log N).
 *   - If new score > heap minimum     → replace root, sinkDown O(log N).
 *   - Otherwise                       → discard               O(1).
 *
 * This means we never need to sort or scan the full list for each new item.
 */
class PriorityInbox {
  /**
   * @param {number} topN   Maximum number of notifications to keep.
   */
  constructor(topN) {
    this.topN = topN;
    this.heap = new MinHeap();
    /** Track IDs already in the heap to avoid duplicates. */
    this.seenIds = new Set();

    Logger.info("PriorityInbox", `Initialised with topN=${topN}`);
  }

  /**
   * Offer a notification to the inbox.
   * Returns true if the notification made it into the top-N.
   *
   * @param {object} notification
   */
  offer(notification) {
    if (this.seenIds.has(notification.ID)) {
      Logger.debug("PriorityInbox", "Duplicate notification skipped", { id: notification.ID });
      return false;
    }

    const priority = computePriorityScore(notification);
    const entry = { priority, notification };

    if (this.heap.size < this.topN) {
      // Heap not full yet — always accept.
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      Logger.info("PriorityInbox", "Notification accepted (heap not full)", {
        id: notification.ID,
        type: notification.Type,
        priority,
        heapSize: this.heap.size,
      });
      return true;
    }

    const minEntry = this.heap.peek();
    if (priority > minEntry.priority) {
      // New item is better than current worst — evict worst, add new.
      Logger.info("PriorityInbox", "Evicting low-priority notification", {
        evictedId: minEntry.notification.ID,
        evictedPriority: minEntry.priority,
        incomingId: notification.ID,
        incomingPriority: priority,
      });
      this.seenIds.delete(minEntry.notification.ID);
      this.heap.pop();
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      return true;
    }

    Logger.debug("PriorityInbox", "Notification rejected (below threshold)", {
      id: notification.ID,
      priority,
      currentMin: minEntry.priority,
    });
    return false;
  }

  /**
   * Bulk-load an array of notifications.
   * @param {object[]} notifications
   */
  loadBatch(notifications) {
    Logger.info("PriorityInbox", `Loading batch of ${notifications.length} notifications`);
    let accepted = 0;
    for (const n of notifications) {
      if (this.offer(n)) accepted++;
    }
    Logger.info("PriorityInbox", `Batch loaded`, {
      total: notifications.length,
      accepted,
      rejected: notifications.length - accepted,
    });
  }

  /**
   * Return the top-N notifications sorted highest-priority first.
   * @returns {object[]}
   */
  getTopNotifications() {
    return this.heap.toSortedArray();
  }
}

// ─── HTTP Client ───────────────────────────────────────────────────────────────
/**
 * Fetch notifications from the protected API.
 * @returns {Promise<object[]>}
 */
function fetchNotifications() {
  return new Promise((resolve, reject) => {
    Logger.info("HTTP", "Fetching notifications from API", { url: CONFIG.API_BASE_URL + CONFIG.API_PATH });

    const options = {
      hostname : new URL(CONFIG.API_BASE_URL).hostname,
      port     : 80,
      path     : CONFIG.API_PATH,
      method   : "GET",
      headers  : {
        "Content-Type"  : "application/json",
        "Accept"        : "application/json",
        ...(CONFIG.API_TOKEN
          ? { Authorization: `Bearer ${CONFIG.API_TOKEN}` }
          : {}),
      },
    };

    const req = http.request(options, (res) => {
      Logger.info("HTTP", `Response received`, { statusCode: res.statusCode });

      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const body = JSON.parse(raw);
            const notifications = body.notifications ?? [];
            Logger.info("HTTP", `Parsed ${notifications.length} notifications from response`);
            resolve(notifications);
          } catch (err) {
            Logger.error("HTTP", "JSON parse error", { error: err.message, raw: raw.slice(0, 200) });
            reject(err);
          }
        } else {
          Logger.warn("HTTP", "Non-200 response", { statusCode: res.statusCode, body: raw.slice(0, 200) });
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => {
      Logger.error("HTTP", "Request failed", { error: err.message });
      reject(err);
    });

    req.setTimeout(8000, () => {
      Logger.error("HTTP", "Request timed out");
      req.destroy(new Error("Request timed out"));
    });

    req.end();
  });
}

// ─── Display ───────────────────────────────────────────────────────────────────
function displayTopNotifications(notifications, topN) {
  const divider = "─".repeat(72);
  const header  = `  TOP ${topN} PRIORITY NOTIFICATIONS  [${new Date().toLocaleString()}]`;

  process.stdout.write(`\n${divider}\n${header}\n${divider}\n`);

  if (notifications.length === 0) {
    process.stdout.write("  (no notifications available)\n");
  } else {
    notifications.forEach((n, idx) => {
      const rank   = String(idx + 1).padStart(2, " ");
      const type   = (n.Type || "Unknown").padEnd(10, " ");
      const ts     = n.Timestamp || "N/A";
      const msg    = n.Message || "";
      process.stdout.write(`  ${rank}. [${type}] ${ts}  |  ${msg}\n`);
    });
  }

  process.stdout.write(`${divider}\n\n`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  Logger.info("Main", "=== Campus Priority Inbox — Stage 1 ===");

  const inbox = new PriorityInbox(CONFIG.TOP_N);

  /**
   * Poll cycle: fetch → offer each notification → display top-N.
   */
  async function pollCycle() {
    try {
      const notifications = await fetchNotifications();
      inbox.loadBatch(notifications);
      const top = inbox.getTopNotifications();
      displayTopNotifications(top, CONFIG.TOP_N);
      Logger.info("Poll", `Cycle complete`, { heapSize: inbox.heap.size, topN: CONFIG.TOP_N });
    } catch (err) {
      Logger.error("Poll", "Cycle failed", { error: err.message });
    }
  }

  // Initial fetch
  await pollCycle();

  // Subsequent polls to handle newly arriving notifications efficiently.
  // The heap update is O(log N) per new notification — no full re-sort needed.
  Logger.info("Main", `Polling every ${CONFIG.POLL_MS} ms for new notifications…`);
  setInterval(pollCycle, CONFIG.POLL_MS);
}

main().catch((err) => {
  Logger.error("Main", "Fatal error", { error: err.message, stack: err.stack });
  process.exit(1);
});
