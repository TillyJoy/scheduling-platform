const assert = require("node:assert/strict");
const { StatusConfigurationService } = require("../src/services/statusConfigurationService");
const { StatusLifecycleService } = require("../src/services/statusLifecycleService");
const { DomainEventService } = require("../src/services/domainEventService");

const principal = {
  userId: "admin-a",
  organizationId: "org-a",
  permissions: ["status:create", "status:read", "status:update", "status:transition", "event:emit"]
};

const statusConfiguration = new StatusConfigurationService();
statusConfiguration.createStatus({ principal, id: "job-new", organizationId: "org-a", entityType: "job", code: "new", label: "New", initial: true });
statusConfiguration.createStatus({ principal, id: "job-ready", organizationId: "org-a", entityType: "job", code: "ready", label: "Ready", category: "pending" });
statusConfiguration.createStatus({ principal, id: "job-complete", organizationId: "org-a", entityType: "job", code: "complete", label: "Complete", category: "completed", terminal: true });
statusConfiguration.setTransitions({ principal, entityType: "job", fromCode: "new", toCodes: ["ready"] });
statusConfiguration.setTransitions({ principal, entityType: "job", fromCode: "ready", toCodes: ["complete"] });

const recordStore = new Map([
  ["org-a:job:job-1", { id: "job-1", organizationId: "org-a", status: "new" }]
]);
const eventStore = [];
const eventAuditStore = [];
const domainEventService = new DomainEventService({ eventStore, auditStore: eventAuditStore });
const lifecycle = new StatusLifecycleService({ recordStore, statusConfiguration, domainEventService });

assert.equal(lifecycle.getCurrentStatus({ principal, entityType: "job", entityId: "job-1" }), "new");

const updated = lifecycle.transition({
  principal, entityType: "job", entityId: "job-1", toCode: "ready", reason: "Ready for scheduling"
});
assert.equal(updated.status, "ready");
assert.equal(lifecycle.getCurrentStatus({ principal, entityType: "job", entityId: "job-1" }), "ready");
assert.equal(lifecycle.auditStore.length, 1);
assert.equal(lifecycle.auditStore[0].previousValue.status, "new");
assert.equal(lifecycle.auditStore[0].newValue.status, "ready");
assert.equal(eventStore.length, 1);
assert.equal(eventStore[0].eventType, "job.status.changed");
assert.equal(eventStore[0].actorUserId, "admin-a");
assert.equal(eventStore[0].payload.previousStatus, "new");
assert.equal(eventStore[0].payload.newStatus, "ready");

assert.throws(() => lifecycle.transition({ principal, entityType: "job", entityId: "job-1", toCode: "new" }), /Status transition is not allowed/);

lifecycle.transition({ principal, entityType: "job", entityId: "job-1", toCode: "complete" });

assert.throws(() => lifecycle.transition({ principal, entityType: "job", entityId: "job-1", toCode: "ready" }), /Status transition is not allowed/);

const otherOrg = { userId: "admin-b", organizationId: "org-b", permissions: ["status:transition", "status:read"] };
assert.throws(() => lifecycle.getCurrentStatus({ principal: otherOrg, entityType: "job", entityId: "job-1" }), /Entity record not found/);
assert.throws(() => lifecycle.transition({ principal: otherOrg, entityType: "job", entityId: "job-1", toCode: "ready" }), /Entity record not found/);

console.log("Status lifecycle service tests passed.");
