const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const shouldRun = process.env.DATABASE_URL && process.env.RUN_POSTGRES_TESTS === "1";

test("durable Resource / Qualification / Availability persistence is tenant-safe, auditable, and transactional", { skip: !shouldRun }, async t => {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { ResourceRepository } = require("../src/repositories/resourceRepository");
  const { QualificationRepository } = require("../src/repositories/qualificationRepository");
  const { ResourceQualificationRepository } = require("../src/repositories/resourceQualificationRepository");
  const { AvailabilityRepository } = require("../src/repositories/availabilityRepository");
  const { ResourceService } = require("../src/services/resourceService");
  const { QualificationService } = require("../src/services/qualificationService");
  const { ResourceQualificationService } = require("../src/services/resourceQualificationService");
  const { AvailabilityService } = require("../src/services/availabilityService");

  const pool = createDatabasePool();
  const suffix = randomUUID();
  const orgA = `resource-a-${suffix}`;
  const orgB = `resource-b-${suffix}`;
  const roleName = `resource_app_test_${suffix.replace(/[^a-zA-Z0-9_]/g, "_")}`;

  await runMigrations(pool);

  const permissions = [
    "resource:create", "resource:read", "resource:update",
    "qualification:create", "qualification:read", "qualification:update",
    "resourceQualification:create", "resourceQualification:read", "resourceQualification:update",
    "availability:create", "availability:read", "availability:update"
  ];
  const principalA = { userId: `user-a-${suffix}`, organizationId: orgA, permissions };
  const principalB = { userId: `user-b-${suffix}`, organizationId: orgB, permissions };

  const transaction = (principal, action, work) =>
    withTransaction(pool, { organizationId: principal.organizationId, userId: principal.userId, action }, async db => {
      await db.query(`SET LOCAL ROLE "${roleName}"`);
      return work(db);
    });

  const resourceRepository = new ResourceRepository({ pool });
  const qualificationRepository = new QualificationRepository({ pool });
  const resourceQualificationRepository = new ResourceQualificationRepository({ pool });
  const availabilityRepository = new AvailabilityRepository({ pool });
  const resourceService = new ResourceService({ resourceRepository, transaction });
  const qualificationService = new QualificationService({ qualificationRepository, transaction });
  const resourceQualificationService = new ResourceQualificationService({
    resourceQualificationRepository, resourceRepository, qualificationRepository, transaction
  });
  const availabilityService = new AvailabilityService({ availabilityRepository, resourceRepository, transaction });

  const cleanup = async () => {
    for (const organizationId of [orgA, orgB]) {
      await withTransaction(pool, { organizationId, userId: `cleanup-${suffix}`, action: "test.cleanup" }, async db => {
        await db.query(`SET LOCAL ROLE "${roleName}"`);
        await db.query("DELETE FROM availability WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM resource_qualifications WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM qualifications WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM resources WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM audit_events WHERE organization_id=$1", [organizationId]);
      }).catch(() => {});
    }
    try {
      await pool.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
          EXECUTE 'DROP OWNED BY "${roleName}"';
          EXECUTE 'DROP ROLE "${roleName}"';
        END IF;
      END $$;`);
    } finally {
      await pool.end();
    }
  };
  t.after(cleanup);

  await pool.query("INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)", [
    orgA, "Resource Test A", orgB, "Resource Test B"
  ]);
  await pool.query(`CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, resources, qualifications, resource_qualifications, availability TO "${roleName}"`);
  await pool.query(`GRANT SELECT, INSERT ON audit_events TO "${roleName}"`);

  const resourceA = await resourceService.create({
    principal: principalA, id: "resource-1", name: "Resource One", resourceType: "person",
    role: "field-specialist", capabilities: ["inspection"], statusCode: "available", active: true,
    geographicRestrictions: { zones: ["zone-a"] }, serviceRestrictions: { blocked: ["service-x"] },
    metadata: { externalKey: "r1" }
  });
  const resourceB = await resourceService.create({ principal: principalB, id: "resource-1", name: "Other Tenant Resource" });
  const resourceBOnly = await resourceService.create({ principal: principalB, id: "resource-b", name: "Other Tenant Resource B" });
  assert.equal(resourceA.id, resourceB.id);
  assert.equal(resourceB.organizationId, orgB);
  assert.equal((await resourceService.list({ principal: principalA })).length, 1);

  const updatedResource = await resourceService.update({
    principal: principalA, id: "resource-1", name: "Resource One Updated", resourceType: "person",
    role: "field-specialist", capabilities: ["inspection", "verification"], statusCode: "active",
    active: true, geographicRestrictions: { zones: ["zone-a", "zone-b"] },
    serviceRestrictions: {}, metadata: { externalKey: "r1", version: 2 }
  });
  assert.equal(updatedResource.name, "Resource One Updated");

  const qualificationA = await qualificationService.create({
    principal: principalA, qualificationId: "qualification-1", code: "CERT-001",
    name: "Certification", description: "Reusable qualification definition",
    statusCode: "configured", metadata: { renewalMonths: 24 }
  });
  const qualificationB = await qualificationService.create({
    principal: principalB, qualificationId: "qualification-1", code: "CERT-001", name: "Other Tenant Certification"
  });
  const qualificationBOnly = await qualificationService.create({
    principal: principalB, qualificationId: "qualification-b", code: "CERT-B", name: "Other Tenant Qualification"
  });
  assert.equal(qualificationA.qualificationId, qualificationB.qualificationId);
  assert.equal(qualificationBOnly.organizationId, orgB);

  const updatedQualification = await qualificationService.update({
    principal: principalA, qualificationId: "qualification-1", code: "CERT-001",
    name: "Certification Updated", description: "Updated definition", statusCode: "active",
    metadata: { renewalMonths: 12 }
  });
  assert.equal(updatedQualification.name, "Certification Updated");

  await assert.rejects(
    () => qualificationService.create({ principal: principalA, qualificationId: "qualification-2", code: "CERT-001", name: "Duplicate Code" }),
    /duplicate|unique/i
  );

  const resourceQualification = await resourceQualificationService.create({
    principal: principalA, resourceQualificationId: "rq-1", resourceId: "resource-1", qualificationId: "qualification-1",
    serviceRef: "service-opaque-1", statusCode: "pending_review",
    effectiveAt: "2026-01-01T00:00:00Z", expirationAt: "2027-01-01T00:00:00Z",
    restrictions: { geography: "zone-a" }, verificationStatus: "verified",
    verificationMetadata: { method: "document_review" }, verifiedAt: "2026-01-02T12:00:00Z",
    verifierRef: "user-verifier-1", evidenceRefs: ["document-1"]
  });
  assert.equal(resourceQualification.serviceRef, "service-opaque-1");
  assert.equal(resourceQualification.statusCode, "pending_review");
  assert.equal(resourceQualification.expirationAt.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.deepEqual(resourceQualification.restrictions, { geography: "zone-a" });

  const updatedResourceQualification = await resourceQualificationService.update({
    principal: principalA, resourceQualificationId: "rq-1", resourceId: "resource-1",
    qualificationId: "qualification-1", serviceRef: "service-opaque-1", statusCode: "active",
    effectiveAt: "2026-01-01T00:00:00Z", expirationAt: "2027-06-01T00:00:00Z",
    restrictions: { geography: "zone-b" }, verificationStatus: "verified",
    verificationMetadata: { method: "document_review", reviewer: "user-verifier-1" },
    verifiedAt: "2026-01-03T12:00:00Z", verifierRef: "user-verifier-1", evidenceRefs: ["document-1", "document-2"]
  });
  assert.equal(updatedResourceQualification.statusCode, "active");
  assert.equal(updatedResourceQualification.expirationAt.toISOString(), "2027-06-01T00:00:00.000Z");

  assert.equal((await resourceQualificationService.list({ principal: principalA, resourceId: "resource-1", serviceRef: "service-opaque-1" })).length, 1);

  await assert.rejects(
    () => resourceQualificationService.create({
      principal: principalA, resourceQualificationId: "rq-invalid", resourceId: "resource-1",
      qualificationId: "qualification-1", effectiveAt: "2027-01-01T00:00:00Z", expirationAt: "2026-12-31T23:59:59Z"
    }),
    /expirationAt must be after effectiveAt/
  );

  await assert.rejects(
    () => resourceQualificationService.create({
      principal: principalA, resourceQualificationId: "rq-cross-resource", resourceId: "resource-b",
      qualificationId: "qualification-1", serviceRef: "service-opaque-1"
    }),
    /Resource not found/i
  );

  await assert.rejects(
    () => resourceQualificationService.create({
      principal: principalA, resourceQualificationId: "rq-cross-qualification", resourceId: "resource-1",
      qualificationId: "qualification-b", serviceRef: "service-opaque-1"
    }),
    /Qualification not found/i
  );

  const availability = await availabilityService.create({
    principal: principalA, id: "availability-1", resourceId: "resource-1",
    startTime: "2026-10-05T09:00:00Z", endTime: "2026-10-05T12:00:00Z",
    zoneId: "zone-a", available: true
  });
  assert.equal(availability.zoneId, "zone-a");

  const updatedAvailability = await availabilityService.update({
    principal: principalA, id: "availability-1", resourceId: "resource-1",
    startTime: "2026-10-05T10:00:00Z", endTime: "2026-10-05T13:00:00Z",
    zoneId: "zone-b", available: false
  });
  assert.equal(updatedAvailability.available, false);
  assert.equal(updatedAvailability.zoneId, "zone-b");

  assert.equal((await resourceQualificationService.list({ principal: principalA })).length, 1);
  assert.equal((await availabilityService.list({ principal: principalA, resourceId: "resource-1" })).length, 1);

  const isolated = await transaction(principalB, "test.isolation", async db => {
    const resources = await db.query("SELECT id FROM resources ORDER BY id");
    const qualifications = await db.query("SELECT qualification_id FROM qualifications ORDER BY qualification_id");
    const resourceQualifications = await db.query("SELECT resource_qualification_id FROM resource_qualifications");
    const availabilityRows = await db.query("SELECT id FROM availability");
    return { resources: resources.rows, qualifications: qualifications.rows, resourceQualifications: resourceQualifications.rows, availability: availabilityRows.rows };
  });
  assert.deepEqual(isolated.resources.map(row => row.id).sort(), ["resource-1", "resource-b"]);
  assert.deepEqual(isolated.qualifications.map(row => row.qualification_id).sort(), ["qualification-1", "qualification-b"]);
  assert.deepEqual(isolated.resourceQualifications, []);
  assert.deepEqual(isolated.availability, []);

  const audit = await transaction(principalA, "test.audit", db =>
    db.query(`SELECT action, entity_type, entity_id FROM audit_events WHERE organization_id=$1 ORDER BY created_at, id`, [orgA])
  );
  const actions = audit.rows.map(row => row.action);
  assert.ok(actions.includes("resource.created"));
  assert.ok(actions.includes("resource.updated"));
  assert.ok(actions.includes("qualification.created"));
  assert.ok(actions.includes("resource-qualification.created"));
  assert.ok(actions.includes("availability.created"));
  assert.ok(audit.rows.every(row => ["resource", "qualification", "resource_qualification", "availability"].includes(row.entity_type)));

  const countsBeforeRollback = await transaction(principalA, "test.rollback-count", async db => {
    const resources = await db.query("SELECT count(*)::int AS count FROM resources WHERE organization_id=$1", [orgA]);
    const audits = await db.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1", [orgA]);
    return { resources: resources.rows[0].count, audits: audits.rows[0].count };
  });

  await assert.rejects(
    () => transaction(principalA, "test.rollback", async db => {
      await resourceRepository.create({ principal: principalA, resource: { id: "rollback-resource", name: "Should Roll Back" }, db });
      throw new Error("force rollback");
    }),
    /force rollback/
  );

  const countsAfterRollback = await transaction(principalA, "test.rollback-count-after", async db => {
    const resources = await db.query("SELECT count(*)::int AS count FROM resources WHERE organization_id=$1", [orgA]);
    const audits = await db.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1", [orgA]);
    return { resources: resources.rows[0].count, audits: audits.rows[0].count };
  });
  assert.deepEqual(countsAfterRollback, countsBeforeRollback);

  await assert.rejects(
    () => transaction(principalA, "test.cross-tenant-direct-fk", db =>
      resourceQualificationRepository.create({
        principal: principalA,
        resourceQualification: {
          resourceQualificationId: "rq-direct-cross-tenant",
          resourceId: "resource-b",
          qualificationId: "qualification-1"
        },
        db
      })
    ),
    /foreign key|violates row-level security|not found/i
  );

  const schema = await pool.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('resources','qualifications','resource_qualifications','availability')
    ORDER BY table_name, ordinal_position`);
  assert.ok(schema.rows.some(row => row.table_name === "resources" && row.column_name === "metadata"));
  assert.ok(schema.rows.some(row => row.table_name === "qualifications" && row.column_name === "code"));
  assert.ok(schema.rows.some(row => row.table_name === "resource_qualifications" && row.column_name === "service_ref"));
  assert.ok(schema.rows.some(row => row.table_name === "availability" && row.column_name === "zone_id"));
});
