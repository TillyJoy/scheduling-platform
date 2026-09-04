const SEVERITIES = Object.freeze([
  "critical",
  "important",
  "warning",
  "information",
  "success"
]);

const STATUSES = Object.freeze([
  "unread",
  "read",
  "acknowledged",
  "dismissed",
  "expired"
]);

class Notification {
  constructor({
    id,
    organizationId,
    recipientId,
    severity = "information",
    title,
    message,
    type = "system",
    icon = null,
    color = null,
    relatedEntityType = null,
    relatedEntityId = null,
    sourceEventType = null,
    status = "unread",
    requiresAcknowledgement = false,
    createdAt = new Date(),
    acknowledgedAt = null,
    dismissedAt = null,
    expiresAt = null
  }) {
    if (!organizationId) throw new Error("organizationId is required");
    if (!recipientId) throw new Error("recipientId is required");
    if (!title) throw new Error("title is required");
    if (!message) throw new Error("message is required");
    if (!SEVERITIES.includes(severity)) throw new Error("Invalid notification severity");
    if (!STATUSES.includes(status)) throw new Error("Invalid notification status");

    this.id = id;
    this.organizationId = organizationId;
    this.recipientId = recipientId;
    this.severity = severity;
    this.title = title;
    this.message = message;
    this.type = type;
    this.icon = icon;
    this.color = color;
    this.relatedEntityType = relatedEntityType;
    this.relatedEntityId = relatedEntityId;
    this.sourceEventType = sourceEventType;
    this.status = status;
    this.requiresAcknowledgement = Boolean(requiresAcknowledgement);
    this.createdAt = createdAt;
    this.acknowledgedAt = acknowledgedAt;
    this.dismissedAt = dismissedAt;
    this.expiresAt = expiresAt;
  }

  markRead(at = new Date()) {
    if (this.status === "unread") this.status = "read";
    return this;
  }

  acknowledge(at = new Date()) {
    if (!this.requiresAcknowledgement) {
      throw new Error("Notification does not require acknowledgement");
    }
    this.status = "acknowledged";
    this.acknowledgedAt = at;
    return this;
  }

  dismiss(at = new Date()) {
    this.status = "dismissed";
    this.dismissedAt = at;
    return this;
  }

  isExpired(at = new Date()) {
    return Boolean(this.expiresAt && new Date(this.expiresAt) <= at);
  }
}

module.exports = { Notification, SEVERITIES, STATUSES };
