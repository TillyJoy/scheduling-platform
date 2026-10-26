const test = require("node:test");
const assert = require("node:assert/strict");
const { IdentityService } = require("../src/services/identityService");
const { IdentityRepository } = require("../src/repositories/identityRepository");

test("identity service resolves only through the trusted repository and tenant context", async () => {
  const calls = [];
  const identityRepository = {
    async resolvePrincipal(args) {
      calls.push(args);
      return {
        userId: args.userId,
        organizationId: args.organizationId,
        permissions: ["appointment:read"]
      };
    },
    async resolveExternalIdentity(args) {
      calls.push(args);
      return { userId: "mapped-user", organizationId: args.organizationId, permissions: ["job:read"] };
    }
  };
  const transaction = async (principal, action, work) => {
    calls.push({ transactionPrincipal: principal, action });
    return work({ query: async () => ({ rows: [] }) });
  };
  const service = new IdentityService({ identityRepository, transaction });

  const principal = await service.resolvePrincipal({
    userId: "user-1",
    organizationId: "org-1",
    permissions: ["admin:*"]
  });
  assert.deepEqual(principal.permissions, ["appointment:read"]);
  assert.equal(calls[0].transactionPrincipal.organizationId, "org-1");
  assert.equal(calls[0].action, "identity.resolve_principal");

  const external = await service.resolveExternalIdentity({
    provider: "clerk",
    issuer: "https://issuer.example",
    subject: "subject-123",
    organizationId: "org-1"
  });
  assert.equal(external.userId, "mapped-user");
  assert.deepEqual(external.permissions, ["job:read"]);
  assert.equal(calls[3].subject, "subject-123");
});

test("identity service fails closed for incomplete identity and membership context", async () => {
  let transactionCalls = 0;
  const service = new IdentityService({
    identityRepository: {
      resolvePrincipal: async () => null,
      resolveExternalIdentity: async () => null
    },
    transaction: async (_principal, _action, work) => {
      transactionCalls += 1;
      return work({});
    }
  });
  assert.equal(await service.resolvePrincipal({ userId: "unknown", organizationId: "org-a" }), null);
  assert.equal(await service.resolvePrincipal({ userId: "known" }), null);
  assert.equal(await service.resolveExternalIdentity({ provider: "clerk", issuer: "issuer", subject: "unknown", organizationId: "org-a" }), null);
  assert.equal(transactionCalls, 2);
});

test("identity repository uses exact external identity tuple and derives permissions from active roles", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM external_identities")) return { rows: [{ user_id: "user-1" }] };
      return { rows: [{
        user_id: "user-1",
        user_status: "active",
        organization_id: "org-a",
        membership_status: "active",
        permissions: ["resource:read"]
      }] };
    }
  };
  const repository = new IdentityRepository({ pool });
  const principal = await repository.resolveExternalIdentity({
    provider: "clerk",
    issuer: "https://issuer.example",
    subject: "subject-1",
    organizationId: "org-a"
  });
  assert.deepEqual(calls[0].params, ["clerk", "https://issuer.example", "subject-1"]);
  assert.match(calls[0].sql, /u.status = 'active'/);
  assert.deepEqual(calls[1].params, ["user-1", "org-a"]);
  assert.match(calls[1].sql, /role_permissions/);
  assert.deepEqual(principal.permissions, ["resource:read"]);
});

test("identity repository rejects missing or inactive users and memberships", async () => {
  const pool = { query: async () => ({ rows: [{
    user_id: "user-1",
    user_status: "inactive",
    organization_id: "org-a",
    membership_status: "active",
    permissions: ["organization:update"]
  }] }) };
  const repository = new IdentityRepository({ pool });
  assert.equal(await repository.resolvePrincipal({ userId: "user-1", organizationId: "org-a" }), null);
  assert.equal(await repository.resolvePrincipal({ userId: "user-1" }), null);
});
