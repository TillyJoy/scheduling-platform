const assert = require("node:assert/strict");
const { FieldVisitService } = require("../src/services/fieldVisitService");
const { ActualWorkService } = require("../src/services/actualWorkService");
const { JobService } = require("../src/services/jobService");
const { WorkOrderService } = require("../src/services/workOrderService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["fieldVisit:create", "fieldVisit:read", "fieldVisit:update", "actualWork:create", "actualWork:read"]
};
const otherOrg = {
  userId: "user-b",
  organizationId: "org-b",
  permissions: ["fieldVisit:create", "fieldVisit:read", "fieldVisit:update", "actualWork:create", "actualWork:read"]
};

const jobService = new JobService({ authorize: () => true });
const workOrderService = new WorkOrderService({ jobService });
jobService.create({
  principal,
  id: "job-1",
  organizationId: "org-a",
  title: "Job A"
});
workOrderService.create({
  principal,
  id: "wo-1",
  organizationId: "org-a",
  jobId: "job-1"
});

const appointmentStore = new Map([
  [JSON.stringify(["org-a", "appointment-1"]), {
    id: "appointment-1",
    organizationId: "org-a",
    workOrderId: "wo-1"
  }],
  [JSON.stringify(["org-b", "appointment-1"]), {
    id: "appointment-1",
    organizationId: "org-b",
    workOrderId: "wo-other"
  }]
]);

const fieldVisitStore = new Map();
const auditStore = [];
const fieldVisitService = new FieldVisitService({
  fieldVisitStore,
  appointmentStore,
  workOrderService,
  auditStore,
  clock: () => new Date("2026-10-01T10:00:00Z")
});

const visit = fieldVisitService.create({
  principal,
  id: "visit-1",
  appointmentId: "appointment-1",
  workOrderId: "wo-1",
  statusCode: "scheduled",
  resourceIds: ["resource-1"],
  metadata: { nested: { value: 1 } }
});

assert.equal(visit.id, "visit-1");
assert.equal(visit.actualStartTime, null);
assert.equal(fieldVisitService.get({ principal, fieldVisitId: "visit-1" }).workOrderId, "wo-1");

assert.throws(() => fieldVisitService.create({
  principal,
  id: "visit-other-wo",
  appointmentId: "appointment-1",
  workOrderId: "missing-wo"
}), /Appointment is not linked/);

assert.throws(() => fieldVisitService.get({ principal: otherOrg, fieldVisitId: "visit-1" }), /Field visit not found/);

const started = fieldVisitService.start({ principal, fieldVisitId: "visit-1" });
assert.equal(started.actualStartTime.toISOString(), "2026-10-01T10:00:00.000Z");

assert.throws(() => fieldVisitService.start({ principal, fieldVisitId: "visit-1" }), /already started/);

const completed = fieldVisitService.complete({
  principal,
  fieldVisitId: "visit-1",
  actualEndTime: "2026-10-01T11:30:00Z"
});
assert.equal(completed.actualEndTime.toISOString(), "2026-10-01T11:30:00.000Z");
assert.equal(completed.completedByUserId, "user-a");

const actualWorkService = new ActualWorkService({
  actualWorkStore: new Map(),
  fieldVisitStore,
  auditStore
});

const work = actualWorkService.create({
  principal,
  id: "work-1",
  fieldVisitId: "visit-1",
  workOrderId: "wo-1",
  resourceId: "resource-1",
  description: "Performed configured field work",
  actualStartTime: "2026-10-01T10:15:00Z",
  actualEndTime: "2026-10-01T11:15:00Z",
  quantity: 1,
  unit: "unit",
  metadata: { evidenceType: "configured" }
});

assert.equal(work.workOrderId, "wo-1");
assert.equal(actualWorkService.list({ principal, fieldVisitId: "visit-1" }).length, 1);
assert.equal(actualWorkService.get({ principal, actualWorkId: "work-1" }).description, "Performed configured field work");

assert.throws(() => actualWorkService.create({
  principal,
  id: "work-cross-link",
  fieldVisitId: "visit-1",
  workOrderId: "other-wo",
  description: "Invalid linkage"
}), /not linked/);

assert.throws(() => actualWorkService.get({ principal: otherOrg, actualWorkId: "work-1" }), /Actual work not found/);

assert.equal(auditStore.filter(event => event.organizationId === "org-a").length >= 3, true);
