const { Appointment } = require("../models/appointment");

class AppointmentService {
  constructor({ appointmentStore = new Map(), authorize = AppointmentService.defaultAuthorize } = {}) {
    this.appointmentStore = appointmentStore;
    this.authorize = authorize;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const appointment = new Appointment(input);
    this.#authorize(principal, "appointment:create", appointment.organizationId);
    if (this.appointmentStore.has(appointment.id)) throw new Error("Appointment ID already exists");
    this.#assertResourcesAvailable(appointment);
    this.appointmentStore.set(appointment.id, appointment);
    return appointment;
  }

  get({ principal, appointmentId }) {
    this.#requirePrincipal(principal);
    const appointment = this.appointmentStore.get(appointmentId);
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

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId && Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}

module.exports = { AppointmentService };
