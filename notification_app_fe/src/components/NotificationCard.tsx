/**
 * NotificationCard — MUI card displaying a single notification.
 * Visually differentiates between read (muted) and unread (highlighted) states.
 */

"use client";

import React from "react";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import WorkIcon from "@mui/icons-material/Work";
import SchoolIcon from "@mui/icons-material/School";
import EventIcon from "@mui/icons-material/Event";
import { Notification } from "@/lib/api";
import { Log } from "@/lib/logger";

// ── Type metadata ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  Placement: {
    color: "#1565c0" as const,
    bg: "#e3f2fd" as const,
    icon: <WorkIcon fontSize="small" />,
    chipColor: "primary" as const,
  },
  Result: {
    color: "#2e7d32" as const,
    bg: "#e8f5e9" as const,
    icon: <SchoolIcon fontSize="small" />,
    chipColor: "success" as const,
  },
  Event: {
    color: "#e65100" as const,
    bg: "#fff3e0" as const,
    icon: <EventIcon fontSize="small" />,
    chipColor: "warning" as const,
  },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface NotificationCardProps {
  notification: Notification;
  isRead: boolean;
  rank?: number;                         // Optional rank number for priority inbox
  onMarkRead: (id: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NotificationCard({
  notification,
  isRead,
  rank,
  onMarkRead,
}: NotificationCardProps): React.ReactElement {
  const config = TYPE_CONFIG[notification.Type];

  function handleMarkRead(): void {
    onMarkRead(notification.ID);
    void Log("frontend", "debug", "component", `Notification ${notification.ID} marked as read by user`);
  }

  const formattedDate = new Date(notification.Timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Card
      elevation={isRead ? 0 : 3}
      sx={{
        mb: 1.5,
        border: "1px solid",
        borderColor: isRead ? "#e0e0e0" : config.color,
        borderLeft: `5px solid ${isRead ? "#bdbdbd" : config.color}`,
        backgroundColor: isRead ? "#fafafa" : config.bg,
        opacity: isRead ? 0.75 : 1,
        transition: "all 0.25s ease",
        "&:hover": {
          boxShadow: isRead ? 1 : 4,
          opacity: 1,
        },
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          {/* Left: Rank badge (priority inbox) + type icon + message */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexGrow: 1 }}>
            {rank !== undefined && (
              <Box
                sx={{
                  minWidth: 32,
                  height: 32,
                  borderRadius: "50%",
                  backgroundColor: config.color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                #{rank}
              </Box>
            )}

            <Box sx={{ color: config.color, flexShrink: 0, mt: 0.3 }}>
              {config.icon}
            </Box>

            <Box sx={{ flexGrow: 1 }}>
              <Typography
                variant="body1"
                color={isRead ? "text.secondary" : "text.primary"}
                sx={{ fontWeight: isRead ? 400 : 600, lineHeight: 1.3 }}
              >
                {notification.Message}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {formattedDate}
              </Typography>
            </Box>
          </Box>

          {/* Right: Type chip + unread dot + mark-read button */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Chip
              label={notification.Type}
              size="small"
              color={config.chipColor}
              variant={isRead ? "outlined" : "filled"}
              sx={{ fontSize: "0.7rem", height: 22 }}
            />

            {!isRead && (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: config.color,
                  flexShrink: 0,
                }}
              />
            )}

            <Tooltip title={isRead ? "Already read" : "Mark as read"}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleMarkRead}
                  disabled={isRead}
                  sx={{ color: isRead ? "#bdbdbd" : config.color }}
                >
                  <DoneAllIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
