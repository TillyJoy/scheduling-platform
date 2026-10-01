const test = require("node:test");
const assert = require("node:assert/strict");
const { ClientRepository, MAX_PAGE_SIZE } = require("../src/repositories/clientRepository");

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

test("client repository creates with trusted tenant identity", async () => {
  const pool = poolFixture([{
    id: "client-1", organization_id: "org-a", first_name: "A", last_name: "B",
    phone: null, email: null, status: "active", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z"
  }]);
  const repository = new ClientRepository({ pool, clock: () => new Date("2026-10-01T00:00:00Z") });
  const result = await repository.create({
    principal,
    client: { id: "client-1", firstName: "A", lastName: "B" }
  });
  assert.equal(result.organizationId, "org-a");
  assert.match(pool.calls[0].sql, /organization_id/);
  assert.equal(pool.calls[0].params[1], "org-a");
});

test("client repository gets only within trusted tenant", async () => {
  const pool = poolFixture([]);
  const repository = new ClientRepository({ pool });
  assert.equal(await repository.get({ principal, clientId: "client-1" }), null);
  assert.deepEqual(pool.calls[0].params, ["org-a", "client-1"]);
  assert.match(pool.calls[0].sql, /organization_id = \$1 AND id = \$2/);
});

test("client list uses bounded keyset pagination and never an unbounded result", async () => {
  const pool = poolFixture([
    { id: "c1", organization_id: "org-a", first_name: "A", last_name: "B", status: "active", created_at: "2026-10-01T00:00:00Z" },
    { id: "c2", organization_id: "org-a", first_name: "C", last_name: "D", status: "active", created_at: "2026-09-30T00:00:00Z" },
    { id: "c3", organization_id: "org-a", first_name: "E", last_name: "F", status: "active", created_at: "2026-09-29T00:00:00Z" }
  ]);
  const repository = new ClientRepository({ pool });
  const page = await repository.listPage({ principal, status: "active", limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, { createdAt: "2026-09-30T00:00:00Z", id: "c2" });
  assert.match(pool.calls[0].sql, /ORDER BY created_at DESC, id DESC/);
  assert.match(pool.calls[0].sql, /LIMIT \$3/);
  assert.equal(pool.calls[0].params.at(-1), 3);
});

test("client list caps page size", async () => {
  const pool = poolFixture([]);
  const repository = new ClientRepository({ pool });
  await repository.listPage({ principal, limit: 9999 });
  assert.equal(pool.calls[0].params.at(-1), MAX_PAGE_SIZE + 1);
});

test("client repository rejects missing trusted principal", async () => {
  const repository = new ClientRepository({ pool: poolFixture([]) });
  await assert.rejects(() => repository.get({ principal: null, clientId: "client-1" }), /Trusted principal/);
});
