const http = require("http");
const { createAppState, createHandler } = require("./app");
const { AuthenticationService } = require("./services/authenticationService");

const PORT = Number(process.env.PORT || 3000);
const authenticationService = process.env.NODE_ENV === "development"
  ? null
  : new AuthenticationService();
const state = createAppState({ authenticationService });
const server = http.createServer(createHandler(state));

server.listen(PORT, () => {
  console.log(`Scheduling Platform API listening on port ${PORT}`);
});

module.exports = { server, state };
