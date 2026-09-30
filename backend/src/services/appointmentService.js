const { Appointment } = require("../models/appointment");

class AppointmentService {
  constructor({
    appointmentStore = new Map(),
    holdStore = new Map(),
    schedulingHolds = [],
    schedulingService = null,
    durationService = null,
    authorize = AppointmentService.defaultAuthorize,
    clock = () => new Date(),
    statusResolver = null
  } = {}) {
    this.appointmentStore = appointmentStore;
    this.holdStore = holdStore;
    this.schedulingHolds = schedulingHolds;
    this.schedulingService = schedulingService;
    this.durationService = durationService;
    this.authorize = authorize;
    this.clock = clock;
    this.statusResolver = statusResolver;
  }

  create({ principal, enforceAvailability = false, ...input }) {
    this.#requirePrincipal(principal);

    const appointmentInput = { ...input };
    this.#authorize(principal, "appointment:create", appointmentInput.organizationId);
    if (!appointmentInput.endTime) {
      if (!this.durationService) throw new Error("endTime is required when duration service is unavailable");
      const durationMinutes = this.durationService.calculate({
        organizationId: principal.organizationId,
        serviceIds: appointmentInput.serviceIds,
        funderId: appointmentInput.funderId ?? null,
        unitCount: appointmentInput.unitIds?.length ?? 0,
        propertyType: appointmentInput.propertyType ?? null
      });
      const start = new Date(appointmentInput.startTime);
      if (Number.isNaN(start.getTime())) throw new Error("startTime must be a valid date");
      appointmentInput.endTime = new Date(start.getTime() + durationMinutes * 60000);
    }

    const appointment = new Appointment(appointmentInput);
    const key = this.#key(appointment.organizationId, appointment.id);
    if (this.appointmentStore.has(key)) {
      const error = new Error("Appointment ID already exists");
      error.statusCode = 409;
      throw error;
    }
    this.#assertResourcesAvailable(appointment);
    if (enforceAvailability) this.#assertExactAvailability(appointment);
    this.appointmentStore.set(key, appointment);
    return appointment;
  }

  createHold({
    principal,
    id,
    organizationId,
    clientId,
    propertyId,
    workOrderId = null,
    unitIds = [],
    serviceIds = [],
    teamId = null,
    memberIds = [],
    startTime,
    endTime,
    expiresAt
  }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:create", organizationId);
    if (!expiresAt) throw new Error("expiresAt is required");
    if (!Array.isArray(memberIds) || memberIds.length === 0) throw new Error("memberIds must not be empty");

    const start = new Date(startTime);
    const end = new Date(endTime);
    const expiry = new Date(expiresAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("endTime must be after startTime");
    }
    if (Number.isNaN(expiry.getTime()) || expiry <= this.clock()) {
      throw new Error("expiresAt must be in the future");
    }

    const key = this.#key(organizationId, id);
    if (this.appointmentStore.has(key) || this.holdStore.has(key)) {
      throw new Error("Appointment ID already exists");
    }

    this.#assertExactAvailability({
      organizationId,
      serviceIds,
      teamId,
      memberIds,
      startTime: start,
      endTime: end
    });

    const hold = {
      id,
      organizationId,
      clientId,
      propertyId,
      workOrderId,
      unitIds: [...unitIds],
      serviceIds: [...serviceIds],
      teamId,
      memberIds: [...memberIds],
      resourceIds: [...memberIds],
      startTime: start,
      endTime: end,
      status: "active",
      expiresAt: expiry
    };
    this.holdStore.set(key, hold);
    this.schedulingHolds.push(hold);
    return this.#cloneHold(hold);
  }

  confirmHold({ principal, holdId, status = "scheduled" }) {
    this.#requirePrincipal(principal);
    const key = this.#key(principal.organizationId, holdId);
    const hold = this.holdStore.get(key);
    if (!hold) throw new Error("Appointment hold not found");
    this.#authorize(principal, "appointment:confirm", hold.organizationId);
    this.#expireIfNeeded(hold);
    if (hold.status !== "active") throw new Error("Appointment hold is no longer active");

    const appointment = this.create({
      principal,
      id: hold.id,
      organizationId: hold.organizationId,
      clientId: hold.clientId,
      propertyId: hold.propertyId,
      workOrderId: hold.workOrderId,
      unitIds: hold.unitIds,
      serviceIds: hold.serviceIds,
      teamId: hold.teamId,
      memberIds: hold.memberIds,
      startTime: hold.startTime,
      endTime: hold.endTime,
      status
    });

    hold.status = "confirmed";
    this.holdStore.set(key, hold);
    return appointment;
  }

  cancelHold({ principal, holdId }) {
    this.#requirePrincipal(principal);
    const key = this.#key(principal.organizationId, holdId);
    const hold = this.holdStore.get(key);
    if (!hold) throw new Error("Appointment hold not found");
    this.#authorize(principal, "appointment:cancel", hold.organizationId);
    if (hold.status === "active") hold.status = "cancelled";
    this.holdStore.set(key, hold);
    return this.#cloneHold(hold);
  }

  expireHolds() {
    for (const hold of this.holdStore.values()) this.#expireIfNeeded(hold);
  }

  get({ principal, appointmentId }) {
    this.#requirePrincipal(principal);
    const appointment = this.appointmentStore.get(this.#key(principal.organizationId, appointmentId));
    if (!appointment) throw new Error("Appointment not found");
    this.#authorize(principal, "appointment:read", appointment.organizationId);
    return appointment;
  }

  list({ principal, startTime = null, endTime = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:read", principal.organizationId);
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    return [...this.appointmentStore.values()]
      .filter(a => a.organizationId === principal.organizationId)
      .filter(a => !start || a.endTime > start)
      .filter(a => !end || a.startTime < end)
      .sort((a, b) => a.startTime - b.startTime);
  }

  #assertExactAvailability(candidate) {
    if (!this.schedulingService) {
      const error = new Error("Scheduling availability is required to create an appointment");
      error.statusCode = 500;
      throw error;
    }
    if (!Array.isArray(candidate.memberIds) || candidate.memberIds.length === 0) {
      const error = new Error("memberIds must not be empty");
      error.statusCode = 400;
      throw error;
    }

    const durationMinutes = (candidate.endTime.getTime() - candidate.startTime.getTime()) / 60000;
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      const error = new Error("Appointment duration must be a positive whole number of minutes");
      error.statusCode = 400;
      throw error;
    }
    for (const memberId of candidate.memberIds) {
      const slots = this.schedulingService.findAvailableSlots({
        organizationId: candidate.organizationId,
        resourceIds: [memberId],
        serviceIds: candidate.serviceIds,
        teamId: candidate.teamId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        durationMinutes,
        slotMinutes: durationMinutes
      });
      const exact = slots.some(slot =>
        slot.resourceId === memberId &&
        slot.startTime.getTime() === candidate.startTime.getTime() &&
        slot.endTime.getTime() === candidate.endTime.getTime()
      );
      if (!exact) {
        const error = new Error("Requested appointment slot is not available");
        error.statusCode = 409;
        throw error;
      }
    }
  }

  #assertResourcesAvailable(candidate) {
    for (const existing of this.appointmentStore.values()) {
      if (existing.organizationId !== candidate.organizationId) continue;
      if (!this.#consumesAppointment(existing)) continue;
      if (existing.endTime <= candidate.startTime || existing.startTime >= candidate.endTime) continue;
      const conflict = candidate.memberIds.some(id => existing.memberIds.includes(id));
      if (conflict) {
        const error = new Error("Resource is already assigned to an overlapping appointment");
        error.statusCode = 409;
        throw error;
      }
      if (candidate.teamId && candidate.teamId === existing.teamId) {
        const error = new Error("Team is already assigned to an overlapping appointment");
        error.statusCode = 409;
        throw error;
      }
    }
  }

  #consumesAppointment(appointment) {
    if (!this.statusResolver) return appointment.status !== "cancelled";
    const status = this.statusResolver({
      organizationId: appointment.organizationId,
      entityType: "appointment",
      statusCode: appointment.status
    });
    return !status || status.category !== "cancelled";
  }

  #expireIfNeeded(hold) {
    if (hold.status === "active" && hold.expiresAt <= this.clock()) {
      hold.status = "expired";
      this.holdStore.set(this.#key(hold.organizationId, hold.id), hold);
    }
  }

  #cloneHold(hold) {
    return {
      ...hold,
      startTime: new Date(hold.startTime),
      endTime: new Date(hold.endTime),
      expiresAt: new Date(hold.expiresAt),
      unitIds: [...hold.unitIds],
      serviceIds: [...hold.serviceIds],
      memberIds: [...hold.memberIds],
      resourceIds: [...hold.resourceIds]
    };
  }

  #key(organizationId, appointmentId) {
    return JSON.stringify([organizationId, appointmentId]);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { AppointmentService };
