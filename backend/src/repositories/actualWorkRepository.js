const { ActualWork } = require("../models/actualWork");

class ActualWorkRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, work, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new ActualWork(work);
    if (record.organizationId !== principal.organizationId) throw new Error("Actual work organization mismatch");
    const now = this.clock();

    const result = await db.query(
      `INSERT INTO actual_work
        (id, organization_id, field_visit_id, work_order_id, resource_id, description,
         actual_start_time, actual_end_time, quantity, unit, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $12)
       RETURNING *`,
      [
        record.id, principal.organizationId, record.fieldVisitId, record.workOrderId, record.resourceId,
        record.description, record.actualStartTime, record.actualEndTime, record.quantity, record.unit,
        JSON.stringify(record.metadata), now
      ]
    );
    return this.#map(result.rows[0]);
  }

  async get({ principal, actualWorkId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await this.pool.query(
      `SELECT * FROM actual_work
       WHERE organization_id = $1 AND id = $2`,
      [principal.organizationId, actualWorkId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, fieldVisitId = null, workOrderId = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id = $1"];

    if (fieldVisitId) {
      values.push(fieldVisitId);
      filters.push(`field_visit_id = $${values.length}`);
    }
    if (workOrderId) {
      values.push(workOrderId);
      filters.push(`work_order_id = $${values.length}`);
    }

    const result = await this.pool.query(
      `SELECT * FROM actual_work
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC, id DESC`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  #map(row) {
    return new ActualWork({
      id: row.id,
      organizationId: row.organization_id,
      fieldVisitId: row.field_visit_id,
      workOrderId: row.work_order_id,
      resourceId: row.resource_id,
      description: row.description,
      actualStartTime: row.actual_start_time,
      actualEndTime: row.actual_end_time,
      quantity: row.quantity,
      unit: row.unit,
      metadata: row.metadata
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { ActualWorkRepository };
