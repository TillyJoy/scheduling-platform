const { StatusDefinition } = require("../models/statusDefinition");

class StatusConfigurationRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async createStatus({ principal, status, db = this.pool }) {
    this.#requirePrincipal(principal);
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO status_definitions
        (id, organization_id, entity_type, code, label, category, description, color, icon,
         sort_order, is_initial, is_terminal, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14)
       RETURNING *`,
      [status.id, principal.organizationId, status.entityType, status.code, status.label,
        status.category, status.description, status.color, status.icon, status.sortOrder,
        status.initial, status.terminal, JSON.stringify(status.metadata), now]
    );
    const saved = this.#mapStatus(result.rows[0]);
    await this.#audit(principal, "status.created", saved, null, saved, db, now);
    return saved;
  }

  async listStatuses({ principal, entityType = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    let filter = "organization_id=$1";
    if (entityType) {
      values.push(entityType);
      filter += ` AND entity_type=$${values.length}`;
    }
    const result = await db.query(
      `SELECT * FROM status_definitions WHERE ${filter} ORDER BY sort_order, label, code`, values
    );
    return result.rows.map(row => this.#mapStatus(row));
  }

  async getStatus({ principal, entityType, code, db = this.pool, forUpdate = false }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT * FROM status_definitions WHERE organization_id=$1 AND entity_type=$2 AND code=$3${forUpdate ? " FOR UPDATE" : ""}`,
      [principal.organizationId, entityType, code]
    );
    return result.rows[0] ? this.#mapStatus(result.rows[0]) : null;
  }

  async setTransitions({ principal, entityType, fromCode, toCodes, db = this.pool }) {
    this.#requirePrincipal(principal);
    const now = this.clock();
    const current = await this.getStatus({ principal, entityType, code: fromCode, db, forUpdate: true });
    if (!current) throw new Error("Status not found");
    await db.query(
      "DELETE FROM status_transitions WHERE organization_id=$1 AND entity_type=$2 AND from_code=$3",
      [principal.organizationId, entityType, fromCode]
    );
    for (const toCode of toCodes) {
      await db.query(
        `INSERT INTO status_transitions (organization_id, entity_type, from_code, to_code, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [principal.organizationId, entityType, fromCode, toCode, principal.userId, now]
      );
    }
    await this.#audit(principal, "status.transitions_updated", current, null, { toCodes }, db, now);
    return toCodes;
  }

  async getAllowedTransitions({ principal, entityType, fromCode, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT s.* FROM status_transitions t
       JOIN status_definitions s
         ON s.organization_id=t.organization_id AND s.entity_type=t.entity_type AND s.code=t.to_code
       WHERE t.organization_id=$1 AND t.entity_type=$2 AND t.from_code=$3
       ORDER BY s.sort_order, s.label, s.code`,
      [principal.organizationId, entityType, fromCode]
    );
    return result.rows.map(row => this.#mapStatus(row));
  }

  async #audit(principal, action, status, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'status_definition',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, status.id,
        previousValue == null ? null : JSON.stringify(previousValue), JSON.stringify(newValue), createdAt]
    );
  }

  #mapStatus(row) {
    return new StatusDefinition({
      id: row.id, organizationId: row.organization_id, entityType: row.entity_type,
      code: row.code, label: row.label, category: row.category, description: row.description,
      color: row.color, icon: row.icon, sortOrder: row.sort_order, initial: row.is_initial,
      terminal: row.is_terminal, metadata: row.metadata
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { StatusConfigurationRepository };
