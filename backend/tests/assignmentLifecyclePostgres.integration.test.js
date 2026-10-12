const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const http = require("node:http");

const shouldRun = process.env.DATABASE_URL && process.env.RUN_POSTGRES_TESTS === "1";

test("durable assignment status lifecycle enforces configured transitions and atomically records audit/events", { skip: !shouldRun }, async t => {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { AssignmentRepository } = require("../src/repositories/assignmentRepository");
  const { ResourceRepository } = require("../src/repositories/resourceRepository");
  const { JobRepository } = require("../src/repositories/jobRepository");
  const { WorkOrderRepository } = require("../src/repositories/workOrderRepository");
  const { StatusConfigurationRepository } = require("../src/repositories/statusConfigurationRepository");
  const { StatusConfigurationService } = require("../src/services/statusConfigurationService");
  const { AssignmentService } = require("../src/services/assignmentService");
  const { AuthenticationService } = require("../src/services/authenticationService");
  const { createAppState, createHandler } = require("../src/app");

  const pool = createDatabasePool();
  await runMigrations(pool);
  const suffix = randomUUID();
  const orgA = `assignment-lifecycle-a-${suffix}`;
  const orgB = `assignment-lifecycle-b-${suffix}`;
  const roleName = `assignment_lifecycle_${suffix.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const permissions = [
    "assignment:create", "assignment:read", "assignment:update",
    "status:create", "status:read", "status:update", "status:transition"
  ];
  const principalA = { userId: `user-a-${suffix}`, organizationId: orgA, permissions };
  const principalB = { userId: `user-b-${suffix}`, organizationId: orgB, permissions };
  const transaction = (principal, action, work) => withTransaction(pool, {
    organizationId: principal.organizationId, userId: principal.userId, action
  }, async db => {
    await db.query(`SET LOCAL ROLE "${roleName}"`);
    return work(db);
  });

  const assignmentRepository = new AssignmentRepository({ pool });
  const statusConfigurationRepository = new StatusConfigurationRepository({ pool });
  const statusConfigurationService = new StatusConfigurationService({
    repository: statusConfigurationRepository,
    transaction
  });
  const assignmentService = new AssignmentService({
    assignmentRepository,
    resourceRepository: new ResourceRepository({ pool }),
    jobRepository: new JobRepository({ pool }),
    workOrderRepository: new WorkOrderRepository({ pool }),
    transaction,
    statusConfigurationService
  });

  const cleanup = async () => {
    await pool.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
        EXECUTE 'DROP OWNED BY "${roleName}"';
        EXECUTE 'DROP ROLE "${roleName}"';
      END IF;
    END $$;`).catch(() => {});
    await pool.end();
  };
  t.after(cleanup);

  await pool.query("INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)", [
    orgA, "Assignment Lifecycle A", orgB, "Assignment Lifecycle B"
  ]);
  await pool.query(
    `INSERT INTO resources(id,organization_id,name,resource_type)
     VALUES ($1,$2,'Resource A','person'),($3,$4,'Resource B','person')`,
    [`resource-${suffix}`, orgA, `resource-${suffix}`, orgB]
  );
  await pool.query(
    `INSERT INTO jobs(id,organization_id,title) VALUES ($1,$2,'Job A'),($3,$4,'Job B')`,
    [`job-a-${suffix}`, orgA, `job-b-${suffix}`, orgB]
  );
  await pool.query(`CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, resources, jobs, work_orders, assignments, status_definitions, status_transitions, audit_events, domain_events, event_outbox TO "${roleName}"`);

  for (const [code, category, terminal] of [
    ["scheduled", "active", false],
    ["cancelled", "cancelled", false],
    ["completed", "completed", true]
  ]) {
    await statusConfigurationService.createStatus({
      principal: principalA,
      id: `${code}-${suffix}`,
      organizationId: orgA,
      entityType: "assignment",
      code,
      label: code[0].toUpperCase() + code.slice(1),
      category,
      initial: code === "scheduled",
      terminal
    });
  }
  await statusConfigurationService.setTransitions({
    principal: principalA, entityType: "assignment", fromCode: "scheduled", toCodes: ["cancelled", "completed"]
  });
  await statusConfigurationService.setTransitions({
    principal: principalA, entityType: "assignment", fromCode: "cancelled", toCodes: ["scheduled"]
  });
  assert.equal((await statusConfigurationService.listStatuses({ principal: principalB, entityType: "assignment" })).length, 0);

  const assignment = await assignmentService.create({
    principal: principalA,
    id: `assignment-${suffix}`,
    resourceId: `resource-${suffix}`,
    jobId: `job-a-${suffix}`,
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    statusCode: "scheduled"
  });
  assert.equal(assignment.statusCode, "scheduled");

  // The staff-facing workflow does not send statusCode. Durable creation should
  // apply the configured initial assignment status for the organization.
  const staffCreated = await assignmentService.create({
    principal: principalA,
    id: `staff-assignment-${suffix}`,
    resourceId: `resource-${suffix}`,
    jobId: `job-a-${suffix}`,
    startTime: "2026-10-01T11:00:00Z",
    endTime: "2026-10-01T12:00:00Z"
  });
  assert.equal(staffCreated.statusCode, "scheduled");

  await pool.query(`REVOKE INSERT ON event_outbox FROM "${roleName}"`);
  await assert.rejects(
    () => assignmentService.transitionStatus({
      principal: principalA, assignmentId: assignment.id,
      expectedStatusCode: "scheduled", statusCode: "cancelled"
    }),
    /permission denied/
  );
  const rolledBack = await assignmentRepository.get({ principal: principalA, assignmentId: assignment.id });
  assert.equal(rolledBack.statusCode, "scheduled");
  const noPartialEvents = await pool.query(
    `SELECT count(*)::int AS count FROM domain_events WHERE organization_id=$1 AND entity_id=$2`,
    [orgA, assignment.id]
  );
  assert.equal(noPartialEvents.rows[0].count, 0);
  await pool.query(`GRANT INSERT ON event_outbox TO "${roleName}"`);

  const cancelled = await assignmentService.transitionStatus({
    principal: principalA,
    assignmentId: assignment.id,
    expectedStatusCode: "scheduled",
    statusCode: "cancelled",
    reason: "customer request",
    metadata: { source: "test" }
  });
  assert.equal(cancelled.statusCode, "cancelled");

  const reloadedConfiguration = new StatusConfigurationService({
    repository: new StatusConfigurationRepository({ pool }), transaction
  });
  assert.deepEqual(
    (await reloadedConfiguration.getAllowedTransitions({
      principal: principalA, entityType: "assignment", fromCode: "cancelled"
    })).map(status => status.code),
    ["scheduled"]
  );
  assert.equal((await assignmentRepository.get({ principal: principalA, assignmentId: assignment.id })).statusCode, "cancelled");

  const overlapping = await assignmentService.create({
    principal: principalA,
    id: `overlap-${suffix}`,
    resourceId: `resource-${suffix}`,
    jobId: `job-a-${suffix}`,
    startTime: "2026-10-01T09:30:00Z",
    endTime: "2026-10-01T10:30:00Z",
    statusCode: "scheduled"
  });
  assert.equal(overlapping.statusCode, "scheduled");

  const authenticationService = new AuthenticationService({ secret: "assignment-lifecycle-test-secret-32-bytes-min" });
  const token = authenticationService.issueToken({ userId: principalA.userId, organizationId: orgA, permissions });
  const appState = createAppState({ databasePool: pool, authenticationService });
  const server = http.createServer(createHandler(appState, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1", port: server.address().port,
        method: "PATCH", path: `/api/assignments/${overlapping.id}/status`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      }, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      request.on("error", reject);
      request.end(JSON.stringify({ expectedStatusCode: "scheduled", statusCode: "completed", reason: "API route test" }));
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.statusCode, "completed");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  await assert.rejects(
    () => assignmentService.transitionStatus({
      principal: principalA, assignmentId: assignment.id,
      expectedStatusCode: "cancelled", statusCode: "scheduled"
    }),
    error => error.statusCode === 409 && /overlapping assignment/.test(error.message)
  );
  await assert.rejects(
    () => assignmentService.transitionStatus({
      principal: principalA, assignmentId: assignment.id,
      expectedStatusCode: "scheduled", statusCode: "completed"
    }),
    error => error.statusCode === 409 && /status changed/.test(error.message)
  );
  await assert.rejects(
    () => assignmentService.transitionStatus({
      principal: principalA, assignmentId: assignment.id,
      expectedStatusCode: "cancelled", statusCode: "unknown"
    }),
    error => error.statusCode === 409 && /not allowed/.test(error.message)
  );

  const records = await transaction(principalA, "test.lifecycle.evidence", async db => ({
    audit: await db.query(
      `SELECT action, previous_value, new_value FROM audit_events
       WHERE organization_id=$1 AND entity_id=$2 AND action='assignment.status.transitioned'`,
      [orgA, assignment.id]
    ),
    events: await db.query(
      `SELECT event_type, payload FROM domain_events WHERE organization_id=$1 AND entity_id=$2`,
      [orgA, assignment.id]
    ),
    outbox: await db.query(
      `SELECT event_type, status, payload FROM event_outbox WHERE organization_id=$1 AND payload->>'entityId'=$2`,
      [orgA, assignment.id]
    )
  }));
  assert.equal(records.audit.rowCount, 1);
  assert.equal(records.audit.rows[0].previous_value.statusCode, "scheduled");
  assert.equal(records.audit.rows[0].new_value.statusCode, "cancelled");
  assert.equal(records.events.rowCount, 1);
  assert.equal(records.events.rows[0].event_type, "assignment.status.changed");
  assert.equal(records.outbox.rowCount, 1);
  assert.equal(records.outbox.rows[0].status, "pending");
});
