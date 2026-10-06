const {NotificationDeliveryAttempt,STATUSES}=require("../models/notificationDeliveryAttempt");
class NotificationDeliveryAttemptRepository {
  constructor({pool,clock=()=>new Date()}={}){if(!pool)throw new Error("pool is required");this.pool=pool;this.clock=clock;}
  async create({principal,attempt,db=this.pool}) {
    this.#requirePrincipal(principal);const record=new NotificationDeliveryAttempt({...attempt,organizationId:principal.organizationId});
    const result=await db.query(`INSERT INTO notification_delivery_attempts
      (id,organization_id,notification_id,channel,provider,status,attempt_number,idempotency_key,error_code,error_message,provider_message_id,requested_at,sent_at,delivered_at,failed_at,suppressed_at,expired_at,metadata,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$19) RETURNING *`,
      [record.id,principal.organizationId,record.notificationId,record.channel,record.provider,record.status,record.attemptNumber,record.idempotencyKey,record.errorCode,record.errorMessage,record.providerMessageId,record.requestedAt,record.sentAt,record.deliveredAt,record.failedAt,record.suppressedAt,record.expiredAt,JSON.stringify(record.metadata),this.clock()]);
    return this.#map(result.rows[0]);
  }
  async get({principal,deliveryAttemptId,db=this.pool}){this.#requirePrincipal(principal);const result=await db.query("SELECT * FROM notification_delivery_attempts WHERE organization_id=$1 AND id=$2",[principal.organizationId,deliveryAttemptId]);return result.rows[0]?this.#map(result.rows[0]):null;}
  async listForNotification({principal,notificationId,db=this.pool}={}){this.#requirePrincipal(principal);const result=await db.query("SELECT * FROM notification_delivery_attempts WHERE organization_id=$1 AND notification_id=$2 ORDER BY attempt_number,id",[principal.organizationId,notificationId]);return result.rows.map(row=>this.#map(row));}
  async updateStatus({principal,deliveryAttemptId,status,fields={},db=this.pool}) {
    this.#requirePrincipal(principal);if(!STATUSES.includes(status))throw new Error("Invalid delivery attempt status");const current=await this.get({principal,deliveryAttemptId,db});if(!current)throw new Error("Delivery attempt not found");
    const transitions={pending:new Set(["sent","delivered","failed","suppressed","expired"]),sent:new Set(["delivered","failed","expired"]),delivered:new Set(),failed:new Set(),suppressed:new Set(),expired:new Set()};
    if(status!==current.status&&!transitions[current.status]?.has(status))throw new Error("Invalid delivery attempt transition");
    const now=this.clock();const result=await db.query(`UPDATE notification_delivery_attempts SET status=$3,error_code=$4,error_message=$5,provider_message_id=$6,sent_at=$7,delivered_at=$8,failed_at=$9,suppressed_at=$10,expired_at=$11,metadata=$12::jsonb,updated_at=$13 WHERE organization_id=$1 AND id=$2 RETURNING *`,
      [principal.organizationId,deliveryAttemptId,status,fields.errorCode??current.errorCode,fields.errorMessage??current.errorMessage,fields.providerMessageId??current.providerMessageId,fields.sentAt??(status==="sent"?now:current.sentAt),fields.deliveredAt??(status==="delivered"?now:current.deliveredAt),fields.failedAt??(status==="failed"?now:current.failedAt),fields.suppressedAt??(status==="suppressed"?now:current.suppressedAt),fields.expiredAt??(status==="expired"?now:current.expiredAt),JSON.stringify(fields.metadata??current.metadata),now]);
    return this.#map(result.rows[0]);
  }
  #map(row){return new NotificationDeliveryAttempt({id:row.id,organizationId:row.organization_id,notificationId:row.notification_id,channel:row.channel,provider:row.provider,status:row.status,attemptNumber:row.attempt_number,idempotencyKey:row.idempotency_key,errorCode:row.error_code,errorMessage:row.error_message,providerMessageId:row.provider_message_id,requestedAt:row.requested_at,sentAt:row.sent_at,deliveredAt:row.delivered_at,failedAt:row.failed_at,suppressedAt:row.suppressed_at,expiredAt:row.expired_at,metadata:row.metadata});}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}
module.exports={NotificationDeliveryAttemptRepository};