const assert = require("node:assert/strict");
const { AssignmentService } = require("../src/services/assignmentService");
const { ResourceService } = require("../src/services/resourceService");
const { JobService } = require("../src/services/jobService");
const { WorkOrderService } = require("../src/services/workOrderService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["assignment:create", "assignment:read"]
};
const otherOrg = {
  userId: "user-b",
  organizationId: "org-b",
  permissions: ["assignment:create", "assignment:read"]
};

const scopedReferences = {
  resourceService: {
    getForOrganization({ organizationId, resourceId }) {
      return { id: resourceId, organizationId };
    }
  },
  jobService: {
    getForOrganization({ organizationId, jobId }) {
      return { id: jobId, organizationId };
    }
  },
  workOrderService: {
    getForOrganization({ organizationId, workOrderId }) {
      return { id: workOrderId, organizationId };
    }
  }
};

const service = new AssignmentService(scopedReferences);

service.create({
  principal,
  id: "assignment-1",
  organizationId: "org-a",
  resourceId: "resource-1",
  jobId: "job-1",
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z"
});

service.create({
  principal: otherOrg,
  id: "assignment-1",
  organizationId: "org-b",
  resourceId: "resource-1",
  jobId: "job-2",
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z"
});

assert.throws(() => service.create({
  principal,
  id: "assignment-1",
  organizationId: "org-a",
  resourceId: "resource-2",
  workOrderId: "wo-1",
  startTime: "2026-10-01T11:00:00Z",
  endTime: "2026-10-01T12:00:00Z"
}), /Assignment ID already exists/);

assert.throws(() => service.create({
  principal,
  id: "assignment-2",
  organizationId: "org-a",
  resourceId: "resource-1",
  workOrderId: "wo-1",
  startTime: "2026-10-01T09:30:00Z",
  endTime: "2026-10-01T10:30:00Z"
}), /overlapping assignment/);

service.create({
  principal,
  id: "assignment-3",
  organizationId: "org-a",
  resourceId: "resource-1",
  workOrderId: "wo-2",
  startTime: "2026-10-01T10:00:00Z",
  endTime: "2026-10-01T11:00:00Z"
});

assert.equal(service.list({ principal, resourceId: "resource-1" }).length, 2);
assert.equal(service.get({ principal, assignmentId: "assignment-1" }).organizationId, "org-a");
assert.equal(service.get({ principal: otherOrg, assignmentId: "assignment-1" }).organizationId, "org-b");
assert.throws(() => service.get({ principal, assignmentId: "missing" }), /Assignment not found/);

const metadata = { nested: { value: "original" } };
const isolated = service.create({
  principal,
  id: "assignment-4",
  organizationId: "org-a",
  resourceId: "resource-2",
  jobId: "job-3",
  startTime: "2026-10-01T12:00:00Z",
  endTime: "2026-10-01T13:00:00Z",
  metadata
});
metadata.nested.value = "caller-mutated";
isolated.metadata.nested.value = "returned-mutated";
assert.equal(service.get({ principal, assignmentId: "assignment-4" }).metadata.nested.value, "original");

const referenceRecords = {
  resources: new Map([
    ['["org-a","resource-a"]', { id: "resource-a", organizationId: "org-a" }],
    ['["org-b","resource-b"]', { id: "resource-b", organizationId: "org-b" }]
  ]),
  jobs: new Map([
    ['["org-a","job-a"]', { id: "job-a", organizationId: "org-a" }],
    ['["org-b","job-b"]', { id: "job-b", organizationId: "org-b" }]
  ]),
  workOrders: new Map([
    ['["org-a","work-a"]', { id: "work-a", organizationId: "org-a" }],
    ['["org-b","work-b"]', { id: "work-b", organizationId: "org-b" }]
  ])
};
const referenceJobService = new JobService({ jobStore: referenceRecords.jobs });
const referenceService = new AssignmentService({
  resourceService: new ResourceService({ resourceStore: referenceRecords.resources }),
  jobService: referenceJobService,
  workOrderService: new WorkOrderService({
    workOrderStore: referenceRecords.workOrders,
    jobService: referenceJobService
  })
});
const validReferenceAssignment = referenceService.create({
  principal,
  id: "reference-valid",
  organizationId: "org-b",
  resourceId: "resource-a",
  jobId: "job-a",
  startTime: "2026-10-02T09:00:00Z",
  endTime: "2026-10-02T10:00:00Z"
});
assert.equal(validReferenceAssignment.organizationId, "org-a");

assert.throws(() => referenceService.create({
  principal,
  id: "reference-cross-resource",
  resourceId: "resource-b",
  jobId: "job-a",
  startTime: "2026-10-02T10:00:00Z",
  endTime: "2026-10-02T11:00:00Z"
}), /Resource not found/);
assert.throws(() => referenceService.create({
  principal,
  id: "reference-cross-job",
  resourceId: "resource-a",
  jobId: "job-b",
  startTime: "2026-10-02T10:00:00Z",
  endTime: "2026-10-02T11:00:00Z"
}), /Job not found/);
assert.throws(() => referenceService.create({
  principal,
  id: "reference-cross-work-order",
  resourceId: "resource-a",
  workOrderId: "work-b",
  startTime: "2026-10-02T10:00:00Z",
  endTime: "2026-10-02T11:00:00Z"
}), /Work order not found/);
assert.deepEqual(referenceService.list({ principal }).map(assignment => assignment.id), ["reference-valid"]);

const statusDefinitions = new Map([
  ["open", { category: "active" }],
  ["voided", { category: "cancelled" }]
]);
const configurableStatusService = new AssignmentService({
  ...scopedReferences,
  statusResolver: ({ statusCode }) => statusDefinitions.get(statusCode) || null
});

configurableStatusService.create({
  principal,
  id: "assignment-5",
  organizationId: "org-a",
  resourceId: "resource-3",
  jobId: "job-4",
  statusCode: "voided",
  startTime: "2026-10-01T14:00:00Z",
  endTime: "2026-10-01T15:00:00Z"
});

configurableStatusService.create({
  principal,
  id: "assignment-6",
  organizationId: "org-a",
  resourceId: "resource-3",
  jobId: "job-5",
  statusCode: "open",
  startTime: "2026-10-01T14:30:00Z",
  endTime: "2026-10-01T15:30:00Z"
});

assert.throws(() => configurableStatusService.create({
  principal,
  id: "assignment-7",
  organizationId: "org-a",
  resourceId: "resource-3",
  jobId: "job-6",
  statusCode: "open",
  startTime: "2026-10-01T14:45:00Z",
  endTime: "2026-10-01T15:45:00Z"
}), /overlapping assignment/);


assert.throws(
  () => new AssignmentService({ assignmentRepository: {} }),
  /assignmentRepository requires transaction, resourceRepository, jobRepository, and workOrderRepository/
);
