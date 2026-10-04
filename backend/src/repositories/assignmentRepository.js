const { Assignment } = require("../models/assignment");

class AssignmentRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, assignment, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Assignment({ ...assignment, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO assignments
        (id, organization_id, resource_id, job_id, work_order_id, start_time, end_time, status_code, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10)
       RETURNING *`,
      [
        record.id, principal.organizationId, record.resourceId, record.jobId, record.workOrderId,
        record.startTime, record.endTime, record.statusCode, JSON.stringify(record.metadata), now
      ]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "assignment.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, assignmentId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM assignments WHERE organization_id=$1 AND id=$2",
      [principal.organizationId, assignmentId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, resourceId = null, startTime = null, endTime = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id=$1"];
    if (resourceId) {
      values.push(resourceId);
      filters.push(`resource_id=$${values.length}`);
    }
    if (startTime) {
      values.push(startTime);
      filters.push(`end_time>$${values.length}`);
    }
    if (endTime) {
      values.push(endTime);
      filters.push(`start_time<$${values.length}`);
    }
    const result = await db.query(
      `SELECT * FROM assignments
       WHERE ${filters.join(" AND ")}
       ORDER BY start_time, id`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async findConflicts({ principal, resourceId, startTime, endTime, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT * FROM assignments
       WHERE organization_id=$1
         AND resource_id=$2
         AND end_time>$3
         AND start_time<$4
       ORDER BY start_time, id`,
      [principal.organizationId, resourceId, startTime, endTime]
    );
    return result.rows.map(row => this.#map(row));
  }

  #map(row) {
    return new Assignment({
      id: row.id,
      organizationId: row.organization_id,
      resourceId: row.resource_id,
      jobId: row.job_id,
      workOrderId: row.work_order_id,
      startTime: row.start_time,
      endTime: row.end_time,
      statusCode: row.status_code,
      metadata: row.metadata
    });
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'assignment',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [
        principal.organizationId, principal.userId, action, entityId,
        previousValue ? JSON.stringify(previousValue) : null,
        JSON.stringify(newValue), createdAt
      ]
    );
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { AssignmentRepository };
