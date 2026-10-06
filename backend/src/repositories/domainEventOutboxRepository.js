const crypto=require("node:crypto");
const {DomainEventOutboxEntry}=require("../models/domainEventOutboxEntry");
class DomainEventOutboxRepository {
  constructor({pool,clock=()=>new Date()}={}){if(!pool)throw new Error("pool is required");this.pool=pool;this.clock=clock;}
  async enqueue({principal,event,id=crypto.randomUUID(),availableAt=null,db=this.pool}) {
    this.#requirePrincipal(principal);if(!event?.id||!event.organizationId)throw new Error("Domain event is required");if(event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    const result=await db.query(`INSERT INTO event_outbox
      (id,organization_id,event_id,event_type,entity_type,entity_id,payload,source,occurred_at,status,attempts,available_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'pending',0,$10) RETURNING *`,
      [id,principal.organizationId,event.id,event.eventType,event.entityType,event.entityId,JSON.stringify(event.payload),event.source,event.occurredAt,availableAt||this.clock()]);
    return this.#map(result.rows[0]);
  }
  async claimBatch({principal,limit=10,now=this.clock(),db=this.pool}={}) {
    this.#requirePrincipal(principal);if(!Number.isInteger(limit)||limit<1)throw new Error("limit must be a positive integer");
    const result=await db.query(`WITH candidates AS (
      SELECT id FROM event_outbox WHERE organization_id=$1 AND status IN ('pending','failed') AND available_at <= $2
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $3)
      UPDATE event_outbox o SET status='processing',attempts=o.attempts+1,locked_at=$2 FROM candidates WHERE o.id=candidates.id RETURNING o.*`,
      [principal.organizationId,now,limit]);
    return result.rows.map(row=>this.#map(row));
  }
  async markPublished({principal,outboxId,publishedAt=this.clock(),db=this.pool}) {
    this.#requirePrincipal(principal);const result=await db.query(`UPDATE event_outbox SET status='published',published_at=$3,locked_at=NULL,last_error=NULL
      WHERE organization_id=$1 AND id=$2 AND status='processing' RETURNING *`,[principal.organizationId,outboxId,publishedAt]);
    if(!result.rows[0])throw new Error("Outbox entry is not processing");return this.#map(result.rows[0]);
  }
  async markFailed({principal,outboxId,error,availableAt=this.clock(),db=this.pool}) {
    this.#requirePrincipal(principal);const result=await db.query(`UPDATE event_outbox SET status='failed',locked_at=NULL,last_error=$3,available_at=$4
      WHERE organization_id=$1 AND id=$2 AND status='processing' RETURNING *`,[principal.organizationId,outboxId,String(error||"Unknown dispatch failure"),availableAt]);
    if(!result.rows[0])throw new Error("Outbox entry is not processing");return this.#map(result.rows[0]);
  }
  async listPending({principal,db=this.pool}={}){this.#requirePrincipal(principal);const result=await db.query("SELECT * FROM event_outbox WHERE organization_id=$1 AND status <> 'published' ORDER BY available_at,id",[principal.organizationId]);return result.rows.map(row=>this.#map(row));}
  #map(row){return new DomainEventOutboxEntry({id:row.id,organizationId:row.organization_id,eventId:row.event_id,eventType:row.event_type,entityType:row.entity_type,entityId:row.entity_id,payload:row.payload,source:row.source,occurredAt:row.occurred_at,availableAt:row.available_at,status:row.status,attempts:row.attempts,lockedAt:row.locked_at,publishedAt:row.published_at,lastError:row.last_error});}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}
module.exports={DomainEventOutboxRepository};