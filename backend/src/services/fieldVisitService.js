const crypto = require("node:crypto");
const { FieldVisit } = require("../models/fieldVisit");
const { AuditEvent } = require("../models/auditEvent");

class FieldVisitService {
  constructor({
    fieldVisitStore = new Map(),
    appointmentStore = new Map(),
    workOrderService,
    auditStore = [],
    domainEventService = null,
    authorize = FieldVisitService.defaultAuthorize,
    clock = () => new Date()
  } = {}) {
    if (!workOrderService) throw new Error("workOrderService is required");
    this.fieldVisitStore = fieldVisitStore;
    this.appointmentStore = appointmentStore;
    this.workOrderService = workOrderService;
    this.auditStore = auditStore;
    this.domainEventService = domainEventService;
    this.authorize = authorize;
    this.clock = clock;
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

    const visit = new FieldVisit({
      ...input,
      organizationId: principal.organizationId
    });
    const key = FieldVisitService.storageKey(visit.organizationId, visit.id);
    if (this.fieldVisitStore.has(key)) throw new Error("Field visit ID already exists");

    this.fieldVisitStore.set(key, visit);
    this.#audit(principal, "field-visit.created", visit.id, null, visit);
    this.#emit(principal, "field_visit.created", visit);
    return this.#clone(visit);
  }

  start({ principal, fieldVisitId, actualStartTime = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    if (visit.actualStartTime) throw new Error("Field visit has already started");
    if (visit.completedAt) throw new Error("Completed field visit cannot be started");

    const start = actualStartTime === null ? this.clock() : new Date(actualStartTime);
    if (Number.isNaN(start.getTime())) throw new Error("actualStartTime must be a valid date");
    visit.actualStartTime = start;
    this.fieldVisitStore.set(FieldVisitService.storageKey(visit.organizationId, visit.id), visit);
    this.#audit(principal, "field-visit.started", visit.id, { actualStartTime: null }, { actualStartTime: start });
    this.#emit(principal, "field_visit.started", visit);
    return this.#clone(visit);
  }

  complete({ principal, fieldVisitId, actualEndTime = null } = {}) {
    this.#requirePrincipal(principal);
    const visit = this.#getForPrincipal(principal, fieldVisitId);
    this.#authorize(principal, "fieldVisit:update", visit.organizationId);
    if (!visit.actualStartTime) throw new Error("Field visit must be started before completion");
    if (visit.completedAt) throw new Error("Field visit is already completed");

    const end = actualEndTime === null ? this.clock() : new Date(actualEndTime);
    if (Number.isNaN(end.getTime()) || end <= visit.actualStartTime) {
      throw new Error("actualEndTime must be after actualStartTime");
    }

    visit.actualEndTime = end;
    visit.completedAt = end;
    visit.completedByUserId = principal.userId;
    this.fieldVisitStore.set(FieldVisitService.storageKey(visit.organizationId, visit.id), visit);
    this.#audit(principal, "field-visit.completed", visit.id, { actualEndTime: null }, {
      actualEndTime: end,
      completedAt: end,
      completedByUserId: principal.userId
    });
    this.#emit(principal, "field_visit.completed", visit);
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

  list({ principal, appointmentId = null, workOrderId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldVisit:read", principal.organizationId);
    return [...this.fieldVisitStore.values()]
      .filter(visit => visit.organizationId === principal.organizationId)
      .filter(visit => !appointmentId || visit.appointmentId === appointmentId)
      .filter(visit => !workOrderId || visit.workOrderId === workOrderId)
      .map(visit => this.#clone(visit));
  }

  static storageKey(organizationId, id) {
    return JSON.stringify([organizationId, id]);
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

  #audit(principal, action, entityId, previousValue, newValue) {
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
        statusCode: visit.statusCode,
        actualStartTime: visit.actualStartTime,
        actualEndTime: visit.actualEndTime,
        completedAt: visit.completedAt
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
      actualStartTime: visit.actualStartTime,
      actualEndTime: visit.actualEndTime,
      completedAt: visit.completedAt,
      completedByUserId: visit.completedByUserId,
      metadata: visit.metadata
    });
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId
      && Array.isArray(principal.permissions)
      && principal.permissions.includes(action);
  }
}

module.exports = { FieldVisitService };
