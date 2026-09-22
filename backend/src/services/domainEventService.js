const crypto = require("node:crypto");
const { DomainEvent } = require("../models/domainEvent");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({
  EMIT: "event:emit",
  READ: "event:read"
});

class DomainEventService {
  constructor({
    eventStore = [],
    auditStore = [],
    authorize = DomainEventService.defaultAuthorize
  } = {}) {
    this.eventStore = eventStore;
    this.auditStore = auditStore;
    this.authorize = authorize;
  }

  emit({
    principal,
    id = crypto.randomUUID(),
    eventType,
    entityType,
    entityId,
    payload = {},
    source = "application",
    occurredAt = new Date(),
    correlationId = null,
    causationId = null
  }) {
    this.#requirePrincipal(principal);
    if (this.eventStore.some(event => event.id === id)) {
      throw new Error("Domain event ID already exists");
    }

    this.#authorize(principal, ACTIONS.EMIT, principal.organizationId);

    const event = new DomainEvent({
      id,
      organizationId: principal.organizationId,
      eventType,
      entityType,
      entityId,
      actorUserId: principal.userId,
      payload,
      source,
      occurredAt,
      correlationId,
      causationId
    });

    this.eventStore.push(event);
    this.auditStore.push(new AuditEvent({
      id: "domain-event-emitted:" + event.id,
      organizationId: event.organizationId,
      userId: principal.userId,
      action: "domain-event.emitted",
      entityType: event.entityType,
      entityId: event.entityId,
      newValue: {
        eventId: event.id,
        eventType: event.eventType,
        source: event.source
      }
    }));

    return event;
  }

  list({ principal, entityType = null, entityId = null, eventType = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, principal.organizationId);

    return this.eventStore
      .filter(event => event.organizationId === principal.organizationId)
      .filter(event => !entityType || event.entityType === entityType)
      .filter(event => !entityId || event.entityId === entityId)
      .filter(event => !eventType || event.eventType === eventType);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, { organizationId })) {
      throw new Error("Not authorized");
    }
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }

  static defaultAuthorize(principal, action, { organizationId }) {
    return principal.organizationId === organizationId
      && Array.isArray(principal.permissions)
      && principal.permissions.includes(action);
  }
}

module.exports = { DomainEventService, ACTIONS };