const assert = require("node:assert/strict");
const { NotificationEventProcessor } = require("../src/services/notificationEventProcessor");
const { DomainEvent } = require("../src/models/domainEvent");

const organizationId = "notification-atomicity-org";
const principal = {
  userId: "notification-dispatcher",
  organizationId,
  permissions: ["notification:dispatch", "notification:create"]
};
const notifications = new Map();
const attempts = [];
const transactions = [];
let nextTransactionId = 1;
let failNextAttempt = false;

const transaction = async (_principal, action, work) => {
  const db = { transactionId: nextTransactionId++, action, stagedNotification: null, stagedAttempt: null };
  try {
    const result = await work(db);
    if (db.stagedNotification) notifications.set(db.stagedNotification.deliveryKey, db.stagedNotification);
    if (db.stagedAttempt) attempts.push(db.stagedAttempt);
    transactions.push({ id: db.transactionId, action, status: "committed" });
    return result;
  } catch (error) {
    transactions.push({ id: db.transactionId, action, status: "rolled_back" });
    throw error;
  }
};

const notificationService = {
  transaction,
  async createWithResult({ id, organizationId: targetOrg, recipientId, title, message, deliveryKey, templateId, templateVersion, db }) {
    assert.ok(db, "notification persistence must receive the active transaction handle");
    assert.equal(targetOrg, organizationId);
    const existing = notifications.get(deliveryKey);
    if (existing) return { notification: existing, created: false };
    const notification = { id, organizationId: targetOrg, recipientId, title, message, deliveryKey, templateId, templateVersion, createdAt: new Date("2026-10-10T12:00:00.000Z") };
    db.stagedNotification = notification;
    return { notification, created: true };
  }
};

const rule = {
  id: "notify-job-status",
  organizationId,
  eventType: "job.status.changed",
  status: "published",
  enabled: true,
  conditions: {},
  recipientRules: [{ type: "static_user", userId: "recipient-1" }],
  templateRefs: [{ templateId: "job-status-template", version: 1 }],
  allowedChannels: ["in_app"],
  priority: "normal",
  required: false
};
const template = {
  id: "job-status-template",
  version: 1,
  organizationId,
  name: "Job status changed",
  channel: "in_app",
  status: "published",
  subject: "Status: {{newStatus}}",
  body: "Job {{entityId}} is now {{newStatus}}",
  variables: ["newStatus", "entityId"]
};
const configurationService = {
  ruleRepository: { list: async () => [rule] },
  templateRepository: { getVersion: async () => template }
};
const deliveryAttemptRepository = {
  async create({ attempt, db }) {
    assert.ok(db, "delivery attempt must receive the same active transaction handle");
    assert.ok(db.stagedNotification, "notification must be staged before the attempt");
    if (failNextAttempt) {
      failNextAttempt = false;
      throw new Error("simulated attempt persistence failure");
    }
    db.stagedAttempt = { ...attempt, transactionId: db.transactionId, deliveryKey: db.stagedNotification.deliveryKey };
  }
};
const processor = new NotificationEventProcessor({
  notificationService, deliveryAttemptRepository, configurationService, transaction, durableConfiguration: true
});

function makeEvent(id) {
  return new DomainEvent({
    id,
    organizationId,
    eventType: "job.status.changed",
    entityType: "job",
    entityId: "job-" + id,
    actorUserId: principal.userId,
    payload: { newStatus: "ready", recipientUserId: "recipient-1" }
  });
}

(async () => {
  const event = makeEvent("event-replay");
  const first = await processor.process({ principal, event });
  assert.equal(first[0].status, "created");
  assert.equal(notifications.size, 1);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].deliveryKey, first[0].deliveryKey);
  assert.equal(attempts[0].transactionId, transactions.find(tx => tx.action === "notification.dispatch.create" && tx.status === "committed").id);

  const replay = await processor.process({ principal, event });
  assert.equal(replay[0].status, "deduplicated");
  assert.equal(notifications.size, 1);
  assert.equal(attempts.length, 1, "replay must not duplicate the initial in-app attempt");

  const failedEvent = makeEvent("event-rollback");
  failNextAttempt = true;
  await assert.rejects(() => processor.process({ principal, event: failedEvent }), /simulated attempt persistence failure/);
  assert.equal(notifications.has("event-rollback:notify-job-status:job-status-template:recipient-1"), false,
    "notification must roll back when initial attempt persistence fails");
  assert.equal(attempts.length, 1);
  assert.ok(transactions.some(tx => tx.action === "notification.dispatch.create" && tx.status === "rolled_back"));

  const recovered = await processor.process({ principal, event: failedEvent });
  assert.equal(recovered[0].status, "created");
  assert.equal(notifications.size, 2);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].deliveryKey, recovered[0].deliveryKey);

  console.log("Notification integration atomicity/replay tests passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
