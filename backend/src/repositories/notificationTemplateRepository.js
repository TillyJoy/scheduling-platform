const { NotificationTemplate } = require("../models/notificationTemplate");

class NotificationTemplateRepository {
  constructor({ pool, clock=()=>new Date() }={}) { if(!pool) throw new Error("pool is required"); this.pool=pool; this.clock=clock; }
  async createDraft({principal,template,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    if(template.organizationId && template.organizationId!==principal.organizationId) throw new Error("Notification template organization mismatch");
    const record=new NotificationTemplate({...template,organizationId:principal.organizationId,status:"draft"});
    const max=await db.query("SELECT COALESCE(MAX(version),0)::int AS version FROM notification_templates WHERE organization_id=$1 AND template_id=$2",[principal.organizationId,record.id]);
    const version=Math.max(record.version,max.rows[0].version+1);
    const result=await db.query(
      `INSERT INTO notification_templates (organization_id,template_id,version,name,channel,subject,body,variables,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'draft',$9,$9) RETURNING *`,
      [principal.organizationId,record.id,version,record.name,record.channel,record.subject,record.body,JSON.stringify(record.variables),this.clock()]
    );
    return this.#map(result.rows[0]);
  }
  async createNextVersion({principal,templateId,sourceVersion,input={},db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const current=await this.getVersion({principal,templateId,version:sourceVersion,db});
    if(!current) throw new Error("Notification template version not found");
    if(current.status!=="published") throw new Error("Only a published template version can be versioned");
    const next=new NotificationTemplate({...current,...input,id:templateId,organizationId:principal.organizationId,version:current.version+1,status:"draft",publishedAt:null,archivedAt:null,createdAt:this.clock(),updatedAt:this.clock()});
    const result=await db.query(
      `INSERT INTO notification_templates (organization_id,template_id,version,name,channel,subject,body,variables,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'draft',$9,$9) RETURNING *`,
      [principal.organizationId,next.id,next.version,next.name,next.channel,next.subject,next.body,JSON.stringify(next.variables),this.clock()]
    );
    return this.#map(result.rows[0]);
  }
  async publish({principal,templateId,version,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const before=await this.getVersion({principal,templateId,version,db});
    if(!before) throw new Error("Notification template version not found");
    if(before.status==="published") return before;
    if(before.status!=="draft") throw new Error("Only draft template versions can be published");
    const result=await db.query(
      `UPDATE notification_templates SET status='published',published_at=$4,updated_at=$4
       WHERE organization_id=$1 AND template_id=$2 AND version=$3 AND status='draft' RETURNING *`,
      [principal.organizationId,templateId,version,this.clock()]
    );
    if(!result.rows[0]) throw new Error("Notification template version changed concurrently");
    return this.#map(result.rows[0]);
  }
  async archive({principal,templateId,version,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const current=await this.getVersion({principal,templateId,version,db});
    if(!current) throw new Error("Notification template version not found");
    if(current.status==="published") throw new Error("Published template versions are immutable; create a new version instead");
    if(current.status==="archived") return current;
    const result=await db.query(
      `UPDATE notification_templates SET status='archived',archived_at=$4,updated_at=$4
       WHERE organization_id=$1 AND template_id=$2 AND version=$3 AND status IN ('draft','inactive') RETURNING *`,
      [principal.organizationId,templateId,version,this.clock()]
    );
    if(!result.rows[0]) throw new Error("Notification template version changed concurrently");
    return this.#map(result.rows[0]);
  }
  async getVersion({principal,templateId,version,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const result=await db.query("SELECT * FROM notification_templates WHERE organization_id=$1 AND template_id=$2 AND version=$3",[principal.organizationId,templateId,version]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }
  async getLatest({principal,templateId,db=this.pool,publishedOnly=false}={}) {
    this.#requirePrincipal(principal);
    const result=await db.query(
      `SELECT * FROM notification_templates WHERE organization_id=$1 AND template_id=$2 ${publishedOnly?"AND status='published'":""} ORDER BY version DESC LIMIT 1`,
      [principal.organizationId,templateId]
    );
    return result.rows[0]?this.#map(result.rows[0]):null;
  }
  async list({principal,includeVersions=true,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const result=await db.query(
      `SELECT * FROM notification_templates WHERE organization_id=$1 ORDER BY template_id,version DESC`,
      [principal.organizationId]
    );
    const rows=result.rows.map(row=>this.#map(row));
    return includeVersions?rows:rows.filter(row=>row.version===Math.max(...rows.filter(x=>x.id===row.id).map(x=>x.version)));
  }
  async resolvePublishedRefs({principal,templateRefs,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const resolved=[];
    for(const ref of templateRefs){
      if(!Number.isInteger(ref.version)||ref.version<1) throw new Error("Published rules must pin an exact template version");
      const template=await this.getVersion({principal,templateId:ref.templateId,version:ref.version,db});
      if(!template||template.status!=="published") throw new Error("Rule references a missing, cross-tenant, or unpublished template version");
      resolved.push({templateId:template.id,version:template.version,channel:template.channel});
    }
    return resolved;
  }
  #map(row){return new NotificationTemplate({id:row.template_id,organizationId:row.organization_id,name:row.name,channel:row.channel,subject:row.subject,body:row.body,variables:row.variables,version:row.version,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,archivedAt:row.archived_at});}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}
module.exports={NotificationTemplateRepository};
