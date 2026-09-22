const crypto = require("node:crypto");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({ TRANSITION: "status:transition", READ: "status:read" });

class StatusLifecycleService {
  constructor({
    recordStore = new Map(),
    statusConfiguration,
    auditStore = [],
    domainEventService = null,
    authorize = StatusLifecycleService.defaultAuthorize
  } = {}) {
    if (!statusConfiguration) throw new Error("statusConfiguration is required");
    this.recordStore = recordStore;
    this.statusConfiguration = statusConfiguration;
    this.auditStore = auditStore;
    this.domainEventService = domainEventService;
    this.authorize = authorize;
  }

  transition({
    principal,
    entityType,
    entityId,
    toCode,
    reason = null,
    metadata = {},
    eventType = null,
    correlationId = null,
    causationId = null
  }) {
    this.#requirePrincipal(principal);
    if (!entityType || !entityId || !toCode) throw new Error("entityType, entityId, and toCode are required");
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) throw new Error("metadata must be an object");
    this.#authorize(principal, ACTIONS.TRANSITION, principal.organizationId);

    const key = this.#key(principal.organizationId, entityType, entityId);
    const record = this.recordStore.get(key);
    if (!record) throw new Error("Entity record not found");
    if (record.organizationId !== principal.organizationId) throw new Error("Not authorized");
    if (!record.status) throw new Error("Entity record has no current status");

    const allowed = this.statusConfiguration
      .getAllowedTransitions({ principal, entityType, fromCode: record.status })
      .some(status => status.code === toCode);

    if (!allowed) throw new Error("Status transition is not allowed");

    const previousStatus = record.status;

    if (this.domainEventService) {
      this.domainEventService.emit({
        principal,
        id: crypto.randomUUID(),
        eventType: eventType || entityType + ".status.changed",
        entityType,
        entityId,
        payload: {
          previousStatus,
          newStatus: toCode,
          reason,
          metadata
        },
        correlationId,
        causationId
      });
    }

    record.status = toCode;
    this.recordStore.set(key, record);

    this.auditStore.push(new AuditEvent({
      id: "status-transition:" + entityType + ":" + entityId + ":" + (this.auditStore.length + 1),
      organizationId: principal.organizationId,
      userId: principal.userId,
      action: "status.transitioned",
      entityType,
      entityId,
      previousValue: { status: previousStatus },
      newValue: { status: toCode, reason, metadata }
    }));

    return record;
  }

  getCurrentStatus({ principal, entityType, entityId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, principal.organizationId);
    const record = this.recordStore.get(this.#key(principal.organizationId, entityType, entityId));
    if (!record || record.organizationId !== principal.organizationId) throw new Error("Entity record not found");
    return record.status;
  }

  #key(organizationId, entityType, entityId) {
    return [organizationId, entityType, entityId].join(":");
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, { organizationId })) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, { organizationId }) {
    return principal.organizationId === organizationId
      && Array.isArray(principal.permissions)
      && principal.permissions.includes(action);
  }
}

module.exports = { StatusLifecycleService, ACTIONS };