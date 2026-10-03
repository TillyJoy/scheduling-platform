const { Job } = require("../models/job");

class JobRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, job, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Job({ ...job, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO jobs
        (id, organization_id, title, description, client_id, service_ids, status_code, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $9)
       RETURNING *`,
      [
        record.id,
        principal.organizationId,
        record.title,
        record.description,
        record.clientId,
        JSON.stringify(record.serviceIds),
        record.statusCode,
        JSON.stringify(record.metadata),
        now
      ]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "job.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, jobId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM jobs WHERE organization_id = $1 AND id = $2",
      [principal.organizationId, jobId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM jobs WHERE organization_id = $1 ORDER BY created_at DESC, id DESC",
      [principal.organizationId]
    );
    return result.rows.map(row => this.#map(row));
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id, organization_id, user_id, action, entity_type, entity_id, previous_value, new_value, source, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'job', $4, $5::jsonb, $6::jsonb, 'application', $7)`,
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
    return new Job({
      id: row.id,
      organizationId: row.organization_id,
      title: row.title,
      description: row.description,
      clientId: row.client_id,
      serviceIds: row.service_ids,
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

module.exports = { JobRepository };
