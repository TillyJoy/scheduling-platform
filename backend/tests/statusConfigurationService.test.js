const assert = require("node:assert/strict");
const { StatusConfigurationService } = require("../src/services/statusConfigurationService");

const admin = {
  userId: "admin-a",
  organizationId: "org-a",
  permissions: ["status:create", "status:read", "status:update"]
};
const otherOrg = {
  userId: "admin-b",
  organizationId: "org-b",
  permissions: ["status:create", "status:read", "status:update"]
};

const service = new StatusConfigurationService();

service.createStatus({
  principal: admin,
  id: "job-new",
  organizationId: "org-a",
  entityType: "job",
  code: "new",
  label: "New",
  initial: true,
  sortOrder: 10
});
service.createStatus({
  principal: admin,
  id: "job-ready",
  organizationId: "org-a",
  entityType: "job",
  code: "ready",
  label: "Ready",
  category: "pending",
  sortOrder: 20
});
service.createStatus({
  principal: admin,
  id: "job-complete",
  organizationId: "org-a",
  entityType: "job",
  code: "complete",
  label: "Complete",
  category: "completed",
  terminal: true,
  sortOrder: 30
});

assert.throws(() => service.createStatus({
  principal: admin,
  id: "job-new-2",
  organizationId: "org-a",
  entityType: "job",
  code: "new",
  label: "Duplicate"
}), /Status code already exists/);

assert.throws(() => service.createStatus({
  principal: admin,
  id: "job-start-2",
  organizationId: "org-a",
  entityType: "job",
  code: "start",
  label: "Start",
  initial: true
}), /initial status already exists/);

service.setTransitions({
  principal: admin,
  entityType: "job",
  fromCode: "new",
  toCodes: ["ready"]
});
assert.deepEqual(
  service.getAllowedTransitions({ principal: admin, entityType: "job", fromCode: "new" }).map(status => status.code),
  ["ready"]
);

assert.throws(() => service.setTransitions({
  principal: admin,
  entityType: "job",
  fromCode: "complete",
  toCodes: ["ready"]
}), /Terminal status cannot have outgoing transitions/);

assert.equal(service.listStatuses({ principal: admin, entityType: "job" }).length, 3);
assert.equal(service.auditStore.length, 4);

assert.equal(service.listStatuses({ principal: otherOrg, entityType: "job" }).length, 0);
assert.throws(() => service.createStatus({
  principal: otherOrg,
  id: "foreign",
  organizationId: "org-a",
  entityType: "job",
  code: "foreign",
  label: "Foreign"
}), /Not authorized/);

console.log("Status configuration service tests passed.");
