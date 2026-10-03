const { Appointment } = require("../models/appointment");

class AppointmentRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, appointment, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Appointment({ ...appointment, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO appointments
        (id, organization_id, department_id, client_id, property_id, work_order_id, team_id, zone_id,
         start_time, end_time, status_code, scheduler_id, client_scheduling_indicator,
         internal_notes, cancellation_reason, reschedule_reason, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [record.id, principal.organizationId, record.departmentId, record.clientId, record.propertyId,
       record.workOrderId, record.teamId, record.zoneId, record.startTime, record.endTime, record.status,
       record.schedulerId, record.clientSchedulingIndicator, record.internalNotes,
       record.cancellationReason, record.rescheduleReason, now, now]
    );
    const saved = this.#map(result.rows[0], {
      unitIds: record.unitIds,
      serviceIds: record.serviceIds,
      memberIds: record.memberIds
    });
    await this.#replaceChildren({ principal, appointment: saved, db });
    await this.#recordHistory(principal, saved, "created", null, saved, db, now);
    await this.#audit(principal, "appointment.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, appointmentId, db = this.pool, forUpdate = false }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT * FROM appointments
       WHERE organization_id=$1 AND id=$2
       ${forUpdate ? "FOR UPDATE" : ""}`,
      [principal.organizationId, appointmentId]
    );
    if (!result.rows[0]) return null;
    return this.#map(result.rows[0], await this.#children(principal, appointmentId, db));
  }

  async list({ principal, startTime = null, endTime = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id=$1"];
    if (startTime) { values.push(startTime); filters.push(`end_time > $${values.length}`); }
    if (endTime) { values.push(endTime); filters.push(`start_time < $${values.length}`); }
    const result = await db.query(
      `SELECT * FROM appointments WHERE ${filters.join(" AND ")} ORDER BY start_time, id`,
      values
    );
    return Promise.all(result.rows.map(async row => this.#map(row, await this.#children(principal, row.id, db))));
  }

  async update({ principal, appointment, expectedId = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Appointment({ ...appointment, organizationId: principal.organizationId });
    const existing = await this.get({ principal, appointmentId: expectedId || record.id, db, forUpdate: true });
    if (!existing) return null;
    const now = this.clock();
    const result = await db.query(
      `UPDATE appointments
       SET department_id=$3, client_id=$4, property_id=$5, work_order_id=$6, team_id=$7, zone_id=$8,
           start_time=$9, end_time=$10, status_code=$11, scheduler_id=$12,
           client_scheduling_indicator=$13, internal_notes=$14, cancellation_reason=$15,
           reschedule_reason=$16, updated_at=$17
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [principal.organizationId, record.id, record.departmentId, record.clientId, record.propertyId,
       record.workOrderId, record.teamId, record.zoneId, record.startTime, record.endTime, record.status,
       record.schedulerId, record.clientSchedulingIndicator, record.internalNotes,
       record.cancellationReason, record.rescheduleReason, now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#replaceChildren({ principal, appointment: saved, db });
    const eventType = saved.status !== existing.status
      ? (this.#isCancelled(saved.status) ? "cancelled" : "status_changed")
      : (saved.startTime.getTime() !== existing.startTime.getTime() || saved.endTime.getTime() !== existing.endTime.getTime()
        ? "rescheduled" : "updated");
    await this.#recordHistory(principal, saved, eventType, existing, saved, db, now);
    await this.#audit(principal, `appointment.${eventType}`, saved.id, existing, saved, db, now);
    return saved;
  }

  async findConflicts({ principal, startTime, endTime, resourceIds, excludeAppointmentId = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (!resourceIds.length) return [];
    const result = await db.query(
      `SELECT DISTINCT a.*
       FROM appointments a
       JOIN appointment_resources ar
         ON ar.organization_id=a.organization_id AND ar.appointment_id=a.id
       WHERE a.organization_id=$1
         AND ar.resource_id = ANY($2::text[])
         AND a.start_time < $4
         AND a.end_time > $3
         AND a.id <> COALESCE($5, '')
       ORDER BY a.start_time, a.id`,
      [principal.organizationId, resourceIds, startTime, endTime, excludeAppointmentId]
    );
    return Promise.all(result.rows.map(async row => this.#map(row, await this.#children(principal, row.id, db))));
  }

  async #children(principal, appointmentId, db) {
    const [units, services, resources] = await Promise.all([
      db.query("SELECT appointment_unit_id, unit_id, selection_type FROM appointment_units WHERE organization_id=$1 AND appointment_id=$2 ORDER BY appointment_unit_id", [principal.organizationId, appointmentId]),
      db.query("SELECT appointment_service_id, service_ref, service_status, requested, scheduled, duration_contribution, funding_refs FROM appointment_services WHERE organization_id=$1 AND appointment_id=$2 ORDER BY appointment_service_id", [principal.organizationId, appointmentId]),
      db.query("SELECT appointment_resource_id, resource_id, role, assignment_status FROM appointment_resources WHERE organization_id=$1 AND appointment_id=$2 ORDER BY appointment_resource_id", [principal.organizationId, appointmentId])
    ]);
    return {
      unitIds: units.rows.map(row => row.unit_id),
      serviceIds: services.rows.map(row => row.service_ref),
      memberIds: resources.rows.map(row => row.resource_id),
      units: units.rows,
      services: services.rows,
      resources: resources.rows
    };
  }

  async #replaceChildren({ principal, appointment, db }) {
    await db.query("DELETE FROM appointment_units WHERE organization_id=$1 AND appointment_id=$2", [principal.organizationId, appointment.id]);
    await db.query("DELETE FROM appointment_services WHERE organization_id=$1 AND appointment_id=$2", [principal.organizationId, appointment.id]);
    await db.query("DELETE FROM appointment_resources WHERE organization_id=$1 AND appointment_id=$2", [principal.organizationId, appointment.id]);

    for (const [index, unitId] of appointment.unitIds.entries()) {
      await db.query(
        `INSERT INTO appointment_units (appointment_unit_id, organization_id, appointment_id, unit_id, selection_type)
         VALUES ($1,$2,$3,$4,$5)`,
        [`${appointment.id}:unit:${index}`, principal.organizationId, appointment.id, unitId, "selected"]
      );
    }
    for (const [index, serviceRef] of appointment.serviceIds.entries()) {
      await db.query(
        `INSERT INTO appointment_services (appointment_service_id, organization_id, appointment_id, service_ref)
         VALUES ($1,$2,$3,$4)`,
        [`${appointment.id}:service:${index}`, principal.organizationId, appointment.id, serviceRef]
      );
    }
    for (const [index, resourceId] of appointment.memberIds.entries()) {
      await db.query(
        `INSERT INTO appointment_resources (appointment_resource_id, organization_id, appointment_id, resource_id)
         VALUES ($1,$2,$3,$4)`,
        [`${appointment.id}:resource:${index}`, principal.organizationId, appointment.id, resourceId]
      );
    }
  }

  async #recordHistory(principal, appointment, eventType, previousValue, newValue, db, occurredAt) {
    await db.query(
      `INSERT INTO appointment_history
        (appointment_history_id, organization_id, appointment_id, event_type, previous_value, new_value, user_id, source, occurred_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::jsonb,$6,'application',$7)`,
      [principal.organizationId, appointment.id, eventType,
       previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), principal.userId, occurredAt]
    );
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'appointment',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, entityId,
       previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), createdAt]
    );
  }

  #map(row, children = { unitIds: [], serviceIds: [], memberIds: [] }) {
    if (!row) return null;
    return new Appointment({
      id: row.id,
      organizationId: row.organization_id,
      clientId: row.client_id,
      propertyId: row.property_id,
      workOrderId: row.work_order_id,
      teamId: row.team_id,
      departmentId: row.department_id,
      zoneId: row.zone_id,
      unitIds: children.unitIds,
      serviceIds: children.serviceIds,
      memberIds: children.memberIds,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status_code,
      schedulerId: row.scheduler_id,
      clientSchedulingIndicator: row.client_scheduling_indicator,
      internalNotes: row.internal_notes,
      cancellationReason: row.cancellation_reason,
      rescheduleReason: row.reschedule_reason
    });
  }

  #isCancelled(status) {
    return status === "cancelled";
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { AppointmentRepository };
