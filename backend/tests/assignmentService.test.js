const assert = require("node:assert/strict");
const { AssignmentService } = require("../src/services/assignmentService");

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

const service = new AssignmentService();

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

const statusDefinitions = new Map([
  ["open", { category: "active" }],
  ["voided", { category: "cancelled" }]
]);
const configurableStatusService = new AssignmentService({
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
