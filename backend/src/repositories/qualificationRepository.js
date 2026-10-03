const { Qualification } = require("../models/qualification");

class QualificationRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, qualification, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Qualification({ ...qualification, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO qualifications
        (qualification_id,organization_id,code,name,description,status_code,metadata,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)
       RETURNING *`,
      [record.qualificationId, principal.organizationId, record.code, record.name, record.description,
        record.statusCode, JSON.stringify(record.metadata), now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "qualification.created", saved.qualificationId, null, saved, db, now);
    return saved;
  }

  async get({ principal, qualificationId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM qualifications WHERE organization_id=$1 AND qualification_id=$2",
      [principal.organizationId, qualificationId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM qualifications WHERE organization_id=$1 ORDER BY created_at DESC, qualification_id DESC",
      [principal.organizationId]
    );
    return result.rows.map(row => this.#map(row));
  }

  async update({ principal, qualification, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Qualification({ ...qualification, organizationId: principal.organizationId });
    const existing = await this.get({ principal, qualificationId: record.qualificationId, db });
    if (!existing) return null;
    const now = this.clock();
    const result = await db.query(
      `UPDATE qualifications
       SET code=$3,name=$4,description=$5,status_code=$6,metadata=$7::jsonb,updated_at=$8
       WHERE organization_id=$1 AND qualification_id=$2
       RETURNING *`,
      [principal.organizationId, record.qualificationId, record.code, record.name, record.description,
        record.statusCode, JSON.stringify(record.metadata), now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "qualification.updated", saved.qualificationId, existing, saved, db, now);
    return saved;
  }

  #map(row) {
    return new Qualification({
      qualificationId: row.qualification_id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      description: row.description,
      statusCode: row.status_code,
      metadata: row.metadata
    });
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'qualification',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, entityId,
        previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), createdAt]
    );
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { QualificationRepository };
