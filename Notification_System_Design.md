# Stage 1

## Priority Inbox — Notification System Design

---

### 1. Problem Statement

Users of the campus notification platform lose track of important updates because
the volume of incoming notifications is high and they arrive in arbitrary order.
The system must always surface the **top N most important unread notifications**
first, where importance is jointly determined by:

| Factor      | Description                                                             |
|-------------|-------------------------------------------------------------------------|
| **Weight**  | Notification type: `Placement (3) > Result (2) > Event (1)`            |
| **Recency** | More recently timestamped notifications rank higher within the same type |

---

### 2. Data Model

```typescript
interface Notification {
  ID:        string;
  Type:      "Placement" | "Result" | "Event";
  Message:   string;
  Timestamp: string; // "YYYY-MM-DD HH:mm:ss"
}
```

---

### 3. Priority Score Formula

Each notification is mapped to a single numeric score:

```
priority_score = type_weight × TYPE_SCALE + timestamp_seconds
```

| Type      | type_weight | Rationale              |
|-----------|-------------|------------------------|
| Placement | 3           | Career-critical        |
| Result    | 2           | Academic impact        |
| Event     | 1           | Informational          |

**`TYPE_SCALE = 2,000,000,000`**

This constant exceeds the maximum plausible Unix timestamp (≈ 1.7 × 10⁹ in
2026), guaranteeing that type weight always dominates recency. Within the same
type, the larger timestamp (more recent) wins automatically.

**Time complexity of scoring:** `O(1)` — single multiply + add.

---

### 4. Algorithm — Fixed-Size Min-Heap

#### Why a Min-Heap?

A Min-Heap of capacity **N** keeps the top-N highest-priority items in memory.

| Operation                  | Complexity |
|----------------------------|------------|
| Peek minimum (worst in top‑N) | O(1)    |
| Push / bubbleUp            | O(log N)   |
| Pop / sinkDown             | O(log N)   |
| Duplicate check via Set    | O(1)       |
| Score each notification    | O(1)       |
| Full poll cycle (M items)  | O(M log N) |
| Space                      | O(N)       |

The heap root is always the notification with the **lowest** score among the
current top-N. This means every new candidate only needs to be compared
against the root — no linear scan required.

#### Insertion Decision Logic

```
function offer(notification):
  score = computePriorityScore(notification)        // O(1)

  if heap.size < N:
    heap.push({ score, notification })              // O(log N)
    seenIds.add(notification.ID)                    // O(1)

  elif score > heap.root.score:
    seenIds.delete(heap.root.notification.ID)       // O(1)
    heap.pop()                                      // O(log N) — sinkDown
    heap.push({ score, notification })              // O(log N) — bubbleUp
    seenIds.add(notification.ID)                    // O(1)

  else:
    discard                                         // O(1)
```

#### Diagram

```
 Incoming notification
         │
         ▼
  score = getPriorityScore()   O(1)
         │
    ┌────▼─────────────┐
    │  heap.size < N?  │
    └────┬─────────────┘
         │ Yes              No
         ▼                  ▼
    push directly     score > root?
    O(log N)          /           \
                    Yes            No
                     ▼              ▼
              evict root        discard
              push new          O(1)
              O(log N)
```

---

### 5. Handling Continuous Incoming Notifications

New notifications arrive via periodic API polling (default: every 10 s).

The heap update per notification is **O(log N)** where N is fixed (e.g., 10).
For a stream of M total notifications processed over time, the total cost is:

```
O(M · log N)  ≈  O(M)  because N is a constant
```

This is optimal — far better than a naïve full-sort approach of O(M log M).

**Duplicate suppression** is handled by a `Set<string>` of currently-held IDs,
giving O(1) lookup. When a notification is evicted, its ID is removed from the
set so it can re-enter if it somehow returns with a higher score later.

---

### 6. Complexity Summary

| Scenario                          | Time       | Space |
|-----------------------------------|------------|-------|
| Score a single notification       | O(1)       | O(1)  |
| Add to priority inbox             | O(log N)   | —     |
| Retrieve sorted top-N             | O(N log N) | O(N)  |
| Duplicate check                   | O(1)       | O(N)  |
| Process M notifications (stream)  | O(M log N) | O(N)  |

---

### 7. TypeScript Implementation Files

| File                                        | Purpose                                 |
|---------------------------------------------|-----------------------------------------|
| `logging_middleware/logger.ts`              | Reusable `Log()` function (Fetch API)   |
| `notification_app_be/priorityInbox.ts`      | Min-Heap algorithm + HTTP polling       |
| `notification_app_fe/src/lib/logger.ts`     | Frontend-compatible logger              |
| `notification_app_fe/src/lib/api.ts`        | Typed API client for notifications      |
| `notification_app_fe/src/hooks/useNotifications.ts` | React hook — paginated fetch    |
| `notification_app_fe/src/hooks/usePriorityInbox.ts` | React hook — priority inbox     |
| `notification_app_fe/src/components/NotificationList.tsx` | MUI list + read/unread  |
| `notification_app_fe/src/components/PriorityInbox.tsx` | Priority inbox MUI page     |

---

### 8. Logging Strategy

Every significant event uses the `Log(stack, level, package, message)` middleware:

| Event                          | stack      | level  | package   |
|--------------------------------|------------|--------|-----------|
| Config loaded                  | backend    | info   | config    |
| Notification scored & accepted | backend    | info   | service   |
| Notification evicted           | backend    | info   | service   |
| API request sent               | backend    | info   | service   |
| API non-200 response           | backend    | warn   | service   |
| Network error                  | backend    | error  | service   |
| Process crash                  | backend    | fatal  | service   |
| Frontend hook fetch success    | frontend   | info   | hook      |
| Frontend hook fetch error      | frontend   | error  | hook      |
| Frontend component mounted     | frontend   | debug  | component |

---

### 9. Output Screenshots

#### Initial Top-10 (Round 1 Batch)
![Initial Output](screenshot_initial.png)

#### Updated Top-10 (After Stream Arrival)
![Updated Output](screenshot_updated.png)

---

### 10. Design Decisions & Trade-offs

| Decision                        | Rationale                                                   |
|---------------------------------|-------------------------------------------------------------|
| Integer score (no float)        | Avoids floating-point drift; exact ordering guaranteed      |
| TYPE_SCALE = 2 × 10⁹            | Larger than max Unix timestamp → type always dominates      |
| Min-Heap over Max-Heap          | Root = eviction candidate → O(1) comparison for new items   |
| Min-Heap over sorted array      | O(log N) insert vs O(N) for sorted insertion                |
| Set for deduplication           | O(1) lookup; avoids bloat on repeated polls                 |
| Polling over WebSocket          | API is HTTP GET only; polling is the natural fit            |

---

### 11. Future Enhancements

- **Score decay**: Reduce score of old notifications to surface fresh content.
- **Persistent state**: Serialise the heap to Redis for restart resilience.
- **Real-time push**: Replace polling with WebSocket / Server-Sent Events.
- **Per-user inboxes**: Shard by `userID` to personalise the top-N.
- **Read/unread tracking**: Remove read notifications and promote next-best.
