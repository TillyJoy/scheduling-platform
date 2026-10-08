const { Notification } = require("../models/notification");

class NotificationRepository {
  constructor({ pool, clock = () => new Date() } = {}) { if(!pool) throw new Error("pool is required"); this.pool=pool; this.clock=clock; }

  async create({ principal, notification, db=this.pool }) {
    this.#requirePrincipal(principal);
    if (notification.organizationId && notification.organizationId !== principal.organizationId) throw new Error("Notification organization mismatch");
    const record=new Notification({...notification,organizationId:principal.organizationId});
    const result=await db.query(
      `INSERT INTO notifications
       (id,organization_id,recipient_id,severity,title,message,type,icon,color,related_entity_type,related_entity_id,source_event_id,
        source_event_type,delivery_key,template_id,template_version,metadata,status,requires_acknowledgement,created_at,acknowledged_at,dismissed_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [record.id,principal.organizationId,record.recipientId,record.severity,record.title,record.message,record.type,record.icon,record.color,
       record.relatedEntityType,record.relatedEntityId,record.sourceEventId,record.sourceEventType,record.deliveryKey,record.templateId,record.templateVersion,
       JSON.stringify(record.metadata ?? {}),record.status,record.requiresAcknowledgement,record.createdAt,record.acknowledgedAt,record.dismissedAt,record.expiresAt]
    );
    return this.#map(result.rows[0]);
  }

  async findByDeliveryKey({ principal, deliveryKey, db=this.pool }) {
    this.#requirePrincipal(principal);
    if(!deliveryKey) return null;
    const result=await db.query("SELECT * FROM notifications WHERE organization_id=$1 AND delivery_key=$2",[principal.organizationId,deliveryKey]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }

  async get({ principal, notificationId, db=this.pool }) {
    this.#requirePrincipal(principal);
    const result=await db.query("SELECT * FROM notifications WHERE organization_id=$1 AND id=$2",[principal.organizationId,notificationId]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }

  async listForRecipient({ principal, status=null, db=this.pool }={}) {
    this.#requirePrincipal(principal);
    const values=[principal.organizationId,principal.userId];
    const filters=["organization_id=$1","recipient_id=$2","(expires_at IS NULL OR expires_at > now())"];
    if(status){values.push(status);filters.push("status=$"+values.length);}
    const result=await db.query(
      `SELECT * FROM notifications WHERE ${filters.join(" AND ")}
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'important' THEN 1 WHEN 'warning' THEN 2 WHEN 'information' THEN 3 WHEN 'success' THEN 4 ELSE 5 END,created_at DESC,id DESC`,values);
    return result.rows.map(row=>this.#map(row));
  }

  async findByDeliveryKey({ principal, deliveryKey, db=this.pool }) {
    this.#requirePrincipal(principal);
    if (!deliveryKey) return null;
    const result=await db.query("SELECT * FROM notifications WHERE organization_id=$1 AND delivery_key=$2",[principal.organizationId,deliveryKey]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }

  async updateStatus({ principal, notificationId, status, timestamp=null, db=this.pool }) {
    this.#requirePrincipal(principal);
    const current=await this.get({principal,notificationId,db});
    if(!current) throw new Error("Notification not found");
    if(status==="acknowledged"&&!current.requiresAcknowledgement) throw new Error("Notification does not require acknowledgement");
    const stamp=timestamp||this.clock();
    let setClause;
    if(status==="read") setClause="status='read'";
    else if(status==="acknowledged") setClause="status='acknowledged',acknowledged_at=$3";
    else if(status==="dismissed") setClause="status='dismissed',dismissed_at=$3";
    else throw new Error("Invalid notification status transition");
    const values = [principal.organizationId, notificationId];
    if (status !== "read") values.push(stamp);
    const result=await db.query(`UPDATE notifications SET ${setClause} WHERE organization_id=$1 AND id=$2 RETURNING *`,
      values);
    return this.#map(result.rows[0]);
  }

  #map(row){return new Notification({
    id:row.id,organizationId:row.organization_id,recipientId:row.recipient_id,severity:row.severity,title:row.title,message:row.message,type:row.type,
    icon:row.icon,color:row.color,relatedEntityType:row.related_entity_type,relatedEntityId:row.related_entity_id,sourceEventId:row.source_event_id,
    sourceEventType:row.source_event_type,deliveryKey:row.delivery_key,templateId:row.template_id,templateVersion:row.template_version,metadata:row.metadata,
    status:row.status,requiresAcknowledgement:row.requires_acknowledgement,createdAt:row.created_at,acknowledgedAt:row.acknowledged_at,dismissedAt:row.dismissed_at,
    expiresAt:row.expires_at
  });}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}

module.exports={NotificationRepository};