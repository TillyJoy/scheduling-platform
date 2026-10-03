const { Resource } = require("../models/resource");

class ResourceRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, resource, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Resource({ ...resource, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO resources
        (id, organization_id, name, resource_type, role, capabilities, status_code, active,
         geographic_restrictions, service_restrictions, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$12)
       RETURNING *`,
      [
        record.id, principal.organizationId, record.name, record.resourceType, record.role,
        JSON.stringify(record.capabilities), record.statusCode, record.active,
        JSON.stringify(record.geographicRestrictions), JSON.stringify(record.serviceRestrictions),
        JSON.stringify(record.metadata), now
      ]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "resource.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, resourceId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM resources WHERE organization_id=$1 AND id=$2",
      [principal.organizationId, resourceId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, active = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id=$1"];
    if (active !== null) {
      values.push(active);
      filters.push(`active=$${values.length}`);
    }
    const result = await db.query(
      `SELECT * FROM resources WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC, id DESC`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async update({ principal, resource, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Resource({ ...resource, organizationId: principal.organizationId });
    const existing = await this.get({ principal, resourceId: record.id, db });
    if (!existing) return null;
    const now = this.clock();
    const result = await db.query(
      `UPDATE resources
       SET name=$3, resource_type=$4, role=$5, capabilities=$6::jsonb, status_code=$7, active=$8,
           geographic_restrictions=$9::jsonb, service_restrictions=$10::jsonb, metadata=$11::jsonb, updated_at=$12
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [
        principal.organizationId, record.id, record.name, record.resourceType, record.role,
        JSON.stringify(record.capabilities), record.statusCode, record.active,
        JSON.stringify(record.geographicRestrictions), JSON.stringify(record.serviceRestrictions),
        JSON.stringify(record.metadata), now
      ]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "resource.updated", saved.id, existing, saved, db, now);
    return saved;
  }

  #map(row) {
    return new Resource({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      resourceType: row.resource_type,
      role: row.role,
      capabilities: row.capabilities,
      statusCode: row.status_code,
      active: row.active,
      geographicRestrictions: row.geographic_restrictions,
      serviceRestrictions: row.service_restrictions,
      metadata: row.metadata
    });
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'resource',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, entityId,
        previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), createdAt]
    );
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { ResourceRepository };
