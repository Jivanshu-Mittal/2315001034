"use strict";

const http = require("http");
const logger = require("../logging_middleware/logger");

const CONFIG = {
  apiBaseUrl: "http://4.224.186.213",
  registerPath: "/evaluation-service/register",
  authPath: "/evaluation-service/auth"
};

/**
 * Perform a POST request to register or authenticate.
 */
function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(CONFIG.apiBaseUrl);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    logger.info("HTTP", `Sending POST request`, { path });

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            reject(new Error("Failed to parse response: " + responseData));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

async function register(details) {
  try {
    logger.info("Register", "Registering on test server...");
    const response = await apiPost(CONFIG.registerPath, details);
    logger.info("Register", "Successfully registered! Save your credentials.", response);
    return response;
  } catch (err) {
    logger.error("Register", "Registration failed", { error: err.message });
  }
}

async function authenticate(credentials) {
  try {
    logger.info("Auth", "Authenticating to obtain access token...");
    const response = await apiPost(CONFIG.authPath, credentials);
    logger.info("Auth", "Successfully authenticated!", response);
    return response;
  } catch (err) {
    logger.error("Auth", "Authentication failed", { error: err.message });
  }
}

module.exports = { register, authenticate };

// If executed directly, run a quick helper command prompt guide
if (require.main === module) {
  console.log("\nUsage instruction:");
  console.log("Import this module or modify the code directly with your user registration details.");
  console.log("Execute register({ email, name, rollNo, mobileNo, githubUsername, accessCode }) to get clientID/Secret.\n");
}
