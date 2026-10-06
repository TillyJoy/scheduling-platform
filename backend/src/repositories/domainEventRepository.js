const { DomainEvent } = require("../models/domainEvent");

class DomainEventRepository {
  constructor({ pool } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
  }

  async create({ principal, event, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (event.organizationId !== principal.organizationId) throw new Error("Domain event organization mismatch");
    const result = await db.query(
      `INSERT INTO domain_events
       (id,organization_id,event_type,entity_type,entity_id,actor_user_id,occurred_at,payload,source,correlation_id,causation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING *`,
      [event.id,principal.organizationId,event.eventType,event.entityType,event.entityId,event.actorUserId,event.occurredAt,
       JSON.stringify(event.payload),event.source,event.correlationId,event.causationId]
    );
    return this.#map(result.rows[0]);
  }

  async get({ principal, eventId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query("SELECT * FROM domain_events WHERE organization_id=$1 AND id=$2",[principal.organizationId,eventId]);
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, entityType = null, entityId = null, eventType = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values=[principal.organizationId];
    const filters=["organization_id=$1"];
    for (const [field,value] of [["entity_type",entityType],["entity_id",entityId],["event_type",eventType]]) {
      if (value) { values.push(value); filters.push(field+"=$"+values.length); }
    }
    const result=await db.query(`SELECT * FROM domain_events WHERE ${filters.join(" AND ")} ORDER BY occurred_at DESC,id DESC`,values);
    return result.rows.map(row=>this.#map(row));
  }

  #map(row){ return new DomainEvent({
    id:row.id,organizationId:row.organization_id,eventType:row.event_type,entityType:row.entity_type,entityId:row.entity_id,
    actorUserId:row.actor_user_id,occurredAt:row.occurred_at,payload:row.payload,source:row.source,correlationId:row.correlation_id,
    causationId:row.causation_id
  });}
  #requirePrincipal(principal){ if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required"); }
}
module.exports={DomainEventRepository};