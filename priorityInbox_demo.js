"use strict";

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
  { ID: "8a7412bd-6065-4d09-8501-a37f11cc848b", Type: "Placement", Message: "Advanced Micro Devices Inc. hiring", Timestamp: "2026-04-22 17:49:42" }
];

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

// Clean command-line layout display
function renderTable(notifications, limit) {
  const lineSeparator = "═".repeat(75);
  const thinSeparator = "─".repeat(75);

  console.log(`\n${lineSeparator}`);
  console.log(`  🏆  TOP ${limit} NOTIFICATIONS (DEMO MODE)`);
  console.log(`  📅  Updated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
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

// Simulation helper
function simulateArrival(inbox, newBatch, delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info("Simulation", "New stream notifications arrived", { count: newBatch.length });
      inbox.loadBatch(newBatch);
      resolve();
    }, delayMs);
  });
}

// Main execution process
async function startApp() {
  const limit = parseInt(process.argv[2], 10) || 10;
  logger.info("Main", "Initializing Demo Priority Inbox App", { limit });

  const inbox = new PriorityInbox(limit);

  // Round 1: Initial batch
  logger.info("Main", "Simulating Round 1 initial batch");
  inbox.loadBatch(SAMPLE_NOTIFICATIONS);
  renderTable(inbox.getTopNotifications(), limit);

  // Round 2: Simulate newly streaming notifications
  const incoming = [
    { ID: "new-0001", Type: "Placement", Message: "Amazon hiring — SDE1",  Timestamp: "2026-04-22 17:53:00" },
    { ID: "new-0002", Type: "Event",     Message: "alumni-meet",            Timestamp: "2026-04-22 17:52:00" },
    { ID: "new-0003", Type: "Result",    Message: "hackathon-result",       Timestamp: "2026-04-22 17:54:00" },
  ];

  await simulateArrival(inbox, incoming, 100);
  renderTable(inbox.getTopNotifications(), limit);

  logger.info("Main", "Simulation complete");
}

startApp().catch((err) => {
  logger.error("Main", "Process crashed", { error: err.message });
  process.exit(1);
});
