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
assert.throws(() => service.get({ principal: otherOrg, assignmentId: "assignment-1" }), /Not authorized/);
