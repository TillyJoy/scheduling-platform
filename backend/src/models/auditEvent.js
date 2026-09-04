class AuditEvent {
  constructor({
    id,
    organizationId,
    userId = null,
    action,
    entityType,
    entityId,
    previousValue = null,
    newValue = null,
    source = "application",
    createdAt = new Date()
  }) {
    this.id = id;
    this.organizationId = organizationId;
    this.userId = userId;
    this.action = action;
    this.entityType = entityType;
    this.entityId = entityId;
    this.previousValue = previousValue;
    this.newValue = newValue;
    this.source = source;
    this.createdAt = createdAt;
  }
}

module.exports = { AuditEvent };
