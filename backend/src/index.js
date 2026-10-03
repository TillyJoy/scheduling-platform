const http = require("http");
const { createAppState, createHandler } = require("./app");
const { AuthenticationService } = require("./services/authenticationService");
const { createDatabasePool, runMigrations } = require("./database");

const PORT = Number(process.env.PORT || 3000);
const allowDevelopmentBypass =
  process.env.NODE_ENV === "development" &&
  process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS === "true";
const authenticationService = allowDevelopmentBypass ? null : new AuthenticationService();

async function start() {
  const databasePool = process.env.DATABASE_URL ? createDatabasePool() : null;
  if (databasePool) await runMigrations(databasePool);
  const state = createAppState({ authenticationService, databasePool });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass }));

  server.listen(PORT, () => {
    console.log(`Scheduling Platform API listening on port ${PORT}`);
  });

  return { server, state, databasePool };
}

if (require.main === module) {
  start().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { start };
