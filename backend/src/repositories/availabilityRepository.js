const { Availability } = require("../models/availability");

class AvailabilityRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, availability, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Availability({ ...availability, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO availability
        (id,organization_id,resource_id,start_time,end_time,zone_id,available,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       RETURNING *`,
      [record.id, principal.organizationId, record.resourceId, record.startTime, record.endTime,
        record.zoneId, record.available, now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "availability.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, availabilityId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM availability WHERE organization_id=$1 AND id=$2",
      [principal.organizationId, availabilityId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, resourceId = null, startTime = null, endTime = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id=$1"];
    if (resourceId) { values.push(resourceId); filters.push(`resource_id=$${values.length}`); }
    if (startTime) { values.push(startTime); filters.push(`end_time > $${values.length}`); }
    if (endTime) { values.push(endTime); filters.push(`start_time < $${values.length}`); }
    const result = await db.query(
      `SELECT * FROM availability WHERE ${filters.join(" AND ")}
       ORDER BY start_time, id`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async update({ principal, availability, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new Availability({ ...availability, organizationId: principal.organizationId });
    const existing = await this.get({ principal, availabilityId: record.id, db });
    if (!existing) return null;
    const now = this.clock();
    const result = await db.query(
      `UPDATE availability
       SET resource_id=$3,start_time=$4,end_time=$5,zone_id=$6,available=$7,updated_at=$8
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [principal.organizationId, record.id, record.resourceId, record.startTime, record.endTime, record.zoneId, record.available, now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "availability.updated", saved.id, existing, saved, db, now);
    return saved;
  }

  #map(row) {
    return new Availability({
      id: row.id,
      organizationId: row.organization_id,
      resourceId: row.resource_id,
      startTime: row.start_time,
      endTime: row.end_time,
      zoneId: row.zone_id,
      available: row.available
    });
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'availability',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, entityId,
        previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), createdAt]
    );
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { AvailabilityRepository };
