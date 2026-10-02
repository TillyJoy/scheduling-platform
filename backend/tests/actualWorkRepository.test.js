const test = require("node:test");
const assert = require("node:assert/strict");
const { ActualWorkRepository } = require("../src/repositories/actualWorkRepository");

function poolFixture(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    }
  };
}

const principal = { userId: "user-a", organizationId: "org-a" };
const work = {
  id: "work-1",
  organizationId: "org-a",
  fieldVisitId: "visit-1",
  workOrderId: "wo-1",
  resourceId: "resource-1",
  description: "Configured field work",
  actualStartTime: "2026-10-02T10:00:00Z",
  actualEndTime: "2026-10-02T11:00:00Z",
  quantity: 1,
  unit: "unit",
  metadata: { source: "field" }
};

const row = {
  id: "work-1",
  organization_id: "org-a",
  field_visit_id: "visit-1",
  work_order_id: "wo-1",
  resource_id: "resource-1",
  description: "Configured field work",
  actual_start_time: "2026-10-02T10:00:00Z",
  actual_end_time: "2026-10-02T11:00:00Z",
  quantity: 1,
  unit: "unit",
  metadata: { source: "field" }
};

test("actual work repository creates with tenant identity", async () => {
  const pool = poolFixture([row]);
  const repository = new ActualWorkRepository({ pool });
  const result = await repository.create({ principal, work });
  assert.equal(result.organizationId, "org-a");
  assert.equal(pool.calls[0].params[1], "org-a");
  assert.match(pool.calls[0].sql, /INSERT INTO actual_work/);
});

test("actual work repository filters by field visit", async () => {
  const pool = poolFixture([row]);
  const repository = new ActualWorkRepository({ pool });
  const results = await repository.list({ principal, fieldVisitId: "visit-1" });
  assert.equal(results.length, 1);
  assert.deepEqual(pool.calls[0].params, ["org-a", "visit-1"]);
});

test("actual work repository isolates reads by tenant", async () => {
  const pool = poolFixture([]);
  const repository = new ActualWorkRepository({ pool });
  assert.equal(await repository.get({ principal, actualWorkId: "work-1" }), null);
  assert.deepEqual(pool.calls[0].params, ["org-a", "work-1"]);
});

test("actual work repository requires a trusted principal", async () => {
  const repository = new ActualWorkRepository({ pool: poolFixture([]) });
  await assert.rejects(() => repository.get({ principal: null, actualWorkId: "work-1" }), /Trusted principal/);
});
