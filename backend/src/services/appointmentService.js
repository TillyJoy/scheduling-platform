const { Appointment } = require("../models/appointment");

class AppointmentService {
  constructor({
    appointmentStore = new Map(),
    holdStore = new Map(),
    schedulingHolds = [],
    schedulingService = null,
    authorize = AppointmentService.defaultAuthorize,
    clock = () => new Date()
  } = {}) {
    this.appointmentStore = appointmentStore;
    this.holdStore = holdStore;
    this.schedulingHolds = schedulingHolds;
    this.schedulingService = schedulingService;
    this.authorize = authorize;
    this.clock = clock;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const appointment = new Appointment(input);
    this.#authorize(principal, "appointment:create", appointment.organizationId);
    const key = this.#key(appointment.organizationId, appointment.id);
    if (this.appointmentStore.has(key)) throw new Error("Appointment ID already exists");
    this.#assertResourcesAvailable(appointment);
    this.appointmentStore.set(key, appointment);
    return appointment;
  }

  createHold({
    principal,
    id,
    organizationId,
    clientId,
    propertyId,
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
    if (Number.isNaN(expiry.getTime()) || expiry <= this.clock()) {
      throw new Error("expiresAt must be in the future");
    }

    const key = this.#key(organizationId, id);
    if (this.appointmentStore.has(key) || this.holdStore.has(key)) {
      throw new Error("Appointment ID already exists");
    }

    if (this.schedulingService) {
      for (const memberId of memberIds) {
        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
        const slots = this.schedulingService.findAvailableSlots({
          resourceIds: [memberId],
          serviceIds,
          startTime: start,
          endTime: end,
          durationMinutes,
          slotMinutes: durationMinutes
        });
        const exact = slots.some(slot =>
          slot.resourceId === memberId &&
          slot.startTime.getTime() === start.getTime() &&
          slot.endTime.getTime() === end.getTime()
        );
        if (!exact) throw new Error("Requested appointment slot is no longer available");
      }
    }

    const hold = {
      id,
      organizationId,
      clientId,
      propertyId,
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

  #assertResourcesAvailable(candidate) {
    for (const existing of this.appointmentStore.values()) {
      if (existing.organizationId !== candidate.organizationId) continue;
      if (existing.status === "cancelled") continue;
      if (existing.endTime <= candidate.startTime || existing.startTime >= candidate.endTime) continue;
      const conflict = candidate.memberIds.some(id => existing.memberIds.includes(id));
      if (conflict) throw new Error("Resource is already assigned to an overlapping appointment");
      if (candidate.teamId && candidate.teamId === existing.teamId) {
        throw new Error("Team is already assigned to an overlapping appointment");
      }
    }
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
