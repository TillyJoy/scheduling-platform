const test = require("node:test");
const assert = require("node:assert/strict");
const { FieldExecutionSyncService } = require("../src/services/fieldExecutionSyncService");
const { FieldVisitService } = require("../src/services/fieldVisitService");
const { ActualWorkService } = require("../src/services/actualWorkService");
const { JobService } = require("../src/services/jobService");
const { WorkOrderService } = require("../src/services/workOrderService");

function fixture() {
  const principal = {
    userId: "worker-1",
    organizationId: "org-a",
    permissions: ["fieldVisit:create", "fieldVisit:read", "fieldVisit:update", "actualWork:create", "actualWork:read", "fieldExecution:sync", "workOrder:create"]
  };
  const jobService = new JobService({ authorize: () => true });
  const workOrderService = new WorkOrderService({ jobService });
  jobService.create({ principal, id: "job-1", organizationId: "org-a", title: "Offline job" });
  workOrderService.create({ principal, id: "wo-1", organizationId: "org-a", jobId: "job-1" });

  const appointmentStore = new Map([
    [JSON.stringify(["org-a", "appointment-1"]), {
      id: "appointment-1",
      organizationId: "org-a",
      workOrderId: "wo-1",
      memberIds: ["resource-1"]
    }]
  ]);
  const fieldVisitStore = new Map();
  const actualWorkStore = new Map();
  const auditStore = [];
  const fieldVisitService = new FieldVisitService({ fieldVisitStore, appointmentStore, workOrderService, auditStore });
  const actualWorkService = new ActualWorkService({ actualWorkStore, fieldVisitStore, auditStore });
  const operationStore = new Map();
  const syncService = new FieldExecutionSyncService({ fieldVisitService, actualWorkService, operationStore });
  return { principal, fieldVisitService, actualWorkService, syncService, operationStore, auditStore };
}

function operation(overrides = {}) {
  return {
    operationId: "op-1",
    operationType: "fieldVisit.create",
    organizationId: "org-a",
    actorUserId: "worker-1",
    deviceId: "device-1",
    capturedAt: "2026-10-01T10:00:05Z",
    occurredAt: "2026-10-01T10:00:00Z",
    expectedVersion: null,
    payload: {
      id: "visit-offline-1",
      appointmentId: "appointment-1",
      workOrderId: "wo-1",
      statusCode: "scheduled"
    },
    ...overrides
  };
}

test("offline create preserves actor and action timestamp through synchronization", () => {
  const { principal, syncService, fieldVisitService, auditStore } = fixture();
  const result = syncService.sync({ principal, operations: [operation()] })[0];

  assert.equal(result.status, "applied");
  const visit = fieldVisitService.get({ principal, fieldVisitId: "visit-offline-1" });
  assert.equal(visit.version, 1);
  assert.equal(auditStore[0].userId, "worker-1");
  assert.equal(auditStore[0].createdAt.toISOString(), "2026-10-01T10:00:00.000Z");
});

test("replay is idempotent and does not duplicate field work", () => {
  const { principal, syncService, fieldVisitService, operationStore } = fixture();
  const first = syncService.sync({ principal, operations: [operation()] })[0];
  const second = syncService.sync({ principal, operations: [operation()] })[0];

  assert.equal(first.status, "applied");
  assert.equal(second.status, "duplicate");
  assert.equal(operationStore.size, 1);
  assert.equal(fieldVisitService.list({ principal }).length, 1);
});

test("same operation id with changed payload is a conflict", () => {
  const { principal, syncService } = fixture();
  syncService.sync({ principal, operations: [operation()] });
  const result = syncService.sync({
    principal,
    operations: [operation({ payload: { ...operation().payload, notes: "tampered retry" } })]
  })[0];

  assert.equal(result.status, "conflict");
  assert.equal(result.conflictType, "operation_payload_mismatch");
});

test("stale field visit version is rejected without overwriting newer work", () => {
  const { principal, syncService, fieldVisitService } = fixture();
  syncService.sync({ principal, operations: [operation()] });
  syncService.sync({
    principal,
    operations: [operation({
      operationId: "op-arrive",
      operationType: "fieldVisit.arrive",
      fieldVisitId: "visit-offline-1",
      expectedVersion: 1,
      occurredAt: "2026-10-01T10:05:00Z",
      payload: { statusCode: "arrived" }
    })]
  });

  fieldVisitService.start({
    principal,
    fieldVisitId: "visit-offline-1",
    actualStartTime: "2026-10-01T10:10:00Z",
    statusCode: "in_progress"
  });

  const stale = syncService.sync({
    principal,
    operations: [operation({
      operationId: "op-stop-stale",
      operationType: "fieldVisit.stop",
      fieldVisitId: "visit-offline-1",
      expectedVersion: 2,
      occurredAt: "2026-10-01T10:30:00Z",
      payload: { statusCode: "stopped" }
    })]
  })[0];

  assert.equal(stale.status, "conflict");
  assert.equal(stale.conflictType, "state_version");
  assert.equal(fieldVisitService.get({ principal, fieldVisitId: "visit-offline-1" }).version, 3);
});

test("synchronization continues across independent operations and records partial results", () => {
  const { principal, syncService } = fixture();
  const results = syncService.sync({
    principal,
    operations: [
      operation(),
      operation({
        operationId: "bad-actor",
        actorUserId: "other-worker",
        payload: { id: "visit-other", appointmentId: "appointment-1", workOrderId: "wo-1" }
      })
    ]
  });

  assert.equal(results[0].status, "applied");
  assert.equal(results[1].status, "rejected");
});

test("synchronization requires the authenticated sync permission and actor identity", () => {
  const { syncService, principal } = fixture();
  const noPermission = { ...principal, permissions: ["fieldVisit:create"] };
  assert.throws(() => syncService.sync({ principal: noPermission, operations: [] }), /Not authorized/);

  const mismatched = syncService.sync({
    principal,
    operations: [operation({ actorUserId: "other-worker", operationId: "wrong-actor" })]
  })[0];
  assert.equal(mismatched.status, "rejected");
});

test("actual work creation is idempotent under offline replay", () => {
  const { principal, syncService, actualWorkService } = fixture();
  syncService.sync({ principal, operations: [operation()] });
  const workOperation = operation({
    operationId: "work-1",
    operationType: "actualWork.create",
    payload: {
      id: "actual-offline-1",
      fieldVisitId: "visit-offline-1",
      workOrderId: "wo-1",
      resourceId: "resource-1",
      description: "Completed field work",
      actualStartTime: "2026-10-01T10:10:00Z",
      actualEndTime: "2026-10-01T10:45:00Z",
      quantity: 1,
      unit: "unit"
    }
  });
  assert.equal(syncService.sync({ principal, operations: [workOperation] })[0].status, "applied");
  assert.equal(syncService.sync({ principal, operations: [workOperation] })[0].status, "duplicate");
  assert.equal(actualWorkService.list({ principal }).length, 1);
});
