/**
 * PriorityInboxView — Displays the top-N highest priority notifications using
 * the Min-Heap algorithm from usePriorityInbox hook.
 *
 * Visual distinction: ranked badge, type colour, unread dot, read/muted state.
 */

"use client";

import React from "react";
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Alert,
  Stack,
  Chip,
  Divider,
  Paper,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import RefreshIcon from "@mui/icons-material/Refresh";
import InboxIcon from "@mui/icons-material/Inbox";
import { usePriorityInbox } from "@/hooks/usePriorityInbox";
import NotificationCard from "@/components/NotificationCard";
import { Log } from "@/lib/logger";

function LoadingSkeleton(): React.ReactElement {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={72} animation="wave" />
      ))}
    </Stack>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 8,
        gap: 2,
      }}
    >
      <InboxIcon sx={{ fontSize: 64, color: "#bdbdbd" }} />
      <Typography variant="h6" color="text.secondary">
        Priority inbox is empty
      </Typography>
      <Typography variant="body2" color="text.disabled">
        No notifications are available right now.
      </Typography>
    </Box>
  );
}

export default function PriorityInboxView(): React.ReactElement {
  const { topNotifications, readIds, loading, error, markAsRead, refetch } =
    usePriorityInbox(10);

  const unreadCount = topNotifications.filter((n) => !readIds.has(n.ID)).length;

  function handleRefresh(): void {
    refetch();
    void Log("frontend", "info", "component", "PriorityInboxView: user triggered refresh");
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <EmojiEventsIcon sx={{ color: "#f9a825", fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Priority Inbox
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Top 10 notifications ranked by type importance and recency
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {unreadCount > 0 && (
            <Chip
              label={`${unreadCount} unread`}
              color="error"
              size="small"
              variant="filled"
            />
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Algorithm note */}
      <Paper
        variant="outlined"
        sx={{ p: 1.5, mb: 2, backgroundColor: "#f5f5f5", borderColor: "#e0e0e0" }}
      >
        <Typography variant="caption" color="text.secondary">
          <strong>Algorithm:</strong> Fixed-size Min-Heap (O(log N) per insert).
          Priority score = type_weight × 2,000,000,000 + timestamp_seconds.
          Type weights: Placement=3, Result=2, Event=1.
        </Typography>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      {/* Content states */}
      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <Alert
          severity="error"
          action={
            <Button size="small" onClick={handleRefresh}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && !error && topNotifications.length === 0 && <EmptyState />}

      {!loading && !error && topNotifications.length > 0 && (
        <Stack spacing={0}>
          {topNotifications.map((n, index) => (
            <NotificationCard
              key={n.ID}
              notification={n}
              isRead={readIds.has(n.ID)}
              rank={index + 1}
              onMarkRead={markAsRead}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
