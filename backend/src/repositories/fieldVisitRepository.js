const { FieldVisit } = require("../models/fieldVisit");

class FieldVisitRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, visit }) {
    this.#requirePrincipal(principal);
    const record = new FieldVisit(visit);
    const now = this.clock();
    const result = await this.pool.query(
      `INSERT INTO field_visits
        (id, organization_id, appointment_id, work_order_id, version, status_code, resource_ids,
         arrived_at, actual_start_time, actual_end_time, completed_at, completed_by_user_id,
         closed_at, closed_by_user_id, outcome_code, outcome_reason, notes, observations,
         completion_data, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21, $21)
       RETURNING *`,
      this.#values(principal, record, now)
    );
    return this.#map(result.rows[0]);
  }

  async get({ principal, fieldVisitId }) {
    this.#requirePrincipal(principal);
    const result = await this.pool.query(
      `SELECT * FROM field_visits
       WHERE organization_id = $1 AND id = $2`,
      [principal.organizationId, fieldVisitId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, appointmentId = null, workOrderId = null, resourceId = null } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id = $1"];

    if (appointmentId) {
      values.push(appointmentId);
      filters.push(`appointment_id = $${values.length}`);
    }
    if (workOrderId) {
      values.push(workOrderId);
      filters.push(`work_order_id = $${values.length}`);
    }
    if (resourceId) {
      values.push(JSON.stringify([resourceId]));
      filters.push(`resource_ids @> $${values.length}::jsonb`);
    }

    const result = await this.pool.query(
      `SELECT * FROM field_visits
       WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC, id DESC`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async replace({ principal, fieldVisit, expectedVersion }) {
    this.#requirePrincipal(principal);
    const record = new FieldVisit(fieldVisit);
    if (record.organizationId !== principal.organizationId) throw new Error("Field visit organization mismatch");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("expectedVersion must be a positive integer");

    const result = await this.pool.query(
      `UPDATE field_visits
       SET appointment_id = $3, work_order_id = $4, version = $5, status_code = $6, resource_ids = $7::jsonb,
           arrived_at = $8, actual_start_time = $9, actual_end_time = $10, completed_at = $11,
           completed_by_user_id = $12, closed_at = $13, closed_by_user_id = $14, outcome_code = $15,
           outcome_reason = $16, notes = $17, observations = $18::jsonb, completion_data = $19::jsonb,
           metadata = $20::jsonb, updated_at = $21
       WHERE organization_id = $1 AND id = $2 AND version = $22
       RETURNING *`,
      [
        principal.organizationId, record.id, record.appointmentId, record.workOrderId, record.version,
        record.statusCode, JSON.stringify(record.resourceIds), record.arrivedAt, record.actualStartTime,
        record.actualEndTime, record.completedAt, record.completedByUserId, record.closedAt,
        record.closedByUserId, record.outcomeCode, record.outcomeReason, record.notes,
        JSON.stringify(record.observations), JSON.stringify(record.completionData),
        JSON.stringify(record.metadata), this.clock(), expectedVersion
      ]
    );
    if (!result.rows[0]) {
      const error = new Error("Field visit version conflict or record not found");
      error.statusCode = 409;
      throw error;
    }
    return this.#map(result.rows[0]);
  }

  #values(principal, record, now) {
    return [
      record.id, principal.organizationId, record.appointmentId, record.workOrderId, record.version,
      record.statusCode, JSON.stringify(record.resourceIds), record.arrivedAt, record.actualStartTime,
      record.actualEndTime, record.completedAt, record.completedByUserId, record.closedAt,
      record.closedByUserId, record.outcomeCode, record.outcomeReason, record.notes,
      JSON.stringify(record.observations), JSON.stringify(record.completionData),
      JSON.stringify(record.metadata), now
    ];
  }

  #map(row) {
    if (!row) return null;
    return new FieldVisit({
      id: row.id,
      organizationId: row.organization_id,
      version: row.version,
      appointmentId: row.appointment_id,
      workOrderId: row.work_order_id,
      statusCode: row.status_code,
      resourceIds: row.resource_ids,
      arrivedAt: row.arrived_at,
      actualStartTime: row.actual_start_time,
      actualEndTime: row.actual_end_time,
      completedAt: row.completed_at,
      completedByUserId: row.completed_by_user_id,
      closedAt: row.closed_at,
      closedByUserId: row.closed_by_user_id,
      outcomeCode: row.outcome_code,
      outcomeReason: row.outcome_reason,
      notes: row.notes,
      observations: row.observations,
      completionData: row.completion_data,
      metadata: row.metadata
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { FieldVisitRepository };
