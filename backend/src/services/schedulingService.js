class SchedulingService {
  constructor({
    resources = [],
    availabilities = [],
    assignments = [],
    holds = [],
    appointments = [],
    statusResolver = null,
    clock = () => new Date()
  } = {}) {
    this.resources = resources;
    this.availabilities = availabilities;
    this.assignments = assignments;
    this.holds = holds;
    this.appointments = appointments;
    this.statusResolver = statusResolver;
    this.clock = clock;
  }

  findAvailableSlots({
    organizationId = null,
    resourceIds = null,
    serviceIds = [],
    startTime,
    endTime,
    durationMinutes,
    slotMinutes = 15
  }) {
    if (!startTime || !endTime) throw new Error("startTime and endTime are required");
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new Error("durationMinutes must be a positive integer");
    }
    if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
      throw new Error("slotMinutes must be a positive integer");
    }

    const windowStart = new Date(startTime);
    const windowEnd = new Date(endTime);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime()) || windowEnd <= windowStart) {
      throw new Error("endTime must be after startTime");
    }

    const allowedIds = resourceIds ? new Set(resourceIds) : null;
    return this.resources
      .filter(resource => resource.active !== false)
      .filter(resource => !allowedIds || allowedIds.has(resource.id))
      .filter(resource => this.#qualified(resource, serviceIds))
      .flatMap(resource => this.#resourceSlots(
        resource,
        organizationId,
        windowStart,
        windowEnd,
        durationMinutes,
        slotMinutes
      ))
      .sort((a, b) => a.startTime - b.startTime || a.resourceId.localeCompare(b.resourceId));
  }

  #resourceSlots(resource, organizationId, windowStart, windowEnd, durationMinutes, slotMinutes) {
    const slots = [];
    const windows = this.availabilities
      .filter(availability => availability.resourceId === resource.id && availability.available !== false)
      .map(availability => ({ start: new Date(availability.startTime), end: new Date(availability.endTime) }))
      .filter(window => !Number.isNaN(window.start.getTime()) && !Number.isNaN(window.end.getTime()) && window.end > window.start);

    for (const availability of windows) {
      let cursor = new Date(Math.max(availability.start.getTime(), windowStart.getTime()));
      const latestStart = new Date(Math.min(availability.end.getTime(), windowEnd.getTime()) - durationMinutes * 60000);
      while (cursor <= latestStart) {
        const candidateEnd = new Date(cursor.getTime() + durationMinutes * 60000);
        if (!this.#conflicts(resource.id, organizationId, cursor, candidateEnd)) {
          slots.push({ resourceId: resource.id, startTime: new Date(cursor), endTime: candidateEnd });
        }
        cursor = new Date(cursor.getTime() + slotMinutes * 60000);
      }
    }
    return slots;
  }

  #conflicts(resourceId, organizationId, start, end) {
    const overlaps = item => {
      if (organizationId !== null && item.organizationId !== organizationId) return false;
      const itemStart = new Date(item.startTime);
      const itemEnd = new Date(item.endTime);
      const resourceIds = Array.isArray(item.resourceIds)
        ? item.resourceIds
        : Array.isArray(item.memberIds)
          ? item.memberIds
          : [item.resourceId];
      return resourceIds.includes(resourceId) && itemEnd > start && itemStart < end;
    };

    if (this.#values(this.assignments).some(assignment => overlaps(assignment) && this.#consumesAssignment(assignment))) return true;
    if (this.#values(this.appointments).some(appointment => overlaps(appointment) && this.#consumesAppointment(appointment))) return true;

    return this.#values(this.holds).some(hold =>
      this.#isActiveHold(hold) &&
      hold.expiresAt &&
      new Date(hold.expiresAt) > this.clock() &&
      overlaps(hold)
    );
  }

  #values(source) {
    return source instanceof Map ? [...source.values()] : source;
  }

  #consumesAssignment(assignment) {
    if (!assignment.statusCode || !this.statusResolver) return true;
    const status = this.statusResolver({
      organizationId: assignment.organizationId,
      entityType: "assignment",
      statusCode: assignment.statusCode
    });
    return !status || status.category !== "cancelled";
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

  #isActiveHold(hold) {
    if (!this.statusResolver) return hold.status === "active";
    const status = this.statusResolver({
      organizationId: hold.organizationId,
      entityType: "appointment_hold",
      statusCode: hold.status
    });
    return Boolean(status && status.category === "active");
  }

  #qualified(resource, serviceIds) {
    if (!serviceIds.length) return true;
    const qualifications = new Set(resource.qualifications || []);
    return serviceIds.every(serviceId => qualifications.has(serviceId));
  }
}

module.exports = { SchedulingService };
