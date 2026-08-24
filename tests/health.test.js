const { healthCheck } = require("../backend/src/health");

const result = healthCheck();

if (result.status !== "ok") {
  throw new Error("Health check failed");
}

console.log("Health check passed");
