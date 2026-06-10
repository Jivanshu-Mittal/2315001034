"use strict";

const http = require("http");
const { Log } = require("../logging_middleware/logger");

const CONFIG = {
  apiBaseUrl: "http://4.224.186.213",
  apiPath: "/evaluation-service/notifications",
  apiToken: process.env.API_TOKEN || "",
  topN: parseInt(process.argv[2], 10) || 10,
  pollIntervalMs: parseInt(process.env.POLL_MS, 10) || 10000,
};

Log("backend", "info", "config", `Loaded system configuration with topN: ${CONFIG.topN}, pollIntervalMs: ${CONFIG.pollIntervalMs}`);

const TYPE_WEIGHTS = {
  Placement: 3,
  Result: 2,
  Event: 1
};

function getPriorityScore(notification) {
  const weight = TYPE_WEIGHTS[notification.Type] || 0;
  const timestampSeconds = Math.floor(new Date(notification.Timestamp).getTime() / 1000);
  return weight * 2000000000 + timestampSeconds;
}

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

class PriorityInbox {
  constructor(topN) {
    this.topN = topN;
    this.heap = new MinHeap();
    this.seenIds = new Set();
  }

  offer(notification) {
    if (this.seenIds.has(notification.ID)) {
      return false;
    }

    const priority = getPriorityScore(notification);
    const entry = { priority, notification };

    if (this.heap.size < this.topN) {
      this.heap.push(entry);
      this.seenIds.add(notification.ID);
      Log("backend", "info", "service", `Notification added to heap: ID=${notification.ID}, Type=${notification.Type}`);
      return true;
    }

    const minEntry = this.heap.peek();
    if (priority > minEntry.priority) {
      this.seenIds.delete(minEntry.notification.ID);
      this.heap.pop();
      this.heap.push(entry);
      this.seenIds.add(notification.ID);

      Log("backend", "info", "service", `Evicted lower priority notification ID=${minEntry.notification.ID} to insert incoming ID=${notification.ID} (${notification.Type})`);
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
    Log("backend", "info", "service", `Finished processing batch of ${notifications.length} elements (inserted: ${insertedCount})`);
  }

  getTopNotifications() {
    return this.heap.getSortedList();
  }
}

function fetchNotifications() {
  return new Promise((resolve, reject) => {
    Log("backend", "info", "service", "Requesting notifications from external API");

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
      Log("backend", "info", "service", `Received API response headers with status: ${res.statusCode}`);

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
            Log("backend", "error", "service", `Failed to parse API JSON response: ${err.message}`);
            reject(err);
          }
        } else {
          Log("backend", "warn", "service", `API returned non-200 status code: ${res.statusCode}`);
          reject(new Error(`API responded with status code ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err) => {
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

function renderTable(notifications, limit) {
  const lineSeparator = "═".repeat(75);
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

async function startApp() {
  Log("backend", "info", "service", "Initializing Priority Inbox App");
  const inbox = new PriorityInbox(CONFIG.topN);

  async function poll() {
    try {
      const data = await fetchNotifications();
      inbox.loadBatch(data);
      renderTable(inbox.getTopNotifications(), CONFIG.topN);
    } catch (err) {
      Log("backend", "error", "service", `Polling iteration failed: ${err.message}`);
    }
  }

  await poll();

  Log("backend", "info", "cron_job", `Scheduling polling timer every ${CONFIG.pollIntervalMs}ms`);
  setInterval(poll, CONFIG.pollIntervalMs);
}

startApp().catch((err) => {
  Log("backend", "fatal", "service", `Process crashed: ${err.message}`);
  process.exit(1);
});
