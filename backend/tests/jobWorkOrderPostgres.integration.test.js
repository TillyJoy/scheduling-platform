const test = require("node:test");
const assert = require("node:assert/strict");

if (!process.env.DATABASE_URL || process.env.RUN_POSTGRES_TESTS !== "1") {
  test("PostgreSQL Job / Work Order integration tests require RUN_POSTGRES_TESTS=1 and DATABASE_URL", { skip: true }, () => {});
} else {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { JobRepository } = require("../src/repositories/jobRepository");
  const { WorkOrderRepository } = require("../src/repositories/workOrderRepository");
  const { JobService } = require("../src/services/jobService");
  const { WorkOrderService } = require("../src/services/workOrderService");

  test("durable Job / Work Order persistence is tenant-isolated, transactional, auditable, and concurrency-safe", async t => {
    const pool = createDatabasePool();
    const suffix = `${process.pid}-${Date.now()}`;
    const orgA = `job-wo-a-${suffix}`;
    const orgB = `job-wo-b-${suffix}`;
    const roleName = `job_wo_app_test_${suffix.replace(/[^a-zA-Z0-9_]/g, "_")}`;

    await runMigrations(pool);

    const cleanup = async () => {
      for (const organizationId of [orgA, orgB]) {
        await withTransaction(pool, { organizationId, userId: "cleanup", action: "test.cleanup" }, async db => {
          await db.query(`SET LOCAL ROLE "${roleName}"`);
          await db.query("DELETE FROM work_orders WHERE organization_id = $1", [organizationId]);
          await db.query("DELETE FROM jobs WHERE organization_id = $1", [organizationId]);
          await db.query("DELETE FROM clients WHERE organization_id = $1", [organizationId]);
        }).catch(() => {});
      }
      try {
        await pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN EXECUTE 'DROP OWNED BY "${roleName}"'; EXECUTE 'DROP ROLE "${roleName}"'; END IF; END $$;`);
      } finally {
        await pool.end();
      }
    };

    t.after(cleanup);

    await pool.query(`CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, clients, jobs, work_orders TO "${roleName}"`);
    await pool.query(`GRANT SELECT, INSERT ON audit_events TO "${roleName}"`);

    const appTransaction = (principal, action, work) =>
      withTransaction(pool, { organizationId: principal.organizationId, userId: principal.userId, action }, async db => {
        await db.query(`SET LOCAL ROLE "${roleName}"`);
        return work(db);
      });

    const principalA = {
      userId: "user-a",
      organizationId: orgA,
      permissions: ["job:create", "job:read", "workOrder:create", "workOrder:read"]
    };
    const principalB = {
      userId: "user-b",
      organizationId: orgB,
      permissions: ["job:create", "job:read", "workOrder:create", "workOrder:read"]
    };

    for (const [organizationId, name] of [[orgA, "Organization A"], [orgB, "Organization B"]]) {
      await appTransaction(
        organizationId === orgA ? principalA : principalB,
        "test.seed",
        async db => {
          await db.query(
            "INSERT INTO organizations(id, name) VALUES ($1, $2)",
            [organizationId, name]
          );
          await db.query(
            `INSERT INTO clients(id, organization_id, first_name, last_name, status)
             VALUES ($1, $2, $3, $4, 'active')`,
            [`client-${organizationId}`, organizationId, "Test", "Client"]
          );
        }
      );
    }

    const transaction = (principal, action, work) => appTransaction(principal, action, work);
    const jobRepository = new JobRepository({ pool });
    const workOrderRepository = new WorkOrderRepository({ pool });
    const jobService = new JobService({ jobRepository, transaction });
    const workOrderService = new WorkOrderService({ workOrderRepository, transaction, jobService });

    const job = await jobService.create({
      principal: principalA,
      id: "job-1",
      title: "Durable Job",
      clientId: `client-${orgA}`,
      serviceIds: ["service-a"],
      statusCode: "ready"
    });
    assert.equal(job.id, "job-1");
    assert.equal(job.statusCode, "ready");

    const persistedJob = new JobService({ jobRepository, transaction });
    assert.equal((await persistedJob.get({ principal: principalA, jobId: "job-1" })).title, "Durable Job");

    const firstOrder = await workOrderService.create({
      principal: principalA,
      id: "wo-1",
      jobId: "job-1",
      title: "First planned work",
      statusCode: "planned"
    });
    assert.equal(firstOrder.number, "WO-1");
    assert.equal(firstOrder.statusCode, "planned");

    const manualOrder = await workOrderService.create({
      principal: principalA,
      id: "wo-manual",
      jobId: "job-1",
      number: "CUSTOM-2026-0002"
    });
    assert.equal(manualOrder.number, "CUSTOM-2026-0002");

    const otherJob = await jobService.create({
      principal: principalB,
      id: "job-1-from-b",
      title: "Other tenant job",
      clientId: `client-${orgB}`
    });
    assert.equal(otherJob.id, "job-1");

    const otherOrder = await workOrderService.create({
      principal: principalB,
      id: "wo-1",
      jobId: "job-1"
    });
    assert.equal(otherOrder.number, "WO-1");

    await assert.rejects(
      () => workOrderService.create({
        principal: principalA,
        id: "wo-cross",
        jobId: "job-1-from-b",
        number: "WO-CROSS"
      }),
      /Job not found/
    );

    const concurrent = await Promise.all([
      workOrderService.create({ principal: principalA, id: "wo-2", jobId: "job-1" }),
      workOrderService.create({ principal: principalA, id: "wo-3", jobId: "job-1" })
    ]);
    assert.deepEqual(new Set(concurrent.map(order => order.number)), new Set(["WO-2", "WO-3"]));

    await assert.rejects(
      () => workOrderService.create({
        principal: principalA,
        id: "wo-duplicate-number",
        jobId: "job-1",
        number: "CUSTOM-2026-0002"
      }),
      /Work order number already exists/
    );

    const afterDuplicate = await workOrderService.list({ principal: principalA, jobId: "job-1" });
    assert.equal(afterDuplicate.length, 4);

    await assert.rejects(
      () => jobService.create({
        principal: principalA,
        id: "job-missing-client",
        title: "Invalid client",
        clientId: `client-${orgB}`
      }),
      /foreign key/i
    );

    const audit = await appTransaction(principalA, "test.audit-read", db => db.query(
      `SELECT action, entity_type, entity_id
       FROM audit_events
       WHERE organization_id = $1 AND entity_id IN ('job-1','wo-1','wo-manual','wo-2','wo-3')
       ORDER BY created_at, id`,
      [orgA]
    ));
    const actions = audit.rows.map(row => row.action);
    assert.equal(actions.filter(action => action === "job.created").length, 1);
    assert.equal(actions.filter(action => action === "work-order.created").length, 4);
    assert.ok(audit.rows.every(row => row.entity_type === "job" || row.entity_type === "work_order"));

    const isolated = await appTransaction(principalB, "test.isolation", async db => {
      const jobs = await db.query("SELECT id FROM jobs ORDER BY id");
      const orders = await db.query("SELECT id, number FROM work_orders ORDER BY id");
      const clients = await db.query("SELECT id FROM clients ORDER BY id");
      return { jobs: jobs.rows, orders: orders.rows, clients: clients.rows };
    });
    assert.deepEqual(isolated.jobs.map(row => row.id), ["job-1"]);
    assert.deepEqual(isolated.orders.map(row => row.id), ["wo-1"]);
    assert.deepEqual(isolated.clients.map(row => row.id), [`client-${orgB}`]);

    const countsBeforeFailure = await appTransaction(principalA, "test.count-before-failure", async db => {
      const jobs = await db.query("SELECT count(*)::int AS count FROM jobs WHERE organization_id = $1", [orgA]);
      const orders = await db.query("SELECT count(*)::int AS count FROM work_orders WHERE organization_id = $1", [orgA]);
      const audits = await db.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id = $1", [orgA]);
      return { jobs: jobs.rows[0].count, orders: orders.rows[0].count, audits: audits.rows[0].count };
    });

    await assert.rejects(
      () => workOrderService.create({
        principal: principalA,
        id: "wo-rollback",
        jobId: "job-1",
        number: "CUSTOM-2026-0002"
      }),
      /Work order number already exists/
    );

    const countsAfterFailure = await appTransaction(principalA, "test.count-after-failure", async db => {
      const jobs = await db.query("SELECT count(*)::int AS count FROM jobs WHERE organization_id = $1", [orgA]);
      const orders = await db.query("SELECT count(*)::int AS count FROM work_orders WHERE organization_id = $1", [orgA]);
      const audits = await db.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id = $1", [orgA]);
      return { jobs: jobs.rows[0].count, orders: orders.rows[0].count, audits: audits.rows[0].count };
    });
    assert.deepEqual(countsAfterFailure, countsBeforeFailure);

    const schema = await pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('jobs','work_orders')
       ORDER BY table_name, ordinal_position`
    );
    assert.ok(schema.rows.some(row => row.table_name === "jobs" && row.column_name === "status_code"));
    assert.ok(schema.rows.some(row => row.table_name === "work_orders" && row.column_name === "status_code"));
    assert.equal(schema.rows.some(row => row.table_name === "work_orders" && row.column_name === "job_number"), false);
  });
}
