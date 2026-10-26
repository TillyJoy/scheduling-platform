const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");

const shouldRun = process.env.DATABASE_URL && process.env.RUN_POSTGRES_TESTS === "1";
const TEST_DATABASE_NAME = "scheduling_platform_test";
const TEST_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function request(server, method, path, token = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      method,
      path,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitUntilListening(server) {
  if (!server.listening) await once(server, "listening");
}

test("database-backed development startup persists and scopes the demo resource", { skip: !shouldRun }, async t => {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  assert.equal(databaseUrl.pathname, `/${TEST_DATABASE_NAME}`, "PostgreSQL integration tests must use the dedicated test database");
  assert.ok(TEST_DATABASE_HOSTS.has(databaseUrl.hostname), "PostgreSQL integration tests must use a loopback-hosted isolated service");

  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
    ALLOW_DEVELOPMENT_AUTH_BYPASS: process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS
  };
  const { Pool } = require("pg");
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const isolatedDatabaseName = `scheduling_platform_demo_bootstrap_${randomUUID().replaceAll("-", "")}`;
  let isolatedDatabaseCreated = false;
  process.env.NODE_ENV = "development";
  process.env.AUTH_SECRET = "isolated-postgres-demo-bootstrap-test-secret";
  process.env.PORT = "0";
  process.env.DATABASE_SSL = "false";
  process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS = "false";

  const started = [];
  try {
    const identity = await adminPool.query("SELECT current_database() AS database_name");
    assert.equal(identity.rows[0].database_name, TEST_DATABASE_NAME);
    await adminPool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);
    isolatedDatabaseCreated = true;
    const isolatedDatabaseUrl = new URL(previousEnvironment.DATABASE_URL);
    isolatedDatabaseUrl.pathname = `/${isolatedDatabaseName}`;
    process.env.DATABASE_URL = isolatedDatabaseUrl.toString();

    const { start } = require("../src/index");
    const first = await start();
    started.push(first);
    await waitUntilListening(first.server);

    const login = await request(first.server, "POST", "/api/auth/dev-login");
    assert.equal(login.status, 200);
    const demoResources = await request(first.server, "GET", "/api/resources", login.body.token);
    assert.equal(demoResources.status, 200);
    assert.deepEqual(demoResources.body.map(resource => resource.id), ["auditor-1"]);
    assert.equal(demoResources.body[0].organizationId, "demo-org");
    assert.equal(demoResources.body[0].name, "Demo Auditor");

    const otherTenantToken = first.state.authenticationService.issueToken({
      userId: "other-organization-user",
      organizationId: "other-org",
      permissions: ["resource:read"]
    });
    const otherTenantResources = await request(first.server, "GET", "/api/resources", otherTenantToken);
    assert.equal(otherTenantResources.status, 401);
    assert.deepEqual(otherTenantResources.body, { error: "Authentication required" });

    const second = await start();
    started.push(second);
    await waitUntilListening(second.server);
    const secondLogin = await request(second.server, "POST", "/api/auth/dev-login");
    assert.equal(secondLogin.status, 200);
    const resourcesAfterRepeatedStartup = await request(second.server, "GET", "/api/resources", secondLogin.body.token);
    assert.equal(resourcesAfterRepeatedStartup.status, 200);
    assert.deepEqual(resourcesAfterRepeatedStartup.body.map(resource => resource.id), ["auditor-1"]);
  } finally {
    try {
      for (const { server, databasePool } of started.reverse()) {
        if (server.listening) await new Promise(resolve => server.close(resolve));
        await databasePool.end();
      }
      if (isolatedDatabaseCreated) await adminPool.query(`DROP DATABASE "${isolatedDatabaseName}"`);
    } finally {
      await adminPool.end();
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
});
