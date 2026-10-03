const { Property } = require("../models/property");
class PropertyRepository {
  constructor({ pool, clock = () => new Date() } = {}) { if (!pool) throw new Error("pool is required"); this.pool = pool; this.clock = clock; }
  async create({ principal, property, db = this.pool }) {
    this.#requirePrincipal(principal); const record = new Property({ ...property, organizationId: principal.organizationId }); const now = this.clock();
    const result = await db.query(`INSERT INTO properties (id, organization_id, address, city, state, postal_code, landlord_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [record.id, principal.organizationId, record.address, record.city, record.state, record.postalCode ?? null, record.landlordId, now]);
    await this.#audit(principal, "property.created", record.id, null, record, db, now); return this.#map(result.rows[0]);
  }
  async get({ principal, propertyId, db = this.pool }) {
    this.#requirePrincipal(principal); const result = await db.query("SELECT * FROM properties WHERE organization_id=$1 AND id=$2",[principal.organizationId,propertyId]);
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }
  #map(row) { return new Property({ id:row.id, organizationId:row.organization_id, address:row.address, city:row.city, state:row.state, postalCode:row.postal_code, landlordId:row.landlord_id }); }
  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(`INSERT INTO audit_events (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
      VALUES (gen_random_uuid()::text,$1,$2,$3,'property',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId,principal.userId,action,entityId,previousValue?JSON.stringify(previousValue):null,JSON.stringify(newValue),createdAt]);
  }
  #requirePrincipal(principal) { if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required"); }
}
module.exports = { PropertyRepository };
