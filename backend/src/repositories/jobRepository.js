const { Job } = require("../models/job");

class JobRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, job, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Job(job);
    if (record.organizationId !== principal.organizationId) throw new Error("Job organization mismatch");
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO jobs
        (id, organization_id, title, description, client_id, service_ids, status_code, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $9)
       RETURNING *`,
      [record.id, principal.organizationId, record.title, record.description, record.clientId,
       JSON.stringify(record.serviceIds), record.statusCode, JSON.stringify(record.metadata), now]
    );
    return this.#map(result.rows[0]);
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
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { JobRepository };
