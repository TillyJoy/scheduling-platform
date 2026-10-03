const { WorkOrder } = require("../models/workOrder");

class WorkOrderRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async nextAutomaticNumber({ principal, db = this.pool }) {
    this.#requirePrincipal(principal);
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`work-order-number:${principal.organizationId}`]
    );
    const result = await db.query(
      `SELECT COALESCE(
         MAX(CASE WHEN number ~ '^WO-[0-9]+$' THEN substring(number FROM 4)::bigint ELSE 0 END),
         0
       ) + 1 AS next_number
       FROM work_orders
       WHERE organization_id = $1`,
      [principal.organizationId]
    );
    return `WO-${result.rows[0].next_number}`;
  }

  async create({ principal, workOrder, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new WorkOrder({ ...workOrder, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO work_orders
        (id, organization_id, job_id, number, title, status_code, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
       RETURNING *`,
      [
        record.id,
        principal.organizationId,
        record.jobId,
        record.number,
        record.title,
        record.statusCode,
        JSON.stringify(record.metadata),
        now
      ]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "work-order.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, workOrderId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM work_orders WHERE organization_id = $1 AND id = $2",
      [principal.organizationId, workOrderId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, jobId = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id = $1"];
    if (jobId) {
      values.push(jobId);
      filters.push(`job_id = $${values.length}`);
    }
    const result = await db.query(
      `SELECT * FROM work_orders
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC, id DESC`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id, organization_id, user_id, action, entity_type, entity_id, previous_value, new_value, source, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'work_order', $4, $5::jsonb, $6::jsonb, 'application', $7)`,
      [
        principal.organizationId,
        principal.userId,
        action,
        entityId,
        previousValue ? JSON.stringify(previousValue) : null,
        JSON.stringify(newValue),
        createdAt
      ]
    );
  }

  #map(row) {
    if (!row) return null;
    return new WorkOrder({
      id: row.id,
      organizationId: row.organization_id,
      jobId: row.job_id,
      number: row.number,
      title: row.title,
      statusCode: row.status_code,
      metadata: row.metadata
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }
}

module.exports = { WorkOrderRepository };
