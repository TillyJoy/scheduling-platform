const { StatusDefinition } = require("../models/statusDefinition");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({
  CREATE: "status:create",
  READ: "status:read",
  UPDATE: "status:update"
});

class StatusConfigurationService {
  constructor({ statusStore = new Map(), transitionStore = new Map(), auditStore = [], authorize = StatusConfigurationService.defaultAuthorize } = {}) {
    this.statusStore = statusStore;
    this.transitionStore = transitionStore;
    this.auditStore = auditStore;
    this.authorize = authorize;
  }

  createStatus({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const status = new StatusDefinition(input);
    this.#authorize(principal, ACTIONS.CREATE, status.organizationId);
    const key = this.#key(status.organizationId, status.entityType, status.code);
    if (this.statusStore.has(key)) throw new Error("Status code already exists");
    if (status.initial && this.#hasInitial(status.organizationId, status.entityType)) {
      throw new Error("An initial status already exists for this entity type");
    }
    this.statusStore.set(key, status);
    this.#audit(principal, "status.created", status, null, status);
    return status;
  }

  listStatuses({ principal, entityType = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, principal.organizationId);
    return [...this.statusStore.values()]
      .filter(status => status.organizationId === principal.organizationId)
      .filter(status => !entityType || status.entityType === entityType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }

  setTransitions({ principal, entityType, fromCode, toCodes }) {
    this.#requirePrincipal(principal);
    if (!entityType || !fromCode || !Array.isArray(toCodes)) {
      throw new Error("entityType, fromCode, and toCodes are required");
    }
    this.#authorize(principal, ACTIONS.UPDATE, principal.organizationId);
    const uniqueToCodes = [...new Set(toCodes)];
    const from = this.#find(principal.organizationId, entityType, fromCode);
    for (const toCode of uniqueToCodes) this.#find(principal.organizationId, entityType, toCode);
    if (from.terminal && uniqueToCodes.length) {
      throw new Error("Terminal status cannot have outgoing transitions");
    }
    this.transitionStore.set(this.#key(principal.organizationId, entityType, fromCode), uniqueToCodes);
    this.#audit(principal, "status.transitions_updated", from, null, { toCodes: uniqueToCodes });
    return uniqueToCodes;
  }

  getAllowedTransitions({ principal, entityType, fromCode }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, principal.organizationId);
    this.#find(principal.organizationId, entityType, fromCode);
    const toCodes = this.transitionStore.get(this.#key(principal.organizationId, entityType, fromCode)) || [];
    return toCodes.map(code => this.#find(principal.organizationId, entityType, code));
  }

  #find(organizationId, entityType, code) {
    const status = this.statusStore.get(this.#key(organizationId, entityType, code));
    if (!status) throw new Error("Status not found");
    return status;
  }

  #hasInitial(organizationId, entityType) {
    return [...this.statusStore.values()].some(status =>
      status.organizationId === organizationId &&
      status.entityType === entityType &&
      status.initial
    );
  }

  #key(organizationId, entityType, code) {
    return [organizationId, entityType, code].join(":");
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, { organizationId })) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  #audit(principal, action, status, previousValue, newValue) {
    this.auditStore.push(new AuditEvent({
      id: "status:" + action + ":" + status.id + ":" + (this.auditStore.length + 1),
      organizationId: status.organizationId,
      userId: principal.userId,
      action,
      entityType: "status_definition",
      entityId: status.id,
      previousValue,
      newValue
    }));
  }

  static defaultAuthorize(principal, action, { organizationId }) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { StatusConfigurationService, ACTIONS };
