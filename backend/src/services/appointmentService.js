const { Appointment } = require("../models/appointment");
const { SchedulingHold } = require("../models/schedulingHold");
const { lockResources } = require("../database/schedulingConflictLock");

class AppointmentService {
  constructor({
    appointmentStore = new Map(),
    holdStore = new Map(),
    schedulingHolds = [],
    schedulingService = null,
    durationService = null,
    authorize = AppointmentService.defaultAuthorize,
    clock = () => new Date(),
    statusResolver = null,
    appointmentRepository = null,
    schedulingHoldRepository = null,
    transaction = null
  } = {}) {
    if (appointmentRepository && (!schedulingHoldRepository || !transaction)) {
      throw new Error("schedulingHoldRepository and transaction are required with appointmentRepository");
    }
    this.appointmentStore = appointmentStore;
    this.holdStore = holdStore;
    this.schedulingHolds = schedulingHolds;
    this.schedulingService = schedulingService;
    this.durationService = durationService;
    this.authorize = authorize;
    this.clock = clock;
    this.statusResolver = statusResolver;
    this.appointmentRepository = appointmentRepository;
    this.schedulingHoldRepository = schedulingHoldRepository;
    this.transaction = transaction;
  }

  create(args = {}) {
    return this.appointmentRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get({ principal, appointmentId } = {}) {
    return this.appointmentRepository
      ? this.#durableGet({ principal, appointmentId })
      : this.#memoryGet({ principal, appointmentId });
  }

  list({ principal, startTime = null, endTime = null } = {}) {
    return this.appointmentRepository
      ? this.#durableList({ principal, startTime, endTime })
      : this.#memoryList({ principal, startTime, endTime });
  }

  update(args = {}) {
    return this.appointmentRepository ? this.#durableUpdate(args) : this.#memoryUpdate(args);
  }

  createHold(args = {}) {
    return this.appointmentRepository ? this.#durableCreateHold(args) : this.#memoryCreateHold(args);
  }

  confirmHold(args = {}) {
    return this.appointmentRepository ? this.#durableConfirmHold(args) : this.#memoryConfirmHold(args);
  }

  cancelHold(args = {}) {
    return this.appointmentRepository ? this.#durableCancelHold(args) : this.#memoryCancelHold(args);
  }

  expireHolds(args = {}) {
    return this.appointmentRepository ? this.#durableExpireHolds(args) : this.#memoryExpireHolds();
  }

  async #durableCreate({ principal, enforceAvailability = false, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:create", principal.organizationId);
    const appointment = new Appointment({
      ...this.#withDuration(input, principal),
      organizationId: principal.organizationId
    });

    return this.transaction(principal, "appointment.create", async db => {
      await lockResources(db, principal.organizationId, appointment.memberIds);
      if (await this.appointmentRepository.get({ principal, appointmentId: appointment.id, db })) {
        const error = new Error("Appointment ID already exists");
        error.statusCode = 409;
        throw error;
      }
      this.#assertExactAvailabilityIfRequested(appointment, enforceAvailability);
      await this.#assertDurableConflicts({ principal, appointment, db });
      return this.appointmentRepository.create({ principal, appointment, db });
    });
  }

  async #durableGet({ principal, appointmentId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:read", principal.organizationId);
    const appointment = await this.transaction(
      principal,
      "appointment.read",
      db => this.appointmentRepository.get({ principal, appointmentId, db })
    );
    if (!appointment) throw new Error("Appointment not found");
    return appointment;
  }

  async #durableList({ principal, startTime, endTime }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:read", principal.organizationId);
    return this.transaction(
      principal,
      "appointment.list",
      db => this.appointmentRepository.list({ principal, startTime, endTime, db })
    );
  }

  async #durableUpdate({ principal, id, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:update", principal.organizationId);

    return this.transaction(principal, "appointment.update", async db => {
      const existing = await this.appointmentRepository.get({
        principal, appointmentId: id, db, forUpdate: true
      });
      if (!existing) throw new Error("Appointment not found");

      const appointment = new Appointment({
        ...existing,
        ...input,
        id,
        organizationId: principal.organizationId,
        unitIds: input.unitIds ?? existing.unitIds,
        serviceIds: input.serviceIds ?? existing.serviceIds,
        memberIds: input.memberIds ?? existing.memberIds,
        startTime: input.startTime ?? existing.startTime,
        endTime: input.endTime ?? existing.endTime
      });

      await lockResources(
        db,
        principal.organizationId,
        [...new Set([...existing.memberIds, ...appointment.memberIds])]
      );

      const current = await this.appointmentRepository.get({
        principal, appointmentId: id, db, forUpdate: true
      });
      if (!current) throw new Error("Appointment not found");

      await this.#assertDurableConflicts({
        principal,
        appointment,
        db,
        excludeAppointmentId: id
      });

      return this.appointmentRepository.update({ principal, appointment, db });
    });
  }

  async #durableCreateHold({
    principal,
    id,
    organizationId,
    clientId,
    propertyId,
    workOrderId = null,
    departmentId = null,
    zoneId = null,
    unitIds = [],
    serviceIds = [],
    teamId = null,
    memberIds = [],
    startTime,
    endTime,
    expiresAt
  }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:create", principal.organizationId);
    if (organizationId && organizationId !== principal.organizationId) {
      const error = new Error("Not authorized");
      error.statusCode = 403;
      throw error;
    }

    const hold = new SchedulingHold({
      id,
      organizationId: principal.organizationId,
      schedulerId: principal.userId,
      clientId,
      propertyId,
      workOrderId,
      departmentId,
      zoneId,
      unitIds,
      serviceIds,
      memberIds,
      startTime,
      endTime,
      expiresAt
    });

    if (hold.expiresAt <= this.clock()) throw new Error("expiresAt must be in the future");

    return this.transaction(principal, "scheduling-hold.create", async db => {
      await lockResources(db, principal.organizationId, hold.memberIds);

      if (await this.schedulingHoldRepository.get({ principal, holdId: hold.id, db }) ||
          await this.appointmentRepository.get({ principal, appointmentId: hold.id, db })) {
        const error = new Error("Appointment ID already exists");
        error.statusCode = 409;
        throw error;
      }

      this.#assertExactAvailabilityIfRequested(hold, true);
      await this.#assertHoldConflicts({ principal, hold, db });
      await this.#assertAppointmentConflictsAgainstHold({ principal, hold, db });

      return this.schedulingHoldRepository.create({ principal, hold, db });
    });
  }

  async #durableConfirmHold({ principal, holdId, status = "scheduled" }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:confirm", principal.organizationId);

    return this.transaction(principal, "scheduling-hold.confirm", async db => {
      const hold = await this.schedulingHoldRepository.get({
        principal, holdId, db, forUpdate: true
      });
      if (!hold) throw new Error("Appointment hold not found");

      if (hold.status === "active" && hold.expiresAt <= this.clock()) {
        hold.status = "expired";
        await this.schedulingHoldRepository.update({
          principal, hold, previous: { status: "active" }, db
        });
      }
      if (hold.status !== "active") throw new Error("Appointment hold is no longer active");

      await lockResources(db, principal.organizationId, hold.memberIds);
      await this.#assertAppointmentConflictsAgainstHold({ principal, hold, db });

      const appointment = new Appointment({
        id: hold.id,
        organizationId: hold.organizationId,
        clientId: hold.clientId,
        propertyId: hold.propertyId,
        workOrderId: hold.workOrderId,
        departmentId: hold.departmentId,
        zoneId: hold.zoneId,
        unitIds: hold.unitIds,
        serviceIds: hold.serviceIds,
        memberIds: hold.memberIds,
        startTime: hold.startTime,
        endTime: hold.endTime,
        status,
        schedulerId: hold.schedulerId
      });

      if (await this.appointmentRepository.get({
        principal, appointmentId: appointment.id, db
      })) {
        const error = new Error("Appointment ID already exists");
        error.statusCode = 409;
        throw error;
      }

      const saved = await this.appointmentRepository.create({
        principal, appointment, db
      });

      hold.status = "confirmed";
      await this.schedulingHoldRepository.update({
        principal, hold, previous: { status: "active" }, db
      });

      return saved;
    });
  }

  async #durableCancelHold({ principal, holdId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:cancel", principal.organizationId);

    return this.transaction(principal, "scheduling-hold.cancel", async db => {
      const hold = await this.schedulingHoldRepository.get({
        principal, holdId, db, forUpdate: true
      });
      if (!hold) throw new Error("Appointment hold not found");
      if (hold.status !== "active") return hold;

      await lockResources(db, principal.organizationId, hold.memberIds);
      const previous = { ...hold };
      hold.status = "cancelled";
      return this.schedulingHoldRepository.update({
        principal, hold, previous, db
      });
    });
  }

  async #durableExpireHolds({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:cancel", principal.organizationId);

    return this.transaction(principal, "scheduling-hold.expire", async db => {
      const holds = await this.schedulingHoldRepository.list({ principal, db });
      const expired = [];

      for (const candidate of holds.filter(item =>
        item.status === "active" && item.expiresAt <= this.clock()
      )) {
        await lockResources(db, principal.organizationId, candidate.memberIds);
        const current = await this.schedulingHoldRepository.get({
          principal, holdId: candidate.id, db, forUpdate: true
        });
        if (!current || current.status !== "active" || current.expiresAt > this.clock()) continue;

        current.status = "expired";
        expired.push(await this.schedulingHoldRepository.update({
          principal,
          hold: current,
          previous: { status: "active" },
          db
        }));
      }

      return expired;
    });
  }

  async #assertDurableConflicts({
    principal,
    appointment,
    db,
    excludeAppointmentId = null,
    excludeHoldId = null
  }) {
    const appointments = await this.appointmentRepository.findConflicts({
      principal,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      resourceIds: appointment.memberIds,
      excludeAppointmentId,
      db
    });
    if (appointments.some(item => this.#consumesAppointment(item))) {
      const error = new Error("Resource is already assigned to an overlapping appointment");
      error.statusCode = 409;
      throw error;
    }

    const holds = await this.schedulingHoldRepository.findConflicts({
      principal,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      resourceIds: appointment.memberIds,
      excludeHoldId,
      db
    });
    if (holds.length) {
      const error = new Error("Resource is currently held for an overlapping scheduling hold");
      error.statusCode = 409;
      throw error;
    }
  }

  async #assertHoldConflicts({ principal, hold, db }) {
    const holds = await this.schedulingHoldRepository.findConflicts({
      principal,
      startTime: hold.startTime,
      endTime: hold.endTime,
      resourceIds: hold.memberIds,
      db
    });
    if (holds.length) {
      const error = new Error("Resource is already held for an overlapping scheduling hold");
      error.statusCode = 409;
      throw error;
    }
  }

  async #assertAppointmentConflictsAgainstHold({ principal, hold, db }) {
    await this.#assertDurableConflicts({
      principal,
      appointment: hold,
      excludeHoldId: hold.id,
      db
    });
  }

  #withDuration(input, principal) {
    const appointmentInput = { ...input };
    if (!appointmentInput.endTime) {
      if (!this.durationService) {
        throw new Error("endTime is required when duration service is unavailable");
      }
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
    return appointmentInput;
  }

  #assertExactAvailabilityIfRequested(candidate, requested) {
    if (!requested || !this.schedulingService) return;
    this.#assertExactAvailability(candidate);
  }

  #assertExactAvailability(candidate) {
    if (!Array.isArray(candidate.memberIds) || candidate.memberIds.length === 0) {
      const error = new Error("memberIds must not be empty");
      error.statusCode = 400;
      throw error;
    }
    const startTime = new Date(candidate.startTime);
    const endTime = new Date(candidate.endTime);
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
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
        startTime,
        endTime,
        durationMinutes,
        slotMinutes: durationMinutes
      });
      if (!slots.some(slot =>
        slot.resourceId === memberId &&
        slot.startTime.getTime() === startTime.getTime() &&
        slot.endTime.getTime() === endTime.getTime()
      )) {
        const error = new Error("Requested appointment slot is not available");
        error.statusCode = 409;
        throw error;
      }
    }
  }

  #memoryCreate({ principal, enforceAvailability = false, ...input }) {
    this.#requirePrincipal(principal);
    const appointmentInput = { ...input };
    this.#authorize(principal, "appointment:create", appointmentInput.organizationId);
    if (!appointmentInput.endTime) {
      appointmentInput.endTime = this.#withDuration(appointmentInput, principal).endTime;
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

  #memoryGet({ principal, appointmentId }) {
    this.#requirePrincipal(principal);
    const appointment = this.appointmentStore.get(this.#key(principal.organizationId, appointmentId));
    if (!appointment) throw new Error("Appointment not found");
    this.#authorize(principal, "appointment:read", appointment.organizationId);
    return appointment;
  }

  #memoryList({ principal, startTime = null, endTime = null } = {}) {
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

  #memoryUpdate({ principal, id, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:update", principal.organizationId);
    const existing = this.#memoryGet({ principal, appointmentId: id });
    const appointment = new Appointment({
      ...existing,
      ...input,
      id,
      organizationId: principal.organizationId,
      unitIds: input.unitIds ?? existing.unitIds,
      serviceIds: input.serviceIds ?? existing.serviceIds,
      memberIds: input.memberIds ?? existing.memberIds
    });
    this.#assertResourcesAvailable(appointment);
    this.appointmentStore.set(this.#key(principal.organizationId, appointment.id), appointment);
    return appointment;
  }

  #memoryCreateHold({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "appointment:create", input.organizationId);
    const hold = new SchedulingHold({
      ...input,
      organizationId: input.organizationId,
      schedulerId: input.schedulerId ?? principal.userId
    });
    if (hold.expiresAt <= this.clock()) throw new Error("expiresAt must be in the future");

    const key = this.#key(hold.organizationId, hold.id);
    if (this.appointmentStore.has(key) || this.holdStore.has(key)) {
      throw new Error("Appointment ID already exists");
    }

    this.#assertExactAvailability(hold);
    this.holdStore.set(key, hold);
    this.schedulingHolds.push(hold);
    return this.#cloneHold(hold);
  }

  #memoryConfirmHold({ principal, holdId, status = "scheduled" }) {
    this.#requirePrincipal(principal);
    const key = this.#key(principal.organizationId, holdId);
    const hold = this.holdStore.get(key);
    if (!hold) throw new Error("Appointment hold not found");
    this.#authorize(principal, "appointment:confirm", hold.organizationId);
    this.#expireIfNeeded(hold);
    if (hold.status !== "active") throw new Error("Appointment hold is no longer active");

    const appointment = this.#memoryCreate({
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

  #memoryCancelHold({ principal, holdId }) {
    this.#requirePrincipal(principal);
    const key = this.#key(principal.organizationId, holdId);
    const hold = this.holdStore.get(key);
    if (!hold) throw new Error("Appointment hold not found");
    this.#authorize(principal, "appointment:cancel", hold.organizationId);
    if (hold.status === "active") hold.status = "cancelled";
    this.holdStore.set(key, hold);
    return this.#cloneHold(hold);
  }

  #memoryExpireHolds() {
    for (const hold of this.holdStore.values()) this.#expireIfNeeded(hold);
  }

  #assertResourcesAvailable(candidate) {
    for (const existing of this.appointmentStore.values()) {
      if (existing.organizationId !== candidate.organizationId || existing.id === candidate.id) continue;
      if (!this.#consumesAppointment(existing)) continue;
      if (existing.endTime <= candidate.startTime || existing.startTime >= candidate.endTime) continue;
      const conflict = candidate.memberIds.some(id => existing.memberIds.includes(id));
      if (conflict || (candidate.teamId && candidate.teamId === existing.teamId)) {
        const error = new Error("Resource is already assigned to an overlapping appointment");
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

  #key(organizationId, id) {
    return JSON.stringify([organizationId, id]);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { AppointmentService };
