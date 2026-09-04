const http = require("http");
const { healthCheck } = require("./health");
const { getDatabaseConfig } = require("./database");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(healthCheck()));
    return;
  }

  if (req.url === "/database") {
    const config = getDatabaseConfig();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        configured: Boolean(config.databaseUrl)
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Route not found"
    })
  );
});

server.listen(PORT, () => {
  console.log(`Scheduling Platform API listening on port ${PORT}`);
});
