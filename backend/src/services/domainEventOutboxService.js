const crypto = require("node:crypto");
const { DomainEventOutboxEntry } = require("../models/domainEventOutboxEntry");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({
  ENQUEUE: "event:emit",
  DISPATCH: "event:dispatch"
});

class DomainEventOutboxService {
  constructor({
    outboxStore = [],
    auditStore = [],
    authorize = DomainEventOutboxService.defaultAuthorize
  } = {}) {
    this.outboxStore = outboxStore;
    this.auditStore = auditStore;
    this.authorize = authorize;
  }

  enqueue({ principal, event, id = crypto.randomUUID(), availableAt = new Date() } = {}) {
    this.#requirePrincipal(principal);
    if (!event?.id || !event.organizationId) throw new Error("Domain event is required");
    if (event.organizationId !== principal.organizationId) throw new Error("Not authorized");
    this.#authorize(principal, ACTIONS.ENQUEUE, principal.organizationId);

    if (this.outboxStore.some(entry => entry.eventId === event.id)) {
      throw new Error("Domain event is already queued");
    }

    const entry = new DomainEventOutboxEntry({
      id,
      organizationId: principal.organizationId,
      eventId: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      source: event.source,
      occurredAt: event.occurredAt,
      availableAt
    });

    this.outboxStore.push(entry);
    this.auditStore.push(new AuditEvent({
      id: "domain-event-outbox-enqueued:" + entry.id,
      organizationId: entry.organizationId,
      userId: principal.userId,
      action: "domain-event.outbox.enqueued",
      entityType: entry.entityType,
      entityId: entry.entityId,
      newValue: { outboxId: entry.id, eventId: entry.eventId, eventType: entry.eventType }
    }));

    return entry;
  }

  claimBatch({ principal, limit = 10, now = new Date() } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.DISPATCH, principal.organizationId);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

    const claimed = this.outboxStore
      .filter(entry => entry.organizationId === principal.organizationId)
      .filter(entry => (entry.status === "pending" || entry.status === "failed"))
      .filter(entry => new Date(entry.availableAt) <= now)
      .sort((a, b) => new Date(a.availableAt) - new Date(b.availableAt))
      .slice(0, limit);

    for (const entry of claimed) {
      entry.status = "processing";
      entry.attempts += 1;
      entry.lockedAt = now;
    }

    return claimed;
  }

  markPublished({ principal, outboxId, publishedAt = new Date() } = {}) {
    this.#requirePrincipal(principal);
    const entry = this.#findForOrganization(principal, outboxId);
    this.#authorize(principal, ACTIONS.DISPATCH, entry.organizationId);
    if (entry.status !== "processing") throw new Error("Outbox entry is not processing");

    entry.status = "published";
    entry.publishedAt = publishedAt;
    entry.lockedAt = null;
    entry.lastError = null;
    return entry;
  }

  markFailed({ principal, outboxId, error, availableAt = new Date() } = {}) {
    this.#requirePrincipal(principal);
    const entry = this.#findForOrganization(principal, outboxId);
    this.#authorize(principal, ACTIONS.DISPATCH, entry.organizationId);
    if (entry.status !== "processing") throw new Error("Outbox entry is not processing");

    entry.status = "failed";
    entry.lockedAt = null;
    entry.lastError = String(error || "Unknown dispatch failure");
    entry.availableAt = availableAt;
    return entry;
  }

  listPending({ principal } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.DISPATCH, principal.organizationId);
    return this.outboxStore.filter(entry => entry.organizationId === principal.organizationId && entry.status !== "published");
  }

  #findForOrganization(principal, outboxId) {
    const entry = this.outboxStore.find(candidate =>
      candidate.id === outboxId && candidate.organizationId === principal.organizationId
    );
    if (!entry) throw new Error("Outbox entry not found");
    return entry;
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

module.exports = { DomainEventOutboxService, ACTIONS };
