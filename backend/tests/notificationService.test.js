const assert = require("node:assert/strict");
const { NotificationService } = require("../src/services/notificationService");

const service = new NotificationService();

service.create({
  id: "n1",
  organizationId: "org-a",
  recipientId: "user-a",
  severity: "critical",
  title: "Appointment changed",
  message: "The assigned resource can no longer attend.",
  sourceEventType: "appointment.resource_unavailable",
  requiresAcknowledgement: true
});

service.create({
  id: "n2",
  organizationId: "org-b",
  recipientId: "user-a",
  severity: "critical",
  title: "Other organization",
  message: "This must remain isolated."
});

assert.equal(service.listForRecipient({ organizationId: "org-a", recipientId: "user-a" }).length, 1);
assert.throws(
  () => service.markRead({ organizationId: "org-b", recipientId: "user-a", notificationId: "n1" }),
  /Notification not found/
);

service.markRead({ organizationId: "org-a", recipientId: "user-a", notificationId: "n1" });
assert.equal(service.listForRecipient({ organizationId: "org-a", recipientId: "user-a", status: "read" }).length, 1);

service.acknowledge({ organizationId: "org-a", recipientId: "user-a", notificationId: "n1" });
assert.equal(service.listForRecipient({ organizationId: "org-a", recipientId: "user-a", status: "acknowledged" }).length, 1);
assert.equal(service.auditStore.length, 3);

console.log("Notification service tests passed.");
