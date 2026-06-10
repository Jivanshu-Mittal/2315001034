"use strict";

const http = require("http");

// Valid enum values for validation
const VALID_STACKS = new Set(["backend", "frontend"]);
const VALID_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

const VALID_PACKAGES = new Set([
  // Backend only
  "cache", "controller", "cron_job", "db", "domain", "handler", "repository", "route", "service",
  // Frontend only
  "api", "component", "hook", "page", "state", "style",
  // Shared
  "auth", "config", "middleware", "utils"
]);

/**
 * Reusable Log function making an API call to the Test Server.
 * Signature: Log(stack, level, packageField, message)
 * 
 * Note: 'packageField' maps to the "package" key in the JSON request body.
 */
function Log(stack, level, packageField, message) {
  // Normalize inputs to lowercase as required by constraints
  const normalizedStack = String(stack).toLowerCase();
  const normalizedLevel = String(level).toLowerCase();
  const normalizedPackage = String(packageField).toLowerCase();
  
  // Validate constraints
  if (!VALID_STACKS.has(normalizedStack)) {
    console.warn(`[Logger Warning] Invalid stack value: "${stack}"`);
  }
  if (!VALID_LEVELS.has(normalizedLevel)) {
    console.warn(`[Logger Warning] Invalid level value: "${level}"`);
  }
  if (!VALID_PACKAGES.has(normalizedPackage)) {
    console.warn(`[Logger Warning] Invalid package value: "${packageField}"`);
  }

  const payload = {
    stack: normalizedStack,
    level: normalizedLevel,
    package: normalizedPackage,
    message: String(message)
  };

  // Local console log fallback / helper (so logs are visible in the terminal output)
  const localTimestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp: localTimestamp,
    ...payload
  }));

  const token = process.env.API_TOKEN;
  if (!token) {
    // If no token is provided, log locally and skip network call
    return;
  }

  // Perform asynchronous POST request to the evaluation service
  const bodyData = JSON.stringify(payload);
  const options = {
    hostname: "4.224.186.213",
    port: 80,
    path: "/evaluation-service/logs",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(bodyData),
      "Authorization": `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    let responseBody = "";
    res.on("data", (chunk) => { responseBody += chunk; });
    res.on("end", () => {
      if (res.statusCode !== 200) {
        // Log log-dispatch failure locally without raising exceptions
        console.error(`[Logger Error] Remote logging API failed (HTTP ${res.statusCode}): ${responseBody}`);
      }
    });
  });

  req.on("error", (err) => {
    console.error(`[Logger Error] Failed to send log to remote API: ${err.message}`);
  });

  req.setTimeout(3000, () => {
    req.destroy(new Error("Timeout"));
  });

  req.write(bodyData);
  req.end();
}

module.exports = { Log };
