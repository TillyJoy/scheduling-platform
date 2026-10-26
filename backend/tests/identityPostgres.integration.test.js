const test = require("node:test");
const assert = require("node:assert/strict");

if (!process.env.DATABASE_URL || process.env.RUN_POSTGRES_TESTS !== "1") {
  test("PostgreSQL identity integration tests require RUN_POSTGRES_TESTS=1 and DATABASE_URL", { skip: true }, () => {});
} else {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { IdentityRepository } = require("../src/repositories/identityRepository");
  const { IdentityService } = require("../src/services/identityService");

  test("identity resolution requires active user and membership and derives permissions from organization roles", async t => {
    const pool = createDatabasePool();
    const suffix = `${process.pid}-${Date.now()}`;
    const orgA = `identity-org-a-${suffix}`;
    const orgB = `identity-org-b-${suffix}`;
    const userId = `identity-user-${suffix}`;
    const unknownUserId = `identity-unknown-${suffix}`;
    const roleId = `identity-role-${suffix}`;
    const provider = "test-provider";
    const issuer = "https://identity.test.invalid";
    const subject = `subject-${suffix}`;
    const transaction = (p, action, work) => withTransaction(pool, {
      organizationId: p.organizationId, userId: p.userId, action
    }, work);
    const service = new IdentityService({
      identityRepository: new IdentityRepository({ pool }),
      transaction
    });

    t.after(async () => {
      try {
        for (const organizationId of [orgA, orgB]) {
          await withTransaction(pool, { organizationId, userId: "cleanup", action: "test.identity.cleanup" }, async db => {
            await db.query("DELETE FROM external_identities WHERE user_id = $1", [userId]);
            await db.query("DELETE FROM users WHERE id = $1", [userId]);
            await db.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
          });
        }
      } finally {
        await pool.end();
      }
    });

    await runMigrations(pool);
    await withTransaction(pool, { organizationId: orgA, userId: userId, action: "test.identity.seed" }, async db => {
      await db.query("INSERT INTO organizations(id, name) VALUES ($1, $2), ($3, $4)", [orgA, "Identity Test A", orgB, "Identity Test B"]);
      await db.query("INSERT INTO users(id, status) VALUES ($1, 'active'), ($2, 'active')", [userId, unknownUserId]);
      await db.query("INSERT INTO external_identities(provider, issuer, subject, user_id) VALUES ($1, $2, $3, $4)", [provider, issuer, subject, userId]);
      await db.query("INSERT INTO organization_memberships(organization_id, user_id, status) VALUES ($1, $2, 'active')", [orgA, userId]);
      await db.query("INSERT INTO organization_roles(organization_id, id, name) VALUES ($1, $2, $3)", [orgA, roleId, "Identity test role"]);
      await db.query("INSERT INTO membership_roles(organization_id, user_id, role_id) VALUES ($1, $2, $3)", [orgA, userId, roleId]);
      await db.query("INSERT INTO role_permissions(organization_id, role_id, permission_code) VALUES ($1, $2, $3)", [orgA, roleId, "resource:read"]);
    });

    const resolved = await service.resolvePrincipal({
      userId, organizationId: orgA, permissions: ["organization:update"]
    });
    assert.equal(resolved.userId, userId);
    assert.equal(resolved.organizationId, orgA);
    assert.deepEqual(resolved.permissions, ["resource:read"]);
    assert.equal(resolved.permissions.includes("organization:update"), false);

    const external = await service.resolveExternalIdentity({
      provider, issuer, subject, organizationId: orgA
    });
    assert.equal(external.userId, userId);
    assert.deepEqual(external.permissions, ["resource:read"]);

    assert.equal(await service.resolvePrincipal({ userId: unknownUserId, organizationId: orgA }), null);
    assert.equal(await service.resolvePrincipal({ userId, organizationId: orgB }), null);
    assert.equal(await service.resolveExternalIdentity({
      provider, issuer, subject: "unknown-subject", organizationId: orgA
    }), null);

    await withTransaction(pool, { organizationId: orgA, userId, action: "test.identity.deactivate" }, async db => {
      await db.query("UPDATE organization_memberships SET status = 'inactive' WHERE organization_id = $1 AND user_id = $2", [orgA, userId]);
    });
    assert.equal(await service.resolvePrincipal({ userId, organizationId: orgA }), null);
    assert.equal(await service.resolveExternalIdentity({ provider, issuer, subject, organizationId: orgA }), null);
  });
}
