const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  getDatabaseConfig,
  withTransaction
} = require("../src/database");

test("database configuration fails closed without DATABASE_URL", () => {
  assert.equal(getDatabaseConfig({}).databaseUrl, null);
  assert.throws(() => require("../src/database").createDatabasePool(getDatabaseConfig({})), /DATABASE_URL is required/);
});

test("database configuration defaults to verified TLS and bounded pool settings", () => {
  const config = getDatabaseConfig({
    DATABASE_URL: "postgres://example.invalid/app",
    DATABASE_POOL_MAX: "7",
    DATABASE_IDLE_TIMEOUT_MS: "12000",
    DATABASE_CONNECTION_TIMEOUT_MS: "3000"
  });
  assert.equal(config.max, 7);
  assert.equal(config.idleTimeoutMillis, 12000);
  assert.equal(config.connectionTimeoutMillis, 3000);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});

test("transaction helper establishes tenant and user context and rolls back failures", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "SELECT set_config('app.action', $1, true)") throw new Error("boom");
    },
    release() { calls.push({ release: true }); }
  };
  const pool = { connect: async () => client };
  await assert.rejects(
    () => withTransaction(pool, { organizationId: "org-a", userId: "user-a", action: "test.action" }, async () => "ok"),
    /boom/
  );
  assert.equal(calls[0].sql, "BEGIN");
  assert.deepEqual(calls[1].params, ["org-a"]);
  assert.deepEqual(calls[2].params, ["user-a"]);
  assert.deepEqual(calls[3].params, ["test.action"]);
  assert.equal(calls[4].sql, "ROLLBACK");
  assert.deepEqual(calls[5], { release: true });
});

test("transaction helper commits successful work", async () => {
  const calls = [];
  const client = {
    async query(sql, params) { calls.push({ sql, params }); },
    release() { calls.push({ release: true }); }
  };
  const pool = { connect: async () => client };
  const result = await withTransaction(pool, { organizationId: "org-a" }, async db => {
    assert.equal(db, client);
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(calls.at(-2).sql, "COMMIT");
  assert.deepEqual(calls.at(-1), { release: true });
});

test("persistence migration contains tenant RLS and replay-safe storage constraints", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/001_secure_persistence_foundation.sql"), "utf8");
  for (const table of ["audit_events", "domain_events", "event_outbox", "notifications", "field_execution_operations"]) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`CREATE POLICY ${table}_tenant_isolation`));
  }
  assert.match(sql, /UNIQUE \(organization_id, delivery_key\)/);
  assert.match(sql, /PRIMARY KEY \(organization_id, operation_id\)/);
  assert.match(sql, /UNIQUE \(organization_id, event_id\)/);
  assert.match(sql, /audit events are append-only/);
});
