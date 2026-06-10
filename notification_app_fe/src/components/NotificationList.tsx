/**
 * NotificationList — Full paginated notifications page component.
 * Includes type filter tabs, loading skeleton, error boundary,
 * and empty state with MUI components.
 */

"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Skeleton,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Badge,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationCard from "@/components/NotificationCard";
import { NotificationType } from "@/lib/api";
import { Log } from "@/lib/logger";

// ── Filter types ───────────────────────────────────────────────────────────────

type FilterTab = "All" | NotificationType;
const FILTER_TABS: FilterTab[] = ["All", "Placement", "Result", "Event"];

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton(): React.ReactElement {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={72} animation="wave" />
      ))}
    </Stack>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
        gap: 2,
      }}
    >
      <NotificationsNoneIcon sx={{ fontSize: 64, color: "#bdbdbd" }} />
      <Typography variant="h6" color="text.secondary">
        No notifications found
      </Typography>
      <Typography variant="body2" color="text.disabled">
        Try a different filter or check back later.
      </Typography>
    </Box>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function NotificationList(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [pageSize, setPageSize] = useState<number>(20);

  const { notifications, readIds, loading, error, markAsRead, markAllAsRead, refetch } =
    useNotifications({
      limit: pageSize,
      notification_type: activeTab === "All" ? undefined : activeTab,
    });

  const unreadCount = notifications.filter((n) => !readIds.has(n.ID)).length;

  function handleTabChange(_: React.SyntheticEvent, value: FilterTab): void {
    setActiveTab(value);
    void Log("frontend", "info", "component", `NotificationList: filter changed to ${value}`);
  }

  function handleMarkAllRead(): void {
    markAllAsRead();
    void Log("frontend", "info", "component", "NotificationList: user marked all as read");
  }

  function handleRefresh(): void {
    refetch();
    void Log("frontend", "info", "component", "NotificationList: user triggered refresh");
  }

  return (
    <Box>
      {/* Header row */}
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            All Notifications
          </Typography>
          {unreadCount > 0 && (
            <Badge badgeContent={unreadCount} color="error">
              <Box />
            </Badge>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DoneAllIcon />}
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Per page</InputLabel>
            <Select
              value={pageSize}
              label="Per page"
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={20}>20</MenuItem>
              <MenuItem value={50}>50</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Filter tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ mb: 2 }}
        textColor="primary"
        indicatorColor="primary"
      >
        {FILTER_TABS.map((tab) => (
          <Tab key={tab} value={tab} label={tab} />
        ))}
      </Tabs>

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

      {!loading && !error && notifications.length === 0 && <EmptyState />}

      {!loading && !error && notifications.length > 0 && (
        <Stack spacing={0}>
          {notifications.map((n) => (
            <NotificationCard
              key={n.ID}
              notification={n}
              isRead={readIds.has(n.ID)}
              onMarkRead={markAsRead}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
