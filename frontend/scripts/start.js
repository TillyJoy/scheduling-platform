const { spawn } = require("node:child_process");

const backend = spawn(process.execPath, ["../backend/src/index.js"], {
  cwd: __dirname + "/..",
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    ALLOW_DEVELOPMENT_AUTH_BYPASS: "false",
    AUTH_SECRET: process.env.AUTH_SECRET || "mvp-development-auth-secret-32-bytes-minimum!"
  }
});

backend.on("exit", code => process.exit(code ?? 0));
process.on("SIGINT", () => backend.kill("SIGINT"));
process.on("SIGTERM", () => backend.kill("SIGTERM"));
