const crypto = require("node:crypto");
const { FieldVisit } = require("../models/fieldVisit");

class FieldVisitService {
  constructor({
    fieldVisitStore = new Map(),
    appointmentStore = new Map(),
    workOrderService,
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
    this.auditStore = auditStore;
    this.domainEventService = domainEventService;
    this.authorize = authorize;
    this.clock = clock;
    this.completionValidator = completionValidator;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:create", principal.organizationId);

    const appointment = this.#getAppointment(principal.organizationId, input.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.workOrderId !== input.workOrderId) {
      throw new Error("Appointment is not linked to the requested work order");
    }

    const workOrder = this.workOrderService.getForOrganization({
      organizationId: principal.organizationId,
      jobId: undefined,
      workOrderId: input.workOrderId
    });
    if (!workOrder) throw new Error("Work order not found");

    const resourceIds = input.resourceIds === undefined ? appointment.memberIds : input.resourceIds;
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      throw new Error("At least one assigned resource is required");
    }
    const assigned = new Set(appointment.memberIds);
    if (resourceIds.some(resourceId => !assigned.has(resourceId))) {
      throw new Error("Field visit resources must be assigned to the appointment");
    }

    const visit = new FieldVisit({
      ...input,
      resourceIds,
      organizationId: principal.organizationId
    });
    const key = FieldVisitService.storageKey(visit.organizationId, visit.id);
    if (this.fieldVisitStore.has(key)) throw new Error("Field visit ID already exists");

    this.fieldVisitStore.set(key, visit);
    this.#audit(principal, "field-visit.created", visit.id, null, visit);
    this.#emit(principal, "field_visit.created", visit);
    return this.#clone(visit);
  }

  arrive({ principal, fieldVisitId, arrivedAt = null, statusCode = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    this.#ensureOpen(visit);
    if (visit.arrivedAt) throw new Error("Field visit has already recorded arrival");

    const arrival = arrivedAt === null ? this.clock() : new Date(arrivedAt);
    if (Number.isNaN(arrival.getTime())) throw new Error("arrivedAt must be a valid date");
    visit.arrivedAt = arrival;
    if (statusCode !== null) visit.statusCode = statusCode;
    this.#saveAndRecord(principal, visit, "field-visit.arrived", { arrivedAt: null }, {
      arrivedAt: arrival,
      statusCode: visit.statusCode
    });
    return this.#clone(visit);
  }

  start({ principal, fieldVisitId, actualStartTime = null, statusCode = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    this.#ensureOpen(visit);
    if (visit.actualStartTime) throw new Error("Field visit has already started");

    const start = actualStartTime === null ? this.clock() : new Date(actualStartTime);
    if (Number.isNaN(start.getTime())) throw new Error("actualStartTime must be a valid date");
    if (visit.arrivedAt && start < visit.arrivedAt) throw new Error("actualStartTime cannot be before arrivedAt");
    visit.actualStartTime = start;
    if (statusCode !== null) visit.statusCode = statusCode;
    this.#saveAndRecord(principal, visit, "field-visit.started", { actualStartTime: null }, {
      actualStartTime: start,
      statusCode: visit.statusCode
    });
    return this.#clone(visit);
  }

  stop({ principal, fieldVisitId, actualEndTime = null, statusCode = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    this.#ensureOpen(visit);
    if (!visit.actualStartTime) throw new Error("Field visit must be started before it can stop");
    if (visit.actualEndTime) throw new Error("Field visit has already stopped");

    const end = actualEndTime === null ? this.clock() : new Date(actualEndTime);
    if (Number.isNaN(end.getTime()) || end <= visit.actualStartTime) {
      throw new Error("actualEndTime must be after actualStartTime");
    }
    visit.actualEndTime = end;
    if (statusCode !== null) visit.statusCode = statusCode;
    this.#saveAndRecord(principal, visit, "field-visit.stopped", { actualEndTime: null }, {
      actualEndTime: end,
      statusCode: visit.statusCode
    });
    return this.#clone(visit);
  }

  complete({ principal, fieldVisitId, actualEndTime = null, completionData = {}, statusCode = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    this.#ensureOpen(visit);
    if (!visit.actualStartTime) throw new Error("Field visit must be started before completion");
    if (visit.completedAt) throw new Error("Field visit is already completed");

    const end = visit.actualEndTime || (actualEndTime === null ? this.clock() : new Date(actualEndTime));
    if (Number.isNaN(end.getTime()) || end <= visit.actualStartTime) {
      throw new Error("actualEndTime must be after actualStartTime");
    }
    if (!completionData || typeof completionData !== "object" || Array.isArray(completionData)) {
      throw new Error("completionData must be an object");
    }
    this.completionValidator({ visit, completionData, principal });

    visit.actualEndTime = end;
    visit.completedAt = this.clock();
    visit.completedByUserId = principal.userId;
    visit.completionData = structuredClone(completionData);
    if (statusCode !== null) visit.statusCode = statusCode;
    this.#saveAndRecord(principal, visit, "field-visit.completed", {
      completedAt: null,
      completedByUserId: null
    }, {
      actualEndTime: end,
      completedAt: visit.completedAt,
      completedByUserId: principal.userId,
      statusCode: visit.statusCode
    });
    return this.#clone(visit);
  }

  closeIncomplete({ principal, fieldVisitId, outcomeCode, outcomeReason, actualEndTime = null, statusCode = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    this.#ensureOpen(visit);
    if (!outcomeCode) throw new Error("outcomeCode is required");
    if (!outcomeReason) throw new Error("outcomeReason is required");
    if (visit.completedAt) throw new Error("Field visit is already completed");

    if (actualEndTime !== null) {
      const end = new Date(actualEndTime);
      if (Number.isNaN(end.getTime())) throw new Error("actualEndTime must be a valid date");
      if (visit.actualStartTime && end <= visit.actualStartTime) {
        throw new Error("actualEndTime must be after actualStartTime");
      }
      visit.actualEndTime = end;
    }

    visit.outcomeCode = outcomeCode;
    visit.outcomeReason = outcomeReason;
    visit.closedAt = this.clock();
    visit.closedByUserId = principal.userId;
    if (statusCode !== null) visit.statusCode = statusCode;
    this.#saveAndRecord(principal, visit, "field-visit.closed_incomplete", {
      closedAt: null,
      closedByUserId: null
    }, {
      outcomeCode,
      outcomeReason,
      closedAt: visit.closedAt,
      closedByUserId: principal.userId,
      statusCode: visit.statusCode
    });
    return this.#clone(visit);
  }

  get({ principal, fieldVisitId }) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:read", visit.organizationId);
    return this.#clone(visit);
  }

  getForOrganization({ organizationId, fieldVisitId }) {
    return this.fieldVisitStore.get(FieldVisitService.storageKey(organizationId, fieldVisitId)) ?? null;
  }

  list({ principal, appointmentId = null, workOrderId = null, resourceId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:read", principal.organizationId);
    return [...this.fieldVisitStore.values()]
      .filter(visit => visit.organizationId === principal.organizationId)
      .filter(visit => !appointmentId || visit.appointmentId === appointmentId)
      .filter(visit => !workOrderId || visit.workOrderId === workOrderId)
      .filter(visit => !resourceId || visit.resourceIds.includes(resourceId))
      .map(visit => this.#clone(visit));
  }

  static storageKey(organizationId, id) {
    return JSON.stringify([organizationId, id]);
  }

  static defaultCompletionValidator({ completionData }) {
    if (Object.keys(completionData).length === 0) {
      throw new Error("completionData is required");
    }
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

  #saveAndRecord(principal, visit, action, previousValue, newValue) {
    this.fieldVisitStore.set(FieldVisitService.storageKey(visit.organizationId, visit.id), visit);
    this.#audit(principal, action, visit.id, previousValue, newValue);
    this.#emit(principal, action.replaceAll("-", "_"), visit);
  }

  #audit(principal, action, entityId, previousValue, newValue) {
    const { AuditEvent } = require("../models/auditEvent");
    this.auditStore.push(new AuditEvent({
      id: action + ":" + entityId + ":" + (this.auditStore.length + 1),
      organizationId: principal.organizationId,
      userId: principal.userId,
      action,
      entityType: "field_visit",
      entityId,
      previousValue,
      newValue
    }));
  }

  #emit(principal, eventType, visit) {
    if (!this.domainEventService) return;
    this.domainEventService.emit({
      principal,
      id: crypto.randomUUID(),
      eventType,
      entityType: "field_visit",
      entityId: visit.id,
      payload: {
        appointmentId: visit.appointmentId,
        workOrderId: visit.workOrderId,
        resourceIds: visit.resourceIds,
        statusCode: visit.statusCode,
        arrivedAt: visit.arrivedAt,
        actualStartTime: visit.actualStartTime,
        actualEndTime: visit.actualEndTime,
        completedAt: visit.completedAt,
        completedByUserId: visit.completedByUserId,
        closedAt: visit.closedAt,
        closedByUserId: visit.closedByUserId,
        outcomeCode: visit.outcomeCode,
        outcomeReason: visit.outcomeReason,
        notes: visit.notes,
        observations: visit.observations,
        completionData: visit.completionData
      }
    });
  }

  #clone(visit) {
    return new FieldVisit({
      id: visit.id,
      organizationId: visit.organizationId,
      appointmentId: visit.appointmentId,
      workOrderId: visit.workOrderId,
      statusCode: visit.statusCode,
      resourceIds: visit.resourceIds,
      arrivedAt: visit.arrivedAt,
      actualStartTime: visit.actualStartTime,
      actualEndTime: visit.actualEndTime,
      completedAt: visit.completedAt,
      completedByUserId: visit.completedByUserId,
      closedAt: visit.closedAt,
      closedByUserId: visit.closedByUserId,
      outcomeCode: visit.outcomeCode,
      outcomeReason: visit.outcomeReason,
      notes: visit.notes,
      observations: visit.observations,
      completionData: visit.completionData,
      metadata: visit.metadata
    });
  }
  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) {
      const error = new Error("Not authorized");
      error.statusCode = 403;
      throw error;
    }
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId
      && Array.isArray(principal.permissions)
      && principal.permissions.includes(action);
  }

}

module.exports = { FieldVisitService };