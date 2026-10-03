const test = require("node:test");
const assert = require("node:assert/strict");
const { lockResources } = require("../src/database/schedulingConflictLock");

test("scheduling conflict locks are tenant-scoped and acquired in stable resource order", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
    }
  };

  await lockResources(db, "org-a", ["resource-2", "resource-1", "resource-2"]);

  assert.deepEqual(
    calls.map(call => call.params[0]),
    [
      "scheduling-resource:org-a:resource-1",
      "scheduling-resource:org-a:resource-2"
    ]
  );
  assert.ok(calls.every(call => call.sql.includes("pg_advisory_xact_lock")));
});
