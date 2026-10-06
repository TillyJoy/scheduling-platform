const crypto = require("node:crypto");
const { ActualWork } = require("../models/actualWork");
const { AuditEvent } = require("../models/auditEvent");

class ActualWorkService {
  constructor({
    actualWorkStore = new Map(),
    fieldVisitStore = new Map(),
    fieldVisitRepository = null,
    actualWorkRepository = null,
    transaction = null,
    auditStore = [],
    domainEventService = null,
    authorize = ActualWorkService.defaultAuthorize
  } = {}) {
    this.actualWorkStore = actualWorkStore;
    this.fieldVisitStore = fieldVisitStore;
    if (actualWorkRepository && (!fieldVisitRepository || !transaction)) throw new Error("field visit repository and transaction are required with actual work repository");
    this.fieldVisitRepository = fieldVisitRepository;
    this.actualWorkRepository = actualWorkRepository;
    this.transaction = transaction;
    this.auditStore = auditStore;
    this.domainEventService = domainEventService;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.actualWorkRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get({ principal, actualWorkId } = {}) {
    this.#requirePrincipal(principal);
    if (!this.actualWorkRepository) {
      const work = this.actualWorkStore.get(ActualWorkService.storageKey(principal.organizationId, actualWorkId));
      if (!work) throw new Error("Actual work not found");
      this.#authorize(principal, "actualWork:read", work.organizationId);
      return this.#clone(work);
    }
    const read = async db => this.actualWorkRepository.get({ principal, actualWorkId, db });
    const load = this.transaction
      ? this.transaction(principal, "actual-work.read", read)
      : this.actualWorkRepository.get({ principal, actualWorkId });
    return load.then(work => {
      if (!work) throw new Error("Actual work not found");
      this.#authorize(principal, "actualWork:read", work.organizationId);
      return this.#clone(work);
    });
  }

  list({ principal, fieldVisitId = null, workOrderId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "actualWork:read", principal.organizationId);
    if (!this.actualWorkRepository) {
      return [...this.actualWorkStore.values()]
        .filter(work => work.organizationId === principal.organizationId)
        .filter(work => !fieldVisitId || work.fieldVisitId === fieldVisitId)
        .filter(work => !workOrderId || work.workOrderId === workOrderId)
        .map(work => this.#clone(work));
    }
    const read = async db => this.actualWorkRepository.list({ principal, fieldVisitId, workOrderId, db });
    const load = this.transaction
      ? this.transaction(principal, "actual-work.list", read)
      : this.actualWorkRepository.list({ principal, fieldVisitId, workOrderId });
    return load.then(work => work.map(item => this.#clone(item)));
  }

  async #durableCreate({ principal, occurredAt = null, db = null, deferEvents = false, postCommit = [], ...input } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "actualWork:create", principal.organizationId);
    const work = new ActualWork({ ...input, organizationId: principal.organizationId });
    const write = async client => {
      const visit = await this.fieldVisitRepository.get({ principal, fieldVisitId: input.fieldVisitId, db: client });
      if (!visit) throw new Error("Field visit not found");
      if (visit.organizationId !== principal.organizationId) throw new Error("Not authorized");
      if (visit.workOrderId !== input.workOrderId) throw new Error("Actual work is not linked to the field visit work order");
      const existing = await this.actualWorkRepository.get({ principal, actualWorkId: work.id, db: client });
      if (existing) throw new Error("Actual work ID already exists");
      const saved = await this.actualWorkRepository.create({ principal, work, db: client });
      if (deferEvents) postCommit.push(() => this.#record(principal, saved, occurredAt === null ? new Date() : new Date(occurredAt)));
      else this.#record(principal, saved, occurredAt === null ? new Date() : new Date(occurredAt));
      return saved;
    };
    return db ? write(db) : this.#inTransaction(principal, "actual-work.create", write);
  }

  #memoryCreate({ principal, occurredAt = null, ...input } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "actualWork:create", principal.organizationId);
    const visit = this.fieldVisitStore.get(JSON.stringify([principal.organizationId, input.fieldVisitId]));
    if (!visit) throw new Error("Field visit not found");
    if (visit.organizationId !== principal.organizationId) throw new Error("Not authorized");
    if (visit.workOrderId !== input.workOrderId) throw new Error("Actual work is not linked to the field visit work order");
    const work = new ActualWork({ ...input, organizationId: principal.organizationId });
    const key = ActualWorkService.storageKey(work.organizationId, work.id);
    if (this.actualWorkStore.has(key)) throw new Error("Actual work ID already exists");
    this.actualWorkStore.set(key, work);
    this.#record(principal, work, occurredAt === null ? new Date() : new Date(occurredAt));
    return this.#clone(work);
  }

  #record(principal, work, occurredAt) {
    this.auditStore.push(new AuditEvent({
      id: "actual-work.created:" + work.id + ":" + (this.auditStore.length + 1),
      organizationId: principal.organizationId, userId: principal.userId,
      action: "actual-work.created", entityType: "actual_work", entityId: work.id,
      newValue: {
        fieldVisitId: work.fieldVisitId, workOrderId: work.workOrderId, resourceId: work.resourceId,
        description: work.description, actualStartTime: work.actualStartTime, actualEndTime: work.actualEndTime,
        quantity: work.quantity, unit: work.unit
      }, createdAt: occurredAt
    }));
    if (this.domainEventService) {
      await this.domainEventService.emit({
        principal, id: crypto.randomUUID(), eventType: "actual_work.recorded",
        entityType: "actual_work", entityId: work.id, occurredAt,
        payload: {
          fieldVisitId: work.fieldVisitId, workOrderId: work.workOrderId, resourceId: work.resourceId,
          description: work.description, actualStartTime: work.actualStartTime, actualEndTime: work.actualEndTime,
          quantity: work.quantity, unit: work.unit
        }
      });
    }
  }

  async #inTransaction(principal, action, work) {
    if (!this.transaction) return work(this.actualWorkRepository.pool);
    return this.transaction(principal, action, work);
  }

  #clone(work) {
    return new ActualWork({
      id: work.id, organizationId: work.organizationId, fieldVisitId: work.fieldVisitId,
      workOrderId: work.workOrderId, resourceId: work.resourceId, description: work.description,
      actualStartTime: work.actualStartTime, actualEndTime: work.actualEndTime, quantity: work.quantity,
      unit: work.unit, metadata: work.metadata
    });
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) {
      const error = new Error("Not authorized"); error.statusCode = 403; throw error;
    }
  }
  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
  static storageKey(organizationId, id) { return JSON.stringify([organizationId, id]); }
  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId && Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}
module.exports = { ActualWorkService };
