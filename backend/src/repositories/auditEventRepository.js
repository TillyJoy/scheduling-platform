const { AuditEvent } = require("../models/auditEvent");

class AuditEventRepository {
  constructor({pool,clock=()=>new Date()}={}) { if(!pool) throw new Error("pool is required"); this.pool=pool; this.clock=clock; }
  async create({principal,event,db=this.pool}={}) {
    if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required");
    if(!event?.action||!event?.entityType||!event?.entityId) throw new Error("Audit event action, entityType, and entityId are required");
    if(event.organizationId&&event.organizationId!==principal.organizationId) throw new Error("Audit event organization mismatch");
    const record=new AuditEvent({...event,organizationId:principal.organizationId,userId:principal.userId,createdAt:event.createdAt||this.clock()});
    const result=await db.query(
      \`INSERT INTO audit_events (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *\`,
      [record.id,record.organizationId,record.userId,record.action,record.entityType,record.entityId,
       record.previousValue==null?null:JSON.stringify(record.previousValue),record.newValue==null?null:JSON.stringify(record.newValue),record.source,record.createdAt]
    );
    return new AuditEvent({id:result.rows[0].id,organizationId:result.rows[0].organization_id,userId:result.rows[0].user_id,
      action:result.rows[0].action,entityType:result.rows[0].entity_type,entityId:result.rows[0].entity_id,
      previousValue:result.rows[0].previous_value,newValue:result.rows[0].new_value,source:result.rows[0].source,createdAt:result.rows[0].created_at});
  }
  async list({principal,entityType=null,entityId=null,db=this.pool}={}) {
    if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required");
    if(!Array.isArray(principal.permissions)||!principal.permissions.includes("audit:read")) throw new Error("Not authorized");
    const values=[principal.organizationId],filters=["organization_id=$1"];
    for(const [field,value] of [["entity_type",entityType],["entity_id",entityId]]) if(value){values.push(value);filters.push(field+"=$"+values.length);}
    const result=await db.query("SELECT * FROM audit_events WHERE "+filters.join(" AND ")+" ORDER BY created_at,id",values);
    return result.rows.map(row=>new AuditEvent({id:row.id,organizationId:row.organization_id,userId:row.user_id,action:row.action,
      entityType:row.entity_type,entityId:row.entity_id,previousValue:row.previous_value,newValue:row.new_value,source:row.source,createdAt:row.created_at}));
  }
}
module.exports={AuditEventRepository};
