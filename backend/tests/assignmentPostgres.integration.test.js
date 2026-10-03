const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const shouldRun = process.env.DATABASE_URL && process.env.RUN_POSTGRES_TESTS === "1";

test("durable Assignment persistence is tenant-safe, auditable, transactional, and concurrency-safe", { skip: !shouldRun }, async t => {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { AssignmentRepository } = require("../src/repositories/assignmentRepository");
  const { AssignmentService } = require("../src/services/assignmentService");
  const { ResourceRepository } = require("../src/repositories/resourceRepository");
  const { JobRepository } = require("../src/repositories/jobRepository");
  const { WorkOrderRepository } = require("../src/repositories/workOrderRepository");

  const pool = createDatabasePool();
  const suffix = randomUUID();
  const orgA = `assignment-a-${suffix}`;
  const orgB = `assignment-b-${suffix}`;
  const roleName = `assignment_app_test_${suffix.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const permissions = ["assignment:create", "assignment:read"];

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE version = '007' LIMIT 1"
    ).catch(() => ({ rowCount: 0 }));
    if (result.rowCount) break;
    if (attempt === 119) {
      throw new Error("Base durable migrations were not ready before Assignment migration setup");
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await runMigrations(pool);

  const principalA = { userId: `user-a-${suffix}`, organizationId: orgA, permissions };
  const principalB = { userId: `user-b-${suffix}`, organizationId: orgB, permissions };
  const transaction = (principal, action, work) =>
    withTransaction(pool, {
      organizationId: principal.organizationId,
      userId: principal.userId,
      action
    }, async db => {
      await db.query(`SET LOCAL ROLE "${roleName}"`);
      return work(db);
    });

  const resourceRepository = new ResourceRepository({ pool });
  const jobRepository = new JobRepository({ pool });
  const workOrderRepository = new WorkOrderRepository({ pool });
  const assignmentRepository = new AssignmentRepository({ pool });
  const statusResolver = ({ statusCode }) =>
    ({ active: { category: "active" }, cancelled: { category: "cancelled" } }[statusCode] || null);
  const assignmentService = new AssignmentService({
    assignmentRepository,
    resourceRepository,
    jobRepository,
    workOrderRepository,
    transaction,
    statusResolver
  });

  const cleanup = async () => {
    for (const organizationId of [orgA, orgB]) {
      await withTransaction(pool, {
        organizationId,
        userId: `cleanup-${suffix}`,
        action: "test.cleanup"
      }, async db => {
        await db.query(`SET LOCAL ROLE "${roleName}"`);
        await db.query("DELETE FROM assignments WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM work_orders WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM jobs WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM resources WHERE organization_id=$1", [organizationId]);
      }).catch(() => {});
    }
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [[orgA, orgB]]);
    await pool.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
        EXECUTE 'DROP OWNED BY "${roleName}"';
        EXECUTE 'DROP ROLE "${roleName}"';
      END IF;
    END $$;`);
    await pool.end();
  };
  t.after(cleanup);

  await pool.query(
    "INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)",
    [orgA, "Assignment Test A", orgB, "Assignment Test B"]
  );
  await pool.query(
    `INSERT INTO resources(id,organization_id,name,resource_type)
     VALUES ($1,$2,'Resource A','person'),($3,$4,'Resource B','person')`,
    ["resource-1", orgA, "resource-1", orgB]
  );
  await pool.query(
    `INSERT INTO jobs(id,organization_id,title) VALUES ($1,$2,'Job A'),($3,$4,'Job B')`,
    [`job-a-${suffix}`, orgA, `job-b-${suffix}`, orgB]
  );
  await pool.query(
    `INSERT INTO work_orders(id,organization_id,job_id,number,title)
     VALUES ($1,$2,$3,'WO-A','Work A'),($4,$5,$6,'WO-B','Work B')`,
    [`wo-a-${suffix}`, orgA, `job-a-${suffix}`, `wo-b-${suffix}`, orgB, `job-b-${suffix}`]
  );

  await pool.query(`CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  await pool.query("GRANT USAGE ON SCHEMA public TO \"" + roleName + "\"");
  await pool.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, resources, jobs, work_orders, assignments TO \"" +
      roleName + "\""
  );
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events TO \"" + roleName + "\"");

  const assignment = await assignmentService.create({
    principal: principalA,
    id: "assignment-1",
    resourceId: "resource-1",
    jobId: `job-a-${suffix}`,
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    statusCode: "active",
    metadata: { source: "test" }
  });
  assert.equal(assignment.organizationId, orgA);
  assert.equal(assignment.jobId, `job-a-${suffix}`);
  assert.equal(assignment.resourceId, "resource-1");

  const loaded = await assignmentService.get({ principal: principalA, assignmentId: "assignment-1" });
  assert.deepEqual(loaded.metadata, { source: "test" });

  const listedA = await assignmentService.list({ principal: principalA, resourceId: "resource-1" });
  assert.equal(listedA.length, 1);
  assert.equal((await assignmentService.list({ principal: principalB })).length, 0);

  const otherTenant = await assignmentService.create({
    principal: principalB,
    id: "assignment-1",
    resourceId: "resource-1",
    workOrderId: `wo-b-${suffix}`,
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    statusCode: "active"
  });
  assert.equal(otherTenant.organizationId, orgB);

  await assert.rejects(
    () => assignmentService.create({
      principal: principalA,
      id: "cross-resource",
      resourceId: "resource-1",
      jobId: `job-b-${suffix}`,
      startTime: "2026-10-01T11:00:00Z",
      endTime: "2026-10-01T12:00:00Z"
    }),
    /foreign key|violates row-level security|Job not found/
  );

  await assert.rejects(
    () => assignmentService.create({
      principal: principalA,
      id: "overlap",
      resourceId: "resource-1",
      workOrderId: `wo-a-${suffix}`,
      startTime: "2026-10-01T09:30:00Z",
      endTime: "2026-10-01T10:30:00Z",
      statusCode: "active"
    }),
    /overlapping assignment/
  );

  const cancelled = await assignmentService.create({
    principal: principalA,
    id: "cancelled",
    resourceId: "resource-1",
    workOrderId: `wo-a-${suffix}`,
    startTime: "2026-10-01T11:00:00Z",
    endTime: "2026-10-01T12:00:00Z",
    statusCode: "cancelled"
  });
  assert.equal(cancelled.statusCode, "cancelled");

  await assignmentService.create({
    principal: principalA,
    id: "after-cancel",
    resourceId: "resource-1",
    workOrderId: `wo-a-${suffix}`,
    startTime: "2026-10-01T11:30:00Z",
    endTime: "2026-10-01T12:30:00Z",
    statusCode: "active"
  });

  const concurrent = await Promise.allSettled([
    assignmentService.create({
      principal: principalA,
      id: "concurrent-a",
      resourceId: "resource-1",
      workOrderId: `wo-a-${suffix}`,
      startTime: "2026-10-01T13:00:00Z",
      endTime: "2026-10-01T14:00:00Z",
      statusCode: "active"
    }),
    assignmentService.create({
      principal: principalA,
      id: "concurrent-b",
      resourceId: "resource-1",
      workOrderId: `wo-a-${suffix}`,
      startTime: "2026-10-01T13:30:00Z",
      endTime: "2026-10-01T14:30:00Z",
      statusCode: "active"
    })
  ]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
  assert.match(concurrent.find(result => result.status === "rejected").reason.message, /overlapping assignment/);

  const audit = await transaction(principalA, "test.audit", db =>
    db.query(
      "SELECT action, entity_type, entity_id FROM audit_events WHERE organization_id=$1 AND entity_type='assignment' ORDER BY created_at,id",
      [orgA]
    )
  );
  assert.ok(audit.rows.some(row => row.action === "assignment.created"));
  assert.ok(audit.rows.every(row => row.entity_type === "assignment"));

  const countsBeforeRollback = await transaction(principalA, "test.rollback-count", async db => ({
    assignments: Number((await db.query("SELECT count(*) AS count FROM assignments WHERE organization_id=$1", [orgA])).rows[0].count),
    audits: Number((await db.query("SELECT count(*) AS count FROM audit_events WHERE organization_id=$1", [orgA])).rows[0].count)
  }));

  await assert.rejects(
    () => transaction(principalA, "test.rollback", async db => {
      await assignmentRepository.create({
        principal: principalA,
        assignment: {
          id: "rollback-assignment",
          resourceId: "resource-1",
          jobId: `job-a-${suffix}`,
          startTime: "2026-10-01T15:00:00Z",
          endTime: "2026-10-01T16:00:00Z"
        },
        db
      });
      throw new Error("force rollback");
    }),
    /force rollback/
  );

  const countsAfterRollback = await transaction(principalA, "test.rollback-count-after", async db => ({
    assignments: Number((await db.query("SELECT count(*) AS count FROM assignments WHERE organization_id=$1", [orgA])).rows[0].count),
    audits: Number((await db.query("SELECT count(*) AS count FROM audit_events WHERE organization_id=$1", [orgA])).rows[0].count)
  }));
  assert.deepEqual(countsAfterRollback, countsBeforeRollback);

  await assert.rejects(
    () => transaction(principalA, "test.rls-direct-cross-tenant", db =>
      assignmentRepository.create({
        principal: principalA,
        assignment: {
          id: "rls-cross-tenant",
          resourceId: "resource-1",
          jobId: `job-b-${suffix}`,
          startTime: "2026-10-01T16:00:00Z",
          endTime: "2026-10-01T17:00:00Z"
        },
        db
      })
    ),
    /foreign key|violates row-level security|Job not found/
  );

  await assert.rejects(
    () => transaction(principalA, "test.audit-mutation", db =>
      db.query("DELETE FROM audit_events WHERE organization_id=$1", [orgA])
    ),
    /audit events are append-only/
  );

  const schema = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='assignments'
    ORDER BY ordinal_position
  `);
  assert.ok(schema.rows.some(row => row.column_name === "resource_id"));
  assert.ok(schema.rows.some(row => row.column_name === "job_id"));
  assert.ok(schema.rows.some(row => row.column_name === "work_order_id"));
  assert.ok(schema.rows.some(row => row.column_name === "metadata"));
});
