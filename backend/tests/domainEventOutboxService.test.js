const assert = require("node:assert/strict");
const { DomainEvent } = require("../src/models/domainEvent");
const { DomainEventOutboxService } = require("../src/services/domainEventOutboxService");

const principal = {
  userId: "worker-a",
  organizationId: "org-a",
  permissions: ["event:emit", "event:dispatch"]
};

const outboxStore = [];
const auditStore = [];
const service = new DomainEventOutboxService({ outboxStore, auditStore });

const event = new DomainEvent({
  id: "event-1",
  organizationId: "org-a",
  eventType: "job.status.changed",
  entityType: "job",
  entityId: "job-1",
  payload: { previousStatus: "new", newStatus: "ready" }
});

const entry = service.enqueue({
  principal,
  event,
  id: "outbox-1",
  availableAt: new Date("2026-01-01T00:00:00Z")
});
assert.equal(entry.eventId, "event-1");
assert.equal(entry.status, "pending");
assert.equal(entry.organizationId, "org-a");
assert.equal(auditStore.length, 1);

assert.throws(
  () => service.enqueue({ principal, event, id: "outbox-2" }),
  /already queued/
);

const claimed = service.claimBatch({
  principal,
  limit: 1,
  now: new Date("2026-01-01T00:00:00Z")
});
assert.equal(claimed.length, 1);
assert.equal(claimed[0].status, "processing");
assert.equal(claimed[0].attempts, 1);

service.markFailed({
  principal,
  outboxId: "outbox-1",
  error: "temporary delivery failure",
  availableAt: new Date("2026-01-01T01:00:00Z")
});
assert.equal(entry.status, "failed");
assert.equal(entry.lastError, "temporary delivery failure");

assert.equal(
  service.claimBatch({
    principal,
    now: new Date("2026-01-01T00:30:00Z")
  }).length,
  0
);

const retry = service.claimBatch({
  principal,
  now: new Date("2026-01-01T01:00:00Z")
});
assert.equal(retry.length, 1);
assert.equal(retry[0].attempts, 2);

service.markPublished({
  principal,
  outboxId: "outbox-1",
  publishedAt: new Date("2026-01-01T01:01:00Z")
});
assert.equal(entry.status, "published");
assert.equal(entry.lockedAt, null);
assert.equal(entry.lastError, null);

const otherOrg = {
  userId: "worker-b",
  organizationId: "org-b",
  permissions: ["event:dispatch"]
};

assert.throws(
  () => service.listPending({ principal: otherOrg }),
  /Not authorized/
);

assert.throws(
  () => service.enqueue({ principal, event: new DomainEvent({
    id: "event-2",
    organizationId: "org-b",
    eventType: "job.updated",
    entityType: "job",
    entityId: "job-2"
  }) }),
  /Not authorized/
);

console.log("Domain event outbox service tests passed.");
