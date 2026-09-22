const assert = require("node:assert/strict");
const { DomainEventService } = require("../src/services/domainEventService");

const principal = {
  userId: "admin-a",
  organizationId: "org-a",
  permissions: ["event:emit", "event:read"]
};

const eventStore = [];
const auditStore = [];
const service = new DomainEventService({ eventStore, auditStore });

const event = service.emit({
  principal,
  id: "event-1",
  eventType: "job.status.changed",
  entityType: "job",
  entityId: "job-1",
  payload: { previousStatus: "new", newStatus: "ready" },
  correlationId: "correlation-1"
});

assert.equal(event.organizationId, "org-a");
assert.equal(event.actorUserId, "admin-a");
assert.equal(event.eventType, "job.status.changed");
assert.equal(event.payload.newStatus, "ready");
assert.equal(auditStore.length, 1);
assert.equal(auditStore[0].action, "domain-event.emitted");

assert.throws(
  () => service.emit({
    principal,
    id: "event-1",
    eventType: "job.updated",
    entityType: "job",
    entityId: "job-1"
  }),
  /Domain event ID already exists/
);

assert.equal(service.list({ principal, entityType: "job", entityId: "job-1" }).length, 1);

const otherOrg = {
  userId: "admin-b",
  organizationId: "org-b",
  permissions: ["event:read"]
};

assert.equal(service.list({ principal: otherOrg }).length, 0);

assert.throws(
  () => service.emit({
    principal: otherOrg,
    eventType: "job.updated",
    entityType: "job",
    entityId: "job-1"
  }),
  /Not authorized/
);

assert.throws(
  () => service.emit({
    principal: { userId: "admin-a", organizationId: "org-a" },
    eventType: "job.updated",
    entityType: "job",
    entityId: "job-1"
  }),
  /Not authorized/
);

assert.throws(
  () => service.emit({
    principal,
    eventType: "job.updated",
    entityType: "job",
    entityId: "job-1",
    payload: []
  }),
  /payload must be an object/
);

console.log("Domain event service tests passed.");