const { NotificationRule } = require("../models/notificationRule");

class NotificationRuleRepository {
  constructor({pool,templateRepository,clock=()=>new Date()}={}) {
    if(!pool) throw new Error("pool is required");
    if(!templateRepository) throw new Error("templateRepository is required");
    this.pool=pool;this.templateRepository=templateRepository;this.clock=clock;
  }
  async createDraft({principal,rule,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    if(rule.organizationId&&rule.organizationId!==principal.organizationId) throw new Error("Notification rule organization mismatch");
    const record=new NotificationRule({...rule,organizationId:principal.organizationId,status:"draft"});
    const refs=record.templateRefs.map(ref=>({templateId:ref.templateId,version:ref.version}));
    for(const ref of refs) if(ref.version!==null) {
      const template=await this.templateRepository.getVersion({principal,templateId:ref.templateId,version:ref.version,db});
      if(!template||template.organizationId!==principal.organizationId) throw new Error("Rule references an invalid notification template");
    } else {
      const latest=await this.templateRepository.getLatest({principal,templateId:ref.templateId,db,publishedOnly:true});
      if(!latest) throw new Error("Rule references an invalid notification template");
      ref.version=latest.version;
    }
    const result=await db.query(
      `INSERT INTO notification_rules (organization_id,rule_id,name,event_type,conditions,recipient_rules,template_refs,allowed_channels,timing,required,priority,enabled,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,'draft',$13,$13) RETURNING *`,
      [principal.organizationId,record.id,record.name,record.eventType,JSON.stringify(record.conditions),JSON.stringify(record.recipientRules),JSON.stringify(refs),JSON.stringify(record.allowedChannels),JSON.stringify(record.timing),record.required,record.priority,record.enabled,this.clock()]
    );
    return this.#map(result.rows[0]);
  }
  async publish({principal,ruleId,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const locked=await db.query("SELECT status FROM notification_rules WHERE organization_id=$1 AND rule_id=$2 FOR UPDATE",[principal.organizationId,ruleId]);
    if(!locked.rows[0]) throw new Error("Notification rule not found");
    const before=await this.get({principal,ruleId,db});
    if(!before) throw new Error("Notification rule not found");
    if(before.status==="published") return before;
    if(before.status!=="draft") throw new Error("Only draft rules can be published");
    const resolved=await this.templateRepository.resolvePublishedRefs({principal,templateRefs:before.templateRefs,db});
    for(const ref of resolved) if(!before.allowedChannels.includes(ref.channel)) throw new Error("Rule template channel is not allowed by the rule");
    const result=await db.query(
      `UPDATE notification_rules SET status='published',published_at=$3,updated_at=$3
       WHERE organization_id=$1 AND rule_id=$2 AND status='draft' RETURNING *`,
      [principal.organizationId,ruleId,this.clock()]
    );
    if(!result.rows[0]) throw new Error("Notification rule changed concurrently");
    return this.#map(result.rows[0]);
  }
  async archive({principal,ruleId,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const current=await this.get({principal,ruleId,db});
    if(!current) throw new Error("Notification rule not found");
    if(current.status==="published") {
      const result=await db.query(
        `UPDATE notification_rules SET status='archived',archived_at=$3,updated_at=$3
         WHERE organization_id=$1 AND rule_id=$2 AND status='published' RETURNING *`,
        [principal.organizationId,ruleId,this.clock()]
      );
      if(!result.rows[0]) throw new Error("Notification rule changed concurrently");
      return this.#map(result.rows[0]);
    }
    if(current.status==="archived") return current;
    const result=await db.query(
      `UPDATE notification_rules SET status='archived',archived_at=$3,updated_at=$3
       WHERE organization_id=$1 AND rule_id=$2 AND status IN ('draft','inactive') RETURNING *`,
      [principal.organizationId,ruleId,this.clock()]
    );
    if(!result.rows[0]) throw new Error("Notification rule changed concurrently");
    return this.#map(result.rows[0]);
  }
  async get({principal,ruleId,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const result=await db.query("SELECT * FROM notification_rules WHERE organization_id=$1 AND rule_id=$2",[principal.organizationId,ruleId]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }
  async list({principal,publishedOnly=false,db=this.pool}={}) {
    this.#requirePrincipal(principal);
    const result=await db.query(
      `SELECT * FROM notification_rules WHERE organization_id=$1 ${publishedOnly?"AND status='published' AND enabled=true":""} ORDER BY rule_id`,
      [principal.organizationId]
    );
    return result.rows.map(row=>this.#map(row));
  }
  #map(row){return new NotificationRule({id:row.rule_id,organizationId:row.organization_id,name:row.name,eventType:row.event_type,conditions:row.conditions,recipientRules:row.recipient_rules,templateRefs:row.template_refs,allowedChannels:row.allowed_channels,timing:row.timing,required:row.required,priority:row.priority,enabled:row.enabled,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,archivedAt:row.archived_at});}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required");}
}
module.exports={NotificationRuleRepository};
