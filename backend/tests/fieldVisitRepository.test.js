const test = require("node:test");
const assert = require("node:assert/strict");
const { FieldVisitRepository } = require("../src/repositories/fieldVisitRepository");

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
const visit = {
  id: "visit-1",
  organizationId: "org-a",
  version: 1,
  appointmentId: "appointment-1",
  workOrderId: "wo-1",
  statusCode: "scheduled",
  resourceIds: ["resource-1"],
  observations: [{ type: "note", value: "ok" }],
  completionData: {},
  metadata: { source: "test" }
};

const row = {
  ...visit,
  organization_id: "org-a",
  appointment_id: "appointment-1",
  work_order_id: "wo-1",
  status_code: "scheduled",
  resource_ids: ["resource-1"],
  arrived_at: null,
  actual_start_time: null,
  actual_end_time: null,
  completed_at: null,
  completed_by_user_id: null,
  closed_at: null,
  closed_by_user_id: null,
  outcome_code: null,
  outcome_reason: null,
  notes: "",
  completion_data: {},
  updated_at: "2026-10-02T00:00:00Z"
};

test("field visit repository creates with trusted tenant identity", async () => {
  const pool = poolFixture([row]);
  const repository = new FieldVisitRepository({ pool, clock: () => new Date("2026-10-02T00:00:00Z") });
  const result = await repository.create({ principal, visit });
  assert.equal(result.organizationId, "org-a");
  assert.match(pool.calls[0].sql, /INSERT INTO field_visits/);
  assert.equal(pool.calls[0].params[1], "org-a");
});

test("field visit repository reads within the trusted tenant", async () => {
  const pool = poolFixture([]);
  const repository = new FieldVisitRepository({ pool });
  assert.equal(await repository.get({ principal, fieldVisitId: "visit-1" }), null);
  assert.deepEqual(pool.calls[0].params, ["org-a", "visit-1"]);
});

test("field visit list applies tenant and bounded filters", async () => {
  const pool = poolFixture([row]);
  const repository = new FieldVisitRepository({ pool });
  const results = await repository.list({ principal, appointmentId: "appointment-1", resourceId: "resource-1" });
  assert.equal(results.length, 1);
  assert.match(pool.calls[0].sql, /organization_id = \$1/);
  assert.match(pool.calls[0].sql, /resource_ids @>/);
});

test("field visit replacement requires the expected version", async () => {
  const updated = { ...row, version: 2 };
  const pool = poolFixture([updated]);
  const repository = new FieldVisitRepository({ pool, clock: () => new Date("2026-10-02T01:00:00Z") });
  const result = await repository.replace({ principal, fieldVisit: { ...visit, version: 2 }, expectedVersion: 1 });
  assert.equal(result.version, 2);
  assert.equal(pool.calls[0].params.at(-1), 1);
});

test("field visit replacement rejects a stale version", async () => {
  const pool = poolFixture([]);
  const repository = new FieldVisitRepository({ pool });
  await assert.rejects(
    () => repository.replace({ principal, fieldVisit: { ...visit, version: 2 }, expectedVersion: 1 }),
    error => error.statusCode === 409
  );
});

test("field visit repository requires a trusted principal", async () => {
  const repository = new FieldVisitRepository({ pool: poolFixture([]) });
  await assert.rejects(() => repository.get({ principal: null, fieldVisitId: "visit-1" }), /Trusted principal/);
});
