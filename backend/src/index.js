const http = require("http");
const { createAppState, createHandler } = require("./app");

const PORT = Number(process.env.PORT || 3000);
const state = createAppState();
const server = http.createServer(createHandler(state));

server.listen(PORT, () => {
  console.log(`Scheduling Platform API listening on port ${PORT}`);
});

module.exports = { server, state };
