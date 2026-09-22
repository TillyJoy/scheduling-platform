class DomainEvent {
  constructor({
    id,
    organizationId,
    eventType,
    entityType,
    entityId,
    actorUserId = null,
    payload = {},
    source = "application",
    occurredAt = new Date(),
    correlationId = null,
    causationId = null
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!eventType) throw new Error("eventType is required");
    if (!entityType) throw new Error("entityType is required");
    if (!entityId) throw new Error("entityId is required");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("payload must be an object");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.eventType = eventType;
    this.entityType = entityType;
    this.entityId = entityId;
    this.actorUserId = actorUserId;
    this.payload = Object.freeze({ ...payload });
    this.source = source;
    this.occurredAt = occurredAt;
    this.correlationId = correlationId;
    this.causationId = causationId;

    Object.freeze(this);
  }
}

module.exports = { DomainEvent };