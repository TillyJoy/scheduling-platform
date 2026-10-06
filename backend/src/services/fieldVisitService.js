const crypto = require("node:crypto");
const { FieldVisit } = require("../models/fieldVisit");

class FieldVisitService {
  constructor({
    fieldVisitStore = new Map(),
    appointmentStore = new Map(),
    workOrderService,
    fieldVisitRepository = null,
    transaction = null,
    auditStore = [],
    domainEventService = null,
    authorize = FieldVisitService.defaultAuthorize,
    clock = () => new Date(),
    completionValidator = FieldVisitService.defaultCompletionValidator
  } = {}) {
    if (!workOrderService) throw new Error("workOrderService is required");
    this.fieldVisitStore = fieldVisitStore;
    this.appointmentStore = appointmentStore;
    this.workOrderService = workOrderService;
    if (fieldVisitRepository && !transaction) throw new Error("transaction is required with fieldVisitRepository");
    this.fieldVisitRepository = fieldVisitRepository;
    this.transaction = transaction;
    this.auditStore = auditStore;
    this.domainEventService = domainEventService;
    this.authorize = authorize;
    this.clock = clock;
    this.completionValidator = completionValidator;
  }

  create(args = {}) {
    return this.fieldVisitRepository
      ? this.#durableCreate(args)
      : this.#memoryCreate(args);
  }

  arrive(args = {}) { return this.fieldVisitRepository ? this.#durableLifecycle("arrive", args) : this.#memoryLifecycle("arrive", args); }
  start(args = {}) { return this.fieldVisitRepository ? this.#durableLifecycle("start", args) : this.#memoryLifecycle("start", args); }
  stop(args = {}) { return this.fieldVisitRepository ? this.#durableLifecycle("stop", args) : this.#memoryLifecycle("stop", args); }
  complete(args = {}) { return this.fieldVisitRepository ? this.#durableLifecycle("complete", args) : this.#memoryLifecycle("complete", args); }
  closeIncomplete(args = {}) { return this.fieldVisitRepository ? this.#durableLifecycle("closeIncomplete", args) : this.#memoryLifecycle("closeIncomplete", args); }

  get({ principal, fieldVisitId } = {}) {
    this.#requirePrincipal(principal);
    if (!this.fieldVisitRepository) {
      const visit = this.#getForPrincipal(principal, fieldVisitId);
      this.#authorize(principal, "fieldVisit:read", visit.organizationId);
      return this.#clone(visit);
    }
    const read = async db => this.fieldVisitRepository.get({ principal, fieldVisitId, db });
    const load = this.transaction
      ? this.transaction(principal, "field-visit.read", read)
      : this.fieldVisitRepository.get({ principal, fieldVisitId });
    return load.then(visit => {
      if (!visit) throw new Error("Field visit not found");
      this.#authorize(principal, "fieldVisit:read", visit.organizationId);
      return this.#clone(visit);
    });
  }

  getForOrganization({ organizationId, fieldVisitId } = {}) {
    if (!this.fieldVisitRepository) {
      return this.fieldVisitStore.get(FieldVisitService.storageKey(organizationId, fieldVisitId)) ?? null;
    }
    const principal = { userId: "system", organizationId };
    const read = async db => this.fieldVisitRepository.get({ principal, fieldVisitId, db });
    return this.transaction ? this.transaction(principal, "field-visit.read", read) : read(this.fieldVisitRepository.pool);
  }

  list({ principal, appointmentId = null, workOrderId = null, resourceId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:read", principal.organizationId);
    if (!this.fieldVisitRepository) {
      return [...this.fieldVisitStore.values()]
        .filter(visit => visit.organizationId === principal.organizationId)
        .filter(visit => !appointmentId || visit.appointmentId === appointmentId)
        .filter(visit => !workOrderId || visit.workOrderId === workOrderId)
        .filter(visit => !resourceId || visit.resourceIds.includes(resourceId))
        .map(visit => this.#clone(visit));
    }
    const read = async db => this.fieldVisitRepository.list({ principal, appointmentId, workOrderId, resourceId, db });
    const load = this.transaction
      ? this.transaction(principal, "field-visit.list", read)
      : this.fieldVisitRepository.list({ principal, appointmentId, workOrderId, resourceId });
    return load.then(visits => visits.map(visit => this.#clone(visit)));
  }

  async #durableCreate({ principal, occurredAt = null, db = null, deferEvents = false, postCommit = [], ...input } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:create", principal.organizationId);
    const appointment = this.#getAppointment(principal.organizationId, input.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.workOrderId !== input.workOrderId) throw new Error("Appointment is not linked to the requested work order");
    const workOrder = await this.workOrderService.getForOrganization({
      organizationId: principal.organizationId, jobId: undefined, workOrderId: input.workOrderId, db
    });
    if (!workOrder) throw new Error("Work order not found");
    const resourceIds = input.resourceIds === undefined ? appointment.memberIds : input.resourceIds;
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) throw new Error("At least one assigned resource is required");
    const assigned = new Set(appointment.memberIds);
    if (resourceIds.some(resourceId => !assigned.has(resourceId))) throw new Error("Field visit resources must be assigned to the appointment");
    const visit = new FieldVisit({ ...input, resourceIds, organizationId: principal.organizationId });
    const eventTime = occurredAt === null ? this.clock() : new Date(occurredAt);
    if (Number.isNaN(eventTime.getTime())) throw new Error("occurredAt must be a valid date");
    const write = async client => {
      const existing = await this.fieldVisitRepository.get({ principal, fieldVisitId: visit.id, db: client });
      if (existing) throw new Error("Field visit ID already exists");
      const saved = await this.fieldVisitRepository.create({ principal, visit, db: client });
      if (deferEvents) postCommit.push(() => this.#record(principal, saved, "field-visit.created", null, saved, eventTime));
      else this.#record(principal, saved, "field-visit.created", null, saved, eventTime);
      return saved;
    };
    return db ? write(db) : this.#inTransaction(principal, "field-visit.create", write);
  }

  async #durableLifecycle(action, args = {}) {
    const { principal, fieldVisitId, expectedVersion = null, deferEvents = false, postCommit = [] } = args;
    this.#requirePrincipal(principal);
    const run = async client => {
      const current = await this.fieldVisitRepository.get({ principal, fieldVisitId, db: client });
      if (!current) throw new Error("Field visit not found");
      this.#authorize(principal, "fieldVisit:update", current.organizationId);
      this.#assertExpectedVersion(current, expectedVersion);
      const previousVersion = current.version;
      const visit = this.#applyLifecycle(action, current, args);
      const saved = await this.fieldVisitRepository.replace({
        principal, fieldVisit: visit, expectedVersion: previousVersion, db: client
      });
      if (deferEvents) postCommit.push(() => this.#recordLifecycle(principal, saved, action, args));
      else this.#recordLifecycle(principal, saved, action, args);
      return saved;
    };
    return args.db ? run(args.db) : this.#inTransaction(principal, "field-visit." + action, run);
  }

  #applyLifecycle(action, visit, args) {
    const now = this.clock();
    this.#ensureOpen(visit);
    if (action === "arrive") {
      if (visit.arrivedAt) throw new Error("Field visit has already recorded arrival");
      const arrival = args.arrivedAt === null || args.arrivedAt === undefined ? now : new Date(args.arrivedAt);
      if (Number.isNaN(arrival.getTime())) throw new Error("arrivedAt must be a valid date");
      visit.arrivedAt = arrival;
      if (args.statusCode !== null && args.statusCode !== undefined) visit.statusCode = args.statusCode;
    } else if (action === "start") {
      if (visit.actualStartTime) throw new Error("Field visit has already started");
      const start = args.actualStartTime === null || args.actualStartTime === undefined ? now : new Date(args.actualStartTime);
      if (Number.isNaN(start.getTime())) throw new Error("actualStartTime must be a valid date");
      if (visit.arrivedAt && start < visit.arrivedAt) throw new Error("actualStartTime cannot be before arrivedAt");
      visit.actualStartTime = start;
      if (args.statusCode !== null && args.statusCode !== undefined) visit.statusCode = args.statusCode;
    } else if (action === "stop") {
      if (!visit.actualStartTime) throw new Error("Field visit must be started before it can stop");
      if (visit.actualEndTime) throw new Error("Field visit has already stopped");
      const end = args.actualEndTime === null || args.actualEndTime === undefined ? now : new Date(args.actualEndTime);
      if (Number.isNaN(end.getTime()) || end <= visit.actualStartTime) throw new Error("actualEndTime must be after actualStartTime");
      visit.actualEndTime = end;
      if (args.statusCode !== null && args.statusCode !== undefined) visit.statusCode = args.statusCode;
    } else if (action === "complete") {
      if (!visit.actualStartTime) throw new Error("Field visit must be started before completion");
      if (visit.completedAt) throw new Error("Field visit is already completed");
      const end = visit.actualEndTime || (args.actualEndTime === null || args.actualEndTime === undefined ? now : new Date(args.actualEndTime));
      if (Number.isNaN(end.getTime()) || end <= visit.actualStartTime) throw new Error("actualEndTime must be after actualStartTime");
      const completionData = args.completionData === undefined ? {} : args.completionData;
      if (!completionData || typeof completionData !== "object" || Array.isArray(completionData)) throw new Error("completionData must be an object");
      this.completionValidator({ visit, completionData, principal: args.principal });
      visit.actualEndTime = end;
      visit.completedAt = args.completedAt === null || args.completedAt === undefined ? now : new Date(args.completedAt);
      if (Number.isNaN(visit.completedAt.getTime())) throw new Error("completedAt must be a valid date");
      visit.completedByUserId = args.principal.userId;
      visit.completionData = structuredClone(completionData);
      if (args.statusCode !== null && args.statusCode !== undefined) visit.statusCode = args.statusCode;
    } else if (action === "closeIncomplete") {
      if (!args.outcomeCode) throw new Error("outcomeCode is required");
      if (!args.outcomeReason) throw new Error("outcomeReason is required");
      if (visit.completedAt) throw new Error("Field visit is already completed");
      if (args.actualEndTime !== null && args.actualEndTime !== undefined) {
        const end = new Date(args.actualEndTime);
        if (Number.isNaN(end.getTime())) throw new Error("actualEndTime must be a valid date");
        if (visit.actualStartTime && end <= visit.actualStartTime) throw new Error("actualEndTime must be after actualStartTime");
        visit.actualEndTime = end;
      }
      visit.outcomeCode = args.outcomeCode;
      visit.outcomeReason = args.outcomeReason;
      visit.closedAt = args.closedAt === null || args.closedAt === undefined ? now : new Date(args.closedAt);
      if (Number.isNaN(visit.closedAt.getTime())) throw new Error("closedAt must be a valid date");
      visit.closedByUserId = args.principal.userId;
      if (args.statusCode !== null && args.statusCode !== undefined) visit.statusCode = args.statusCode;
    } else {
      throw new Error("Unsupported field visit action");
    }
    visit.version += 1;
    return visit;
  }

  #memoryCreate({ principal, occurredAt = null, ...input } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:create", principal.organizationId);
    const appointment = this.#getAppointment(principal.organizationId, input.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.workOrderId !== input.workOrderId) throw new Error("Appointment is not linked to the requested work order");
    const workOrder = this.workOrderService.getForOrganization({ organizationId: principal.organizationId, jobId: undefined, workOrderId: input.workOrderId });
    if (!workOrder) throw new Error("Work order not found");
    const resourceIds = input.resourceIds === undefined ? appointment.memberIds : input.resourceIds;
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) throw new Error("At least one assigned resource is required");
    const assigned = new Set(appointment.memberIds);
    if (resourceIds.some(resourceId => !assigned.has(resourceId))) throw new Error("Field visit resources must be assigned to the appointment");
    const visit = new FieldVisit({ ...input, resourceIds, organizationId: principal.organizationId });
    const key = FieldVisitService.storageKey(visit.organizationId, visit.id);
    if (this.fieldVisitStore.has(key)) throw new Error("Field visit ID already exists");
    const eventTime = occurredAt === null ? this.clock() : new Date(occurredAt);
    if (Number.isNaN(eventTime.getTime())) throw new Error("occurredAt must be a valid date");
    this.fieldVisitStore.set(key, visit);
    this.#record(principal, visit, "field-visit.created", null, visit, eventTime);
    return this.#clone(visit);
  }

  #memoryLifecycle(action, args = {}) {
    const visit = this.#getForPrincipal(args.principal, args.fieldVisitId);
    this.#authorize(args.principal, "fieldVisit:update", visit.organizationId);
    this.#assertExpectedVersion(visit, args.expectedVersion);
    this.#applyLifecycle(action, visit, args);
    this.#recordLifecycle(args.principal, visit, action, args);
    return this.#clone(visit);
  }

  #recordLifecycle(principal, visit, action, args) {
    const times = {
      arrive: visit.arrivedAt, start: visit.actualStartTime, stop: visit.actualEndTime,
      complete: visit.completedAt, closeIncomplete: visit.closedAt
    };
    this.#record(principal, visit, "field-visit." + ({ arrive: "arrived", start: "started", stop: "stopped", complete: "completed", closeIncomplete: "closed_incomplete" }[action]), null, {
      ...visit, version: visit.version
    }, times[action] || this.clock());
  }

  #record(principal, visit, action, previousValue, newValue, occurredAt) {
    this.#audit(principal, action, visit.id, previousValue, newValue, occurredAt);
    this.#emit(principal, action.replaceAll("-", "_"), visit, occurredAt);
  }

  #audit(principal, action, entityId, previousValue, newValue, createdAt = this.clock()) {
    const { AuditEvent } = require("../models/auditEvent");
    this.auditStore.push(new AuditEvent({
      id: action + ":" + entityId + ":" + (this.auditStore.length + 1),
      organizationId: principal.organizationId, userId: principal.userId, action,
      entityType: "field_visit", entityId, previousValue, newValue, createdAt
    }));
  }

  #emit(principal, eventType, visit, occurredAt = this.clock()) {
    if (!this.domainEventService) return;
    await this.domainEventService.emit({
      principal, id: crypto.randomUUID(), eventType, entityType: "field_visit",
      entityId: visit.id, occurredAt,
      payload: {
        version: visit.version, appointmentId: visit.appointmentId, workOrderId: visit.workOrderId,
        resourceIds: visit.resourceIds, statusCode: visit.statusCode, arrivedAt: visit.arrivedAt,
        actualStartTime: visit.actualStartTime, actualEndTime: visit.actualEndTime,
        completedAt: visit.completedAt, completedByUserId: visit.completedByUserId,
        closedAt: visit.closedAt, closedByUserId: visit.closedByUserId,
        outcomeCode: visit.outcomeCode, outcomeReason: visit.outcomeReason,
        notes: visit.notes, observations: visit.observations, completionData: visit.completionData
      }
    });
  }

  async #inTransaction(principal, action, work) {
    if (!this.transaction) return work(this.fieldVisitRepository.pool);
    return this.transaction(principal, action, work);
  }

  #getAppointment(organizationId, appointmentId) {
    return this.appointmentStore.get(JSON.stringify([organizationId, appointmentId])) ?? null;
  }

  #getForPrincipal(principal, fieldVisitId) {
    const visit = this.fieldVisitStore.get(FieldVisitService.storageKey(principal.organizationId, fieldVisitId));
    if (!visit) throw new Error("Field visit not found");
    if (visit.organizationId !== principal.organizationId) throw new Error("Not authorized");
    return visit;
  }

  #ensureOpen(visit) {
    if (visit.completedAt || visit.closedAt) throw new Error("Field visit is already closed");
  }

  #assertExpectedVersion(visit, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      const error = new Error("expectedVersion must be a positive integer"); error.statusCode = 409; throw error;
    }
    if (visit.version !== expectedVersion) {
      const error = new Error("Field visit version conflict: expected " + expectedVersion + ", current " + visit.version); error.statusCode = 409; throw error;
    }
  }

  #clone(visit) { return new FieldVisit({
    id: visit.id, organizationId: visit.organizationId, version: visit.version,
    appointmentId: visit.appointmentId, workOrderId: visit.workOrderId, statusCode: visit.statusCode,
    resourceIds: visit.resourceIds, arrivedAt: visit.arrivedAt, actualStartTime: visit.actualStartTime,
    actualEndTime: visit.actualEndTime, completedAt: visit.completedAt, completedByUserId: visit.completedByUserId,
    closedAt: visit.closedAt, closedByUserId: visit.closedByUserId, outcomeCode: visit.outcomeCode,
    outcomeReason: visit.outcomeReason, notes: visit.notes, observations: visit.observations,
    completionData: visit.completionData, metadata: visit.metadata
  }); }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) { const error = new Error("Not authorized"); error.statusCode = 403; throw error; }
  }
  #requirePrincipal(principal) { if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required"); }
  static storageKey(organizationId, id) { return JSON.stringify([organizationId, id]); }
  static defaultCompletionValidator({ completionData }) {
    if (Object.keys(completionData).length === 0) throw new Error("completionData is required");
  }
  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId && Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}

module.exports = { FieldVisitService };
