const STATUSES = Object.freeze(["pending", "processing", "published", "failed"]);

class DomainEventOutboxEntry {
  constructor({
    id,
    organizationId,
    eventId,
    eventType,
    entityType,
    entityId,
    payload = {},
    source = "application",
    occurredAt = new Date(),
    availableAt = occurredAt,
    status = "pending",
    attempts = 0,
    lockedAt = null,
    publishedAt = null,
    lastError = null
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!eventId) throw new Error("eventId is required");
    if (!eventType) throw new Error("eventType is required");
    if (!entityType) throw new Error("entityType is required");
    if (!entityId) throw new Error("entityId is required");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("payload must be an object");
    }
    if (!STATUSES.includes(status)) throw new Error("Invalid outbox status");
    if (!Number.isInteger(attempts) || attempts < 0) throw new Error("attempts must be a non-negative integer");

    this.id = id;
    this.organizationId = organizationId;
    this.eventId = eventId;
    this.eventType = eventType;
    this.entityType = entityType;
    this.entityId = entityId;
    this.payload = Object.freeze({ ...payload });
    this.source = source;
    this.occurredAt = occurredAt;
    this.availableAt = availableAt;
    this.status = status;
    this.attempts = attempts;
    this.lockedAt = lockedAt;
    this.publishedAt = publishedAt;
    this.lastError = lastError;
  }
}

module.exports = { DomainEventOutboxEntry, STATUSES };
