"use strict";

const http = require("http");

// Simple structured logging utility
const logger = {
  debug(context, message, meta) {
    this._log("DEBUG", context, message, meta);
  },
  info(context, message, meta) {
    this._log("INFO", context, message, meta);
  },
  warn(context, message, meta) {
    this._log("WARN", context, message, meta);
  },
  error(context, message, meta) {
    this._log("ERROR", context, message, meta);
  },
  _log(level, context, message, meta) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...(meta ? { meta } : {})
    };
    process.stdout.write(JSON.stringify(logEntry) + "\n");
  }
};

// Configuration defaults
const CONFIG = {
  apiBaseUrl: "http://4.224.186.213",
  apiPath: "/evaluation-service/notifications",
  apiToken: process.env.API_TOKEN || "",
  topN: parseInt(process.argv[2], 10) || 10,
  pollIntervalMs: parseInt(process.env.POLL_MS, 10) || 10000,
};

logger.info("Config", "Loaded system configuration", {
  topN: CONFIG.topN,
  pollIntervalMs: CONFIG.pollIntervalMs,
  hasToken: !!CONFIG.apiToken
});

const TYPE_WEIGHTS = {
  Placement: 3,
  Result: 2,
  Event: 1
};

// Calculates priority score where type weight dominates, and recency breaks ties.
// 2,000,000,000 is larger than any plausible UNIX timestamp, ensuring weight priority.
function getPriorityScore(notification) {
  const weight = TYPE_WEIGHTS[notification.Type] || 0;
  const timestampSeconds = Math.floor(new Date(notification.Timestamp).getTime() / 1000);
  return weight * 2000000000 + timestampSeconds;
}

// Min-heap to efficiently track the top N elements in O(log N)
class MinHeap {
  constructor() {
    this.elements = [];
  }

  get size() {
    return this.elements.length;
  }

  peek() {
    return this.elements[0] || null;
  }

  push(item) {
    this.elements.push(item);
    this.bubbleUp(this.elements.length - 1);
  }

  pop() {
    if (this.elements.length === 0) return null;
    const minItem = this.elements[0];
    const lastItem = this.elements.pop();
    
    if (this.elements.length > 0) {
      this.elements[0] = lastItem;
      this.sinkDown(0);
    }
    return minItem;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.elements[parentIndex].priority <= this.elements[index].priority) {
        break;
      }
      this.swap(parentIndex, index);
      index = parentIndex;
    }
  }

  sinkDown(index) {
    const length = this.elements.length;
    while (true) {
      let smallestIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < length && this.elements[leftChild].priority < this.elements[smallestIndex].priority) {
        smallestIndex = leftChild;
      }
      if (rightChild < length && this.elements[rightChild].priority < this.elements[smallestIndex].priority) {
        smallestIndex = rightChild;
      }
      if (smallestIndex === index) {
        break;
      }
      this.swap(index, smallestIndex);
      index = smallestIndex;
    }
  }

  swap(i, j) {
    const temp = this.elements[i];
    this.elements[i] = this.elements[j];
    this.elements[j] = temp;
  }

  getSortedList() {
    return [...this.elements]
      .sort((a, b) => b.priority - a.priority)
      .map(entry => entry.notification);
  }
}

// Priority Inbox maintains only the top N highest priority notifications
class PriorityInbox {
  constructor(topN) {
    this.topN = topN;
    this.heap = new MinHeap();
    this.seenIds = new Set();
  }

  offer(notification) {
    if (this.seenIds.has(notification.ID)) {
      return false; // Skip duplicates
    }

    const priority = getPriorityScore(notification);
    const entry = { priority, notification };

    if (this.heap.size < this.topN) {
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      logger.info("PriorityInbox", "Notification added to heap", {
        id: notification.ID,
        type: notification.Type,
        heapSize: this.heap.size
      });
      return true;
    }

    const minEntry = this.heap.peek();
    if (priority > minEntry.priority) {
      // Evict lowest priority element and insert incoming
      this.seenIds.delete(minEntry.notification.ID);
      this.heap.pop();
      this.heap.push(entry);
      this.seenIds.add(notification.ID);

      logger.info("PriorityInbox", "Evicted lower priority notification", {
        evictedId: minEntry.notification.ID,
        insertedId: notification.ID,
        insertedType: notification.Type
      });
      return true;
    }

    return false;
  }

  loadBatch(notifications) {
    let insertedCount = 0;
    for (const notification of notifications) {
      if (this.offer(notification)) {
        insertedCount++;
      }
    }
    logger.info("PriorityInbox", "Finished processing batch", {
      total: notifications.length,
      inserted: insertedCount
    });
  }

  getTopNotifications() {
    return this.heap.getSortedList();
  }
}

// HTTP request helper to call the protected API
function fetchNotifications() {
  return new Promise((resolve, reject) => {
    logger.info("HTTP", "Requesting notifications from external API");

    const url = new URL(CONFIG.apiBaseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: CONFIG.apiPath,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(CONFIG.apiToken ? { "Authorization": `Bearer ${CONFIG.apiToken}` } : {})
      }
    };

    const req = http.request(options, (res) => {
      logger.info("HTTP", "Received response headers", { statusCode: res.statusCode });

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const body = JSON.parse(data);
            resolve(body.notifications || []);
          } catch (err) {
            logger.error("HTTP", "Failed to parse API JSON response", { error: err.message });
            reject(err);
          }
        } else {
          logger.warn("HTTP", "API returned non-200 status", { statusCode: res.statusCode });
          reject(new Error(`API responded with status code ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err) => {
      logger.error("HTTP", "Connection error", { error: err.message });
      reject(err);
    });

    req.setTimeout(8000, () => {
      logger.error("HTTP", "Request timed out after 8 seconds");
      req.destroy(new Error("Timeout"));
    });

    req.end();
  });
}

// Clean command-line layout display
function renderTable(notifications, limit) {
  const lineSeparator = "=".repeat(75);
  const thinSeparator = "-".repeat(75);

  console.log(`\n${lineSeparator}`);
  console.log(`  🏆  TOP ${limit} NOTIFICATIONS`);
  console.log(`  📅  Updated: ${new Date().toLocaleString()}`);
  console.log(lineSeparator);
  console.log(`  ${"RANK".padEnd(6)} ${"TYPE".padEnd(12)} ${"TIMESTAMP".padEnd(22)} MESSAGE`);
  console.log(thinSeparator);

  notifications.forEach((item, index) => {
    const rank = `#${index + 1}`.padEnd(6);
    const type = item.Type.padEnd(12);
    const timestamp = item.Timestamp.padEnd(22);
    const msg = item.Message || "";
    console.log(`  ${rank} ${type} ${timestamp} ${msg}`);
  });

  console.log(`${lineSeparator}\n`);
}

// Main execution process
async function startApp() {
  logger.info("Main", "Initializing Priority Inbox App");
  const inbox = new PriorityInbox(CONFIG.topN);

  async function poll() {
    try {
      const data = await fetchNotifications();
      inbox.loadBatch(data);
      renderTable(inbox.getTopNotifications(), CONFIG.topN);
    } catch (err) {
      logger.error("Main", "Polling iteration failed", { error: err.message });
    }
  }

  // First poll cycle
  await poll();

  // Subsequent intervals
  logger.info("Main", `Scheduling polling timer every ${CONFIG.pollIntervalMs}ms`);
  setInterval(poll, CONFIG.pollIntervalMs);
}

startApp().catch((err) => {
  logger.error("Main", "Process crashed", { error: err.message });
  process.exit(1);
});
