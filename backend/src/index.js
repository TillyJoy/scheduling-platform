const http = require("http");
const { createAppState, createHandler } = require("./app");
const { AuthenticationService } = require("./services/authenticationService");

const PORT = Number(process.env.PORT || 3000);
const allowDevelopmentBypass =
  process.env.NODE_ENV === "development" &&
  process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS === "true";
const authenticationService = allowDevelopmentBypass ? null : new AuthenticationService();
const state = createAppState({ authenticationService });
const server = http.createServer(createHandler(state, { allowDevelopmentBypass }));

server.listen(PORT, () => {
  console.log(`Scheduling Platform API listening on port ${PORT}`);
});

module.exports = { server, state };
