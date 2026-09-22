const assert = require("node:assert/strict");
const { DomainEvent } = require("../src/models/domainEvent");
const { NotificationService } = require("../src/services/notificationService");
const { NotificationEventProcessor } = require("../src/services/notificationEventProcessor");
const { NotificationTemplate } = require("../src/models/notificationTemplate");
const { NotificationRule } = require("../src/models/notificationRule");

const principal = {
  userId: "dispatcher-a",
  organizationId: "org-a",
  permissions: ["notification:dispatch", "notification:create", "notification:read"]
};

const notificationStore = new Map();
const auditStore = [];
const notificationService = new NotificationService({ notificationStore, auditStore });

const template = new NotificationTemplate({
  id: "template-1",
  organizationId: "org-a",
  name: "Status changed",
  channel: "in_app",
  subject: "Job {{newStatus}}",
  body: "Job {{entityId}} changed from {{previousStatus}} to {{newStatus}}.",
  variables: ["entityId", "previousStatus", "newStatus"],
  status: "published"
});

const rule = new NotificationRule({
  id: "rule-1",
  organizationId: "org-a",
  name: "Job status notification",
  eventType: "job.status.changed",
  recipientRules: [{ type: "event_payload", path: "recipientUserId" }],
  templateIds: ["template-1"],
  allowedChannels: ["in_app"],
  status: "published",
  enabled: true
});

const processor = new NotificationEventProcessor({
  ruleStore: new Map([[rule.id, rule]]),
  templateStore: new Map([[template.id, template]]),
  notificationService
});

const event = new DomainEvent({
  id: "event-1",
  organizationId: "org-a",
  eventType: "job.status.changed",
  entityType: "job",
  entityId: "job-1",
  actorUserId: "dispatcher-a",
  payload: { previousStatus: "new", newStatus: "ready", recipientUserId: "user-1" }
});

const results = processor.process({ principal, event });
assert.equal(results.length, 1);
assert.equal(results[0].status, "created");
assert.equal([...notificationStore.values()][0].recipientId, "user-1");
assert.equal([...notificationStore.values()][0].message, "Job job-1 changed from new to ready.");

assert.equal(processor.process({
  principal,
  event: new DomainEvent({
    id: "event-2",
    organizationId: "org-a",
    eventType: "unmatched.event",
    entityType: "job",
    entityId: "job-2"
  })
}).length, 0);

assert.throws(
  () => processor.process({
    principal: { userId: "other", organizationId: "org-b", permissions: ["notification:dispatch"] },
    event
  }),
  /Not authorized/
);

assert.throws(
  () => processor.process({ principal, event: new DomainEvent({
    id: "event-3",
    organizationId: "org-a",
    eventType: "job.status.changed",
    entityType: "job",
    entityId: "job-3"
  }) }),
  /recipientId/
);

console.log("Notification event processor tests passed.");
