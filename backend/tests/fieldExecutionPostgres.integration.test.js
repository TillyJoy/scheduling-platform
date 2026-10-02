const test = require("node:test");
const assert = require("node:assert/strict");

if (!process.env.DATABASE_URL || process.env.RUN_POSTGRES_TESTS !== "1") {
  test("PostgreSQL field execution integration tests require RUN_POSTGRES_TESTS=1 and DATABASE_URL", { skip: true }, () => {});
} else {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { FieldVisitRepository } = require("../src/repositories/fieldVisitRepository");
  const { ActualWorkRepository } = require("../src/repositories/actualWorkRepository");
  const { FieldExecutionOperationRepository } = require("../src/repositories/fieldExecutionOperationRepository");
  const { FieldVisitService } = require("../src/services/fieldVisitService");
  const { ActualWorkService } = require("../src/services/actualWorkService");
  const { FieldExecutionSyncService } = require("../src/services/fieldExecutionSyncService");
  const { JobService } = require("../src/services/jobService");
  const { WorkOrderService } = require("../src/services/workOrderService");

  test("durable field execution survives service instances and offline replay", async t => {
    const pool = createDatabasePool();
    t.after(() => pool.end());
    await runMigrations(pool);

    const organizationId = "postgres-field-execution-test";
    const principal = {
      userId: "worker-1",
      organizationId,
      permissions: [
        "fieldVisit:create", "fieldVisit:read", "fieldVisit:update",
        "actualWork:create", "actualWork:read", "fieldExecution:sync",
        "workOrder:create"
      ]
    };

    await withTransaction(pool, { organizationId, userId: principal.userId, action: "test.seed" }, async db => {
      await db.query("INSERT INTO organizations(id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [organizationId, "Postgres Field Execution Test"]);
    });

    const jobService = new JobService({ authorize: () => true });
    const workOrderService = new WorkOrderService({ jobService });
    jobService.create({ principal, id: "job-pg-1", organizationId, title: "Durable field execution" });
    workOrderService.create({ principal, id: "wo-pg-1", organizationId, jobId: "job-pg-1" });

    const appointmentStore = new Map([
      [JSON.stringify([organizationId, "appointment-pg-1"]), {
        id: "appointment-pg-1", organizationId, workOrderId: "wo-pg-1", memberIds: ["resource-pg-1"]
      }]
    ]);

    const fieldVisitRepository = new FieldVisitRepository({ pool });
    const actualWorkRepository = new ActualWorkRepository({ pool });
    const operationRepository = new FieldExecutionOperationRepository({ pool });
    const transaction = (p, action, work) => withTransaction(pool, { organizationId: p.organizationId, userId: p.userId, action }, work);

    const makeServices = () => {
      const fieldVisitService = new FieldVisitService({
        appointmentStore, workOrderService, fieldVisitRepository, transaction
      });
      const actualWorkService = new ActualWorkService({
        fieldVisitRepository, actualWorkRepository, transaction
      });
      const syncService = new FieldExecutionSyncService({
        fieldVisitService, actualWorkService, operationRepository, transaction
      });
      return { fieldVisitService, actualWorkService, syncService };
    };

    const first = makeServices();
    const create = await first.syncService.sync({
      principal,
      operations: [{
        operationId: "op-pg-create",
        operationType: "fieldVisit.create",
        actorUserId: principal.userId,
        deviceId: "device-pg-1",
        capturedAt: "2026-10-02T10:00:05Z",
        occurredAt: "2026-10-02T10:00:00Z",
        expectedVersion: null,
        payload: {
          id: "visit-pg-1",
          appointmentId: "appointment-pg-1",
          workOrderId: "wo-pg-1",
          statusCode: "scheduled"
        }
      }]
    });
    assert.equal(create[0].status, "applied");

    const second = makeServices();
    const persisted = await second.fieldVisitService.get({ principal, fieldVisitId: "visit-pg-1" });
    assert.equal(persisted.id, "visit-pg-1");
    assert.equal(persisted.version, 1);

    const duplicate = await second.syncService.sync({
      principal,
      operations: [{
        operationId: "op-pg-create",
        operationType: "fieldVisit.create",
        actorUserId: principal.userId,
        deviceId: "device-pg-1",
        capturedAt: "2026-10-02T10:00:05Z",
        occurredAt: "2026-10-02T10:00:00Z",
        expectedVersion: null,
        payload: {
          id: "visit-pg-1",
          appointmentId: "appointment-pg-1",
          workOrderId: "wo-pg-1",
          statusCode: "scheduled"
        }
      }]
    });
    assert.equal(duplicate[0].status, "duplicate");

    const arrived = await second.syncService.sync({
      principal,
      operations: [{
        operationId: "op-pg-arrive",
        operationType: "fieldVisit.arrive",
        actorUserId: principal.userId,
        deviceId: "device-pg-1",
        capturedAt: "2026-10-02T10:05:05Z",
        occurredAt: "2026-10-02T10:05:00Z",
        fieldVisitId: "visit-pg-1",
        expectedVersion: 1,
        payload: { statusCode: "arrived" }
      }]
    });
    assert.equal(arrived[0].status, "applied", JSON.stringify(arrived[0]));

    const work = await second.actualWorkService.create({
      principal,
      id: "actual-pg-1",
      fieldVisitId: "visit-pg-1",
      workOrderId: "wo-pg-1",
      resourceId: "resource-pg-1",
      description: "Durable actual work",
      actualStartTime: "2026-10-02T10:10:00Z",
      actualEndTime: "2026-10-02T10:45:00Z",
      quantity: 1,
      unit: "unit"
    });
    assert.equal(work.id, "actual-pg-1");

    const third = makeServices();
    const durableWork = await third.actualWorkService.get({ principal, actualWorkId: "actual-pg-1" });
    assert.equal(durableWork.description, "Durable actual work");

    const stale = await third.syncService.sync({
      principal,
      operations: [{
        operationId: "op-pg-stale",
        operationType: "fieldVisit.start",
        actorUserId: principal.userId,
        deviceId: "device-pg-1",
        capturedAt: "2026-10-02T10:20:05Z",
        occurredAt: "2026-10-02T10:20:00Z",
        fieldVisitId: "visit-pg-1",
        expectedVersion: 1,
        payload: { statusCode: "in_progress" }
      }]
    });
    assert.equal(stale[0].status, "conflict");
    assert.equal(stale[0].conflictType, "state_version");

    const mismatch = await third.syncService.sync({
      principal,
      operations: [{
        operationId: "op-pg-create",
        operationType: "fieldVisit.create",
        actorUserId: principal.userId,
        deviceId: "device-pg-1",
        capturedAt: "2026-10-02T10:00:05Z",
        occurredAt: "2026-10-02T10:00:00Z",
        expectedVersion: null,
        payload: {
          id: "visit-pg-1",
          appointmentId: "appointment-pg-1",
          workOrderId: "wo-pg-1",
          statusCode: "tampered"
        }
      }]
    });
    assert.equal(mismatch[0].status, "conflict");
    assert.equal(mismatch[0].conflictType, "operation_payload_mismatch");
  });
}
