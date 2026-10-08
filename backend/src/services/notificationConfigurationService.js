const { NotificationTemplate } = require("../models/notificationTemplate");
const { NotificationRule } = require("../models/notificationRule");
const { AuditEvent } = require("../models/auditEvent");
const crypto = require("node:crypto");

const ACTIONS = Object.freeze({
  TEMPLATE_CREATE:"notification-template:create", TEMPLATE_PUBLISH:"notification-template:publish", TEMPLATE_ARCHIVE:"notification-template:archive",
  RULE_CREATE:"notification-rule:create", RULE_PUBLISH:"notification-rule:publish", RULE_ARCHIVE:"notification-rule:archive", READ:"notification-configuration:read"
});

class NotificationConfigurationService {
  constructor({
    templateStore=new Map(),ruleStore=new Map(),auditStore=[],authorize=NotificationConfigurationService.defaultAuthorize,
    templateRepository=null,ruleRepository=null,auditRepository=null,transaction=null
  }={}) {
    if((templateRepository||ruleRepository)&&(!templateRepository||!ruleRepository||!transaction)) throw new Error("Durable notification configuration requires both repositories and a transaction");
    this.templateStore=templateStore;this.ruleStore=ruleStore;this.auditStore=auditStore;this.authorize=authorize;
    this.templateRepository=templateRepository;this.ruleRepository=ruleRepository;this.auditRepository=auditRepository;this.transaction=transaction;
    this.durable=Boolean(templateRepository&&ruleRepository&&transaction);
  }

  createTemplate(args) {
    if(this.durable) return this.#durableCreateTemplate(args);
    const {principal,...input}=args;
    this.#requirePrincipal(principal);
    const item=new NotificationTemplate(input);
    this.#authorize(principal,ACTIONS.TEMPLATE_CREATE,item.organizationId);
    this.#reject(this.templateStore,item.id);
    if(item.status!=="draft") throw new Error("Templates must be created as drafts");
    this.templateStore.set(item.id+":"+item.version,item);
    if(item.version===1) this.templateStore.set(item.id,item);
    this.#audit(item.organizationId,principal.userId,"notification_template.created","notification_template",item.id,{version:item.version,status:item.status});
    return item;
  }

  publishTemplate(args) {
    if(this.durable) return this.#durablePublishTemplate(args);
    const {principal,templateId,version=null}=args;
    this.#requirePrincipal(principal);
    const item=version===null?this.#template(templateId):this.#templateVersion(templateId,version);
    this.#authorize(principal,ACTIONS.TEMPLATE_PUBLISH,item.organizationId);
    if(item.status!=="draft") throw new Error("Only draft template versions can be published");
    const updated=new NotificationTemplate({...item,status:"published",publishedAt:new Date(),updatedAt:new Date()});
    this.templateStore.set(item.id+":"+updated.version,updated);
    if(!this.templateStore.has(item.id)||this.templateStore.get(item.id).version<=updated.version) this.templateStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_template.published","notification_template",item.id,{version:updated.version});
    return updated;
  }

  archiveTemplate(args) {
    if(this.durable) return this.#durableArchiveTemplate(args);
    const {principal,templateId}=args;
    this.#requirePrincipal(principal);
    const item=args.version===undefined?this.#template(templateId):this.#templateVersion(templateId,args.version);
    this.#authorize(principal,ACTIONS.TEMPLATE_ARCHIVE,item.organizationId);
    if(item.status==="published") throw new Error("Published template versions are immutable; create a new version instead");
    if(item.status==="archived") return item;
    const updated=new NotificationTemplate({...item,status:"archived",archivedAt:new Date(),updatedAt:new Date()});
    this.templateStore.set(item.id+":"+updated.version,updated);
    if(this.templateStore.get(item.id)?.version===updated.version) this.templateStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_template.archived","notification_template",item.id,{version:item.version});
    return updated;
  }

  createTemplateVersion(args) {
    if(this.durable) return this.#durableCreateTemplateVersion(args);
    const {principal,templateId,input={}}=args;
    this.#requirePrincipal(principal);
    const current=args.sourceVersion===undefined?this.#template(templateId):this.#templateVersion(templateId,args.sourceVersion);
    this.#authorize(principal,ACTIONS.TEMPLATE_CREATE,current.organizationId);
    if(current.status!=="published") throw new Error("Only a published template can be versioned");
    const versions=[...this.templateStore.values()].filter(x=>x.id===current.id);
    const next=new NotificationTemplate({...current,...input,id:current.id,organizationId:current.organizationId,version:Math.max(...versions.map(x=>x.version),current.version)+1,status:"draft",publishedAt:null,archivedAt:null,createdAt:new Date(),updatedAt:new Date()});
    this.templateStore.set(next.id+":"+next.version,next);
    this.templateStore.set(next.id,next);
    this.#audit(next.organizationId,principal.userId,"notification_template.version_created","notification_template",next.id,{version:next.version,sourceVersion:current.version});
    return next;
  }

  createRule(args) {
    if(this.durable) return this.#durableCreateRule(args);
    const {principal,...input}=args;
    this.#requirePrincipal(principal);
    const item=new NotificationRule(input);
    this.#authorize(principal,ACTIONS.RULE_CREATE,item.organizationId);
    this.#reject(this.ruleStore,item.id);
    const refs=item.templateRefs.map(ref=>{
      const template=ref.version===null?this.templateStore.get(ref.templateId):this.#templateVersion(ref.templateId,ref.version);
      if(!template||template.organizationId!==item.organizationId) throw new Error("Rule references an invalid notification template");
      if(ref.version!==null && ref.version!==template.version) throw new Error("Rule references an invalid notification template version");
      if(template.status!=="published") throw new Error("Rules must reference published template versions");
      return {templateId:ref.templateId,version:ref.version??template.version};
    });
    this.ruleStore.set(item.id,new NotificationRule({...item,templateRefs:refs,templateIds:undefined}));
    this.#audit(item.organizationId,principal.userId,"notification_rule.created","notification_rule",item.id,{templateRefs:refs});
    return this.ruleStore.get(item.id);
  }

  publishRule(args) {
    if(this.durable) return this.#durablePublishRule(args);
    const {principal,ruleId}=args;
    this.#requirePrincipal(principal);
    const item=this.#rule(ruleId);
    this.#authorize(principal,ACTIONS.RULE_PUBLISH,item.organizationId);
    for(const ref of item.templateRefs) {
      const template=this.#templateVersion(ref.templateId,ref.version);
      if(!template||template.organizationId!==item.organizationId||template.status!=="published"||template.version!==ref.version) {
        throw new Error("All rule templates must reference a valid published template version before the rule can be published");
      }
    }
    if(item.status!=="draft") throw new Error("Only draft rules can be published");
    const updated=new NotificationRule({...item,status:"published",publishedAt:new Date(),updatedAt:new Date()});
    this.ruleStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_rule.published","notification_rule",item.id,{templateRefs:updated.templateRefs});
    return updated;
  }

  archiveRule(args) {
    if(this.durable) return this.#durableArchiveRule(args);
    const {principal,ruleId}=args;
    this.#requirePrincipal(principal);
    const item=this.#rule(ruleId);
    this.#authorize(principal,ACTIONS.RULE_ARCHIVE,item.organizationId);
    if(item.status==="archived") return item;
    const updated=new NotificationRule({...item,status:"archived",archivedAt:new Date(),updatedAt:new Date()});
    this.ruleStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_rule.archived","notification_rule",item.id);
    return updated;
  }

  listTemplates({principal,includeVersions=true}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    if(this.durable) return this.#durableListTemplates({principal,includeVersions});
    const rows=[...new Map([...this.templateStore.values()].filter(x=>x.organizationId===principal.organizationId).map(x=>[x.id+":"+x.version,x])).values()];
    return includeVersions?rows:rows.filter(x=>x.version===Math.max(...rows.filter(y=>y.id===x.id).map(y=>y.version)));
  }

  listRules({principal}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    if(this.durable) return this.#durableListRules({principal});
    return [...this.ruleStore.values()].filter(x=>x.organizationId===principal.organizationId);
  }

  getTemplate({principal,templateId,version=null}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    if(this.durable) return this.#durableGetTemplate({principal,templateId,version});
    const template=this.templateStore.get(templateId);
    if(!template||template.organizationId!==principal.organizationId||(version!==null&&template.version!==version)) return null;
    return template;
  }

  getRule({principal,ruleId}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    if(this.durable) return this.#durableGetRule({principal,ruleId});
    const item=this.ruleStore.get(ruleId);
    return item?.organizationId===principal.organizationId?item:null;
  }

  async #durableCreateTemplate({principal,...input}) {
    this.#requirePrincipal(principal);
    if(input.organizationId&&input.organizationId!==principal.organizationId) throw new Error("Not authorized");
    const item=new NotificationTemplate({...input,organizationId:principal.organizationId,status:"draft"});
    this.#authorize(principal,ACTIONS.TEMPLATE_CREATE,item.organizationId);
    const result=await this.transaction(principal,"notification.configuration.template.create",async db=>{
      const existing=await this.templateRepository.getLatest({principal,templateId:item.id,db});
      if(existing) throw new Error("Configuration ID already exists; create the next version of the template instead");
      const created=await this.templateRepository.createDraft({principal,template:item,db});
      await this.#durableAudit(principal,"notification_template.created","notification_template",created.id,{version:created.version,status:created.status},db);
      return created;
    });
    return result;
  }
  async #durableCreateTemplateVersion({principal,templateId,input={}}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal,ACTIONS.TEMPLATE_CREATE,principal.organizationId);
    return this.transaction(principal,"notification.configuration.template.version",async db=>{
      const current=await this.templateRepository.getLatest({principal,templateId,db,publishedOnly:true});
      if(!current) throw new Error("Published notification template not found");
      const next=await this.templateRepository.createNextVersion({principal,templateId,sourceVersion:current.version,input,db});
      await this.#durableAudit(principal,"notification_template.version_created","notification_template",next.id,{version:next.version,sourceVersion:current.version},db);
      return next;
    });
  }
  async #durablePublishTemplate({principal,templateId,version=null}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal,ACTIONS.TEMPLATE_PUBLISH,principal.organizationId);
    return this.transaction(principal,"notification.configuration.template.publish",async db=>{
      const before=version===null?await this.templateRepository.getLatest({principal,templateId,db}):await this.templateRepository.getVersion({principal,templateId,version,db});
      if(!before) throw new Error("Notification template not found");
      this.#authorize(principal,ACTIONS.TEMPLATE_PUBLISH,before.organizationId);
      const after=await this.templateRepository.publish({principal,templateId,version:before.version,db});
      await this.#durableAudit(principal,"notification_template.published","notification_template",templateId,{version:after.version},db);
      return after;
    });
  }
  async #durableArchiveTemplate({principal,templateId,version=null}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal,ACTIONS.TEMPLATE_ARCHIVE,principal.organizationId);
    return this.transaction(principal,"notification.configuration.template.archive",async db=>{
      const before=version===null?await this.templateRepository.getLatest({principal,templateId,db}):await this.templateRepository.getVersion({principal,templateId,version,db});
      if(!before) throw new Error("Notification template not found");
      this.#authorize(principal,ACTIONS.TEMPLATE_ARCHIVE,before.organizationId);
      const after=await this.templateRepository.archive({principal,templateId,version:before.version,db});
      await this.#durableAudit(principal,"notification_template.archived","notification_template",templateId,{version:after.version},db);
      return after;
    });
  }
  async #durableCreateRule({principal,...input}) {
    this.#requirePrincipal(principal);
    if(input.organizationId&&input.organizationId!==principal.organizationId) throw new Error("Not authorized");
    const item=new NotificationRule({...input,organizationId:principal.organizationId,status:"draft"});
    this.#authorize(principal,ACTIONS.RULE_CREATE,item.organizationId);
    return this.transaction(principal,"notification.configuration.rule.create",async db=>{
      const existing=await this.ruleRepository.get({principal,ruleId:item.id,db});
      if(existing) throw new Error("Configuration ID already exists");
      const created=await this.ruleRepository.createDraft({principal,rule:item,db});
      await this.#durableAudit(principal,"notification_rule.created","notification_rule",created.id,{templateRefs:created.templateRefs},db);
      return created;
    });
  }
  async #durablePublishRule({principal,ruleId}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.RULE_PUBLISH,principal.organizationId);
    return this.transaction(principal,"notification.configuration.rule.publish",async db=>{
      const before=await this.ruleRepository.get({principal,ruleId,db});
      if(!before) throw new Error("Notification rule not found");
      this.#authorize(principal,ACTIONS.RULE_PUBLISH,before.organizationId);
      const after=await this.ruleRepository.publish({principal,ruleId,db});
      await this.#durableAudit(principal,"notification_rule.published","notification_rule",ruleId,{templateRefs:after.templateRefs},db);
      return after;
    });
  }
  async #durableArchiveRule({principal,ruleId}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.RULE_ARCHIVE,principal.organizationId);
    return this.transaction(principal,"notification.configuration.rule.archive",async db=>{
      const before=await this.ruleRepository.get({principal,ruleId,db});
      if(!before) throw new Error("Notification rule not found");
      this.#authorize(principal,ACTIONS.RULE_ARCHIVE,before.organizationId);
      const after=await this.ruleRepository.archive({principal,ruleId,db});
      await this.#durableAudit(principal,"notification_rule.archived","notification_rule",ruleId,{previousStatus:before.status},db);
      return after;
    });
  }
  async #durableListTemplates({principal,includeVersions}) {
    return this.transaction(principal,"notification.configuration.template.list",db=>this.templateRepository.list({principal,includeVersions,db}));
  }
  async #durableListRules({principal}) {
    return this.transaction(principal,"notification.configuration.rule.list",db=>this.ruleRepository.list({principal,db}));
  }
  async #durableGetTemplate({principal,templateId,version}) {
    return this.transaction(principal,"notification.configuration.template.read",async db=>{
      if(version!==null) return this.templateRepository.getVersion({principal,templateId,version,db});
      return this.templateRepository.getLatest({principal,templateId,db});
    });
  }
  async #durableGetRule({principal,ruleId}) {
    return this.transaction(principal,"notification.configuration.rule.read",db=>this.ruleRepository.get({principal,ruleId,db}));
  }
  async #durableAudit(principal,action,entityType,entityId,newValue,db) {
    if(!this.auditRepository) return;
    await this.auditRepository.create({principal,event:{id:crypto.randomUUID(),organizationId:principal.organizationId,action,entityType,entityId,newValue,source:"application"},db});
  }

  #template(id){const versions=[...this.templateStore.values()].filter(x=>x.id===id);const x=versions.sort((a,b)=>b.version-a.version)[0];if(!x)throw new Error("Notification template not found");return x;}
  #templateVersion(id,version){const x=this.templateStore.get(id+":"+version)||[...this.templateStore.values()].find(row=>row.id===id&&row.version===version);if(!x)throw new Error("Notification template version not found");return x;}
  #rule(id){const x=this.ruleStore.get(id);if(!x)throw new Error("Notification rule not found");return x;}
  #reject(store,id){if(store.has(id))throw new Error("Configuration ID already exists");}
  #authorize(principal,action,organizationId){if(!this.authorize(principal,action,{organizationId}))throw new Error("Not authorized");}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
  #audit(organizationId,userId,action,entityType,entityId,newValue=null){
    this.auditStore.push(new AuditEvent({id:action+":"+entityId+":"+String(this.auditStore.length+1),organizationId,userId,action,entityType,entityId,newValue}));
  }
  static defaultAuthorize(principal,action,{organizationId}){
    return principal.organizationId===organizationId&&Array.isArray(principal.permissions)&&principal.permissions.includes(action);
  }
}
module.exports={NotificationConfigurationService,ACTIONS};
