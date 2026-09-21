const { NotificationTemplate } = require("../models/notificationTemplate");
const { NotificationRule } = require("../models/notificationRule");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({
  TEMPLATE_CREATE:"notification-template:create", TEMPLATE_PUBLISH:"notification-template:publish", TEMPLATE_ARCHIVE:"notification-template:archive",
  RULE_CREATE:"notification-rule:create", RULE_PUBLISH:"notification-rule:publish", RULE_ARCHIVE:"notification-rule:archive", READ:"notification-configuration:read"
});

class NotificationConfigurationService {
  constructor({ templateStore=new Map(), ruleStore=new Map(), auditStore=[], authorize=NotificationConfigurationService.defaultAuthorize }={}) {
    this.templateStore=templateStore; this.ruleStore=ruleStore; this.auditStore=auditStore; this.authorize=authorize;
  }
  createTemplate({principal,...input}) {
    this.#requirePrincipal(principal); const item=new NotificationTemplate(input); this.#authorize(principal,ACTIONS.TEMPLATE_CREATE,item.organizationId); this.#reject(this.templateStore,item.id);
    this.templateStore.set(item.id,item); this.#audit(item.organizationId,principal.userId,"notification_template.created","notification_template",item.id); return item;
  }
  publishTemplate({principal,templateId}) {
    this.#requirePrincipal(principal); const item=this.#template(templateId); this.#authorize(principal,ACTIONS.TEMPLATE_PUBLISH,item.organizationId);
    const updated=new NotificationTemplate({...item,status:"published",publishedAt:new Date(),updatedAt:new Date()}); this.templateStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_template.published","notification_template",item.id); return updated;
  }
  archiveTemplate({principal,templateId}) {
    this.#requirePrincipal(principal); const item=this.#template(templateId); this.#authorize(principal,ACTIONS.TEMPLATE_ARCHIVE,item.organizationId);
    const updated=new NotificationTemplate({...item,status:"archived",updatedAt:new Date()}); this.templateStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_template.archived","notification_template",item.id); return updated;
  }
  createRule({principal,...input}) {
    this.#requirePrincipal(principal); const item=new NotificationRule(input); this.#authorize(principal,ACTIONS.RULE_CREATE,item.organizationId); this.#reject(this.ruleStore,item.id);
    for(const templateId of item.templateIds){const template=this.templateStore.get(templateId); if(!template||template.organizationId!==item.organizationId) throw new Error("Rule references an invalid notification template");}
    this.ruleStore.set(item.id,item); this.#audit(item.organizationId,principal.userId,"notification_rule.created","notification_rule",item.id); return item;
  }
  publishRule({principal,ruleId}) {
    this.#requirePrincipal(principal); const item=this.#rule(ruleId); this.#authorize(principal,ACTIONS.RULE_PUBLISH,item.organizationId);
    for(const templateId of item.templateIds){const template=this.templateStore.get(templateId); if(!template||template.status!=="published") throw new Error("All rule templates must be published before the rule can be published");}
    const updated=new NotificationRule({...item,status:"published",publishedAt:new Date(),updatedAt:new Date()}); this.ruleStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_rule.published","notification_rule",item.id); return updated;
  }
  archiveRule({principal,ruleId}) {
    this.#requirePrincipal(principal); const item=this.#rule(ruleId); this.#authorize(principal,ACTIONS.RULE_ARCHIVE,item.organizationId);
    const updated=new NotificationRule({...item,status:"archived",updatedAt:new Date()}); this.ruleStore.set(item.id,updated);
    this.#audit(item.organizationId,principal.userId,"notification_rule.archived","notification_rule",item.id); return updated;
  }
  listTemplates({principal}) { this.#requirePrincipal(principal); this.#authorize(principal,ACTIONS.READ,principal.organizationId); return [...this.templateStore.values()].filter(x=>x.organizationId===principal.organizationId); }
  listRules({principal}) { this.#requirePrincipal(principal); this.#authorize(principal,ACTIONS.READ,principal.organizationId); return [...this.ruleStore.values()].filter(x=>x.organizationId===principal.organizationId); }
  #template(id){const x=this.templateStore.get(id); if(!x) throw new Error("Notification template not found"); return x;}
  #rule(id){const x=this.ruleStore.get(id); if(!x) throw new Error("Notification rule not found"); return x;}
  #reject(store,id){if(store.has(id)) throw new Error("Configuration ID already exists");}
  #authorize(principal,action,organizationId){if(!this.authorize(principal,action,{organizationId})) throw new Error("Not authorized");}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required");}
  #audit(organizationId,userId,action,entityType,entityId){this.auditStore.push(new AuditEvent({id:action+":"+entityId+":"+String(this.auditStore.length+1),organizationId,userId,action,entityType,entityId}));}
  static defaultAuthorize(principal,action,{organizationId}){return principal.organizationId===organizationId&&Array.isArray(principal.permissions)&&principal.permissions.includes(action);}
}
module.exports={NotificationConfigurationService,ACTIONS};
