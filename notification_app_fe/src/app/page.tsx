/**
 * Home page — All Notifications
 * Displays the full notification feed with filtering and pagination.
 */

"use client";

import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  Avatar,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import Link from "next/link";
import NotificationList from "@/components/NotificationList";
import { Log } from "@/lib/logger";
import { useEffect } from "react";

export default function HomePage(): React.ReactElement {
  useEffect(() => {
    void Log("frontend", "info", "page", "HomePage mounted — All Notifications view");
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default" }}>
      {/* Navigation bar */}
      <AppBar position="sticky" elevation={1} sx={{ backgroundColor: "#fff", color: "text.primary" }}>
        <Toolbar>
          <Avatar sx={{ bgcolor: "primary.main", mr: 1.5, width: 36, height: 36 }}>
            <NotificationsIcon fontSize="small" />
          </Avatar>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, color: "primary.main" }}>
            CampusNotify
          </Typography>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              component={Link}
              href="/"
              startIcon={<NotificationsIcon />}
              size="small"
            >
              All Notifications
            </Button>
            <Button
              variant="outlined"
              component={Link}
              href="/priority"
              startIcon={<EmojiEventsIcon />}
              size="small"
            >
              Priority Inbox
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Page content */}
      <Container maxWidth="md" sx={{ py: 4 }}>
        <NotificationList />
      </Container>
    </Box>
  );
}
