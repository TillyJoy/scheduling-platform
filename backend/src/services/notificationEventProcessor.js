const crypto = require("node:crypto");
const { Notification } = require("../models/notification");

const SUPPORTED_RECIPIENT_RULES = Object.freeze(["actor", "event_payload", "static_user"]);

class NotificationEventProcessor {
  constructor({
    ruleStore = new Map(), templateStore = new Map(), notificationService,
    recipientResolver = NotificationEventProcessor.defaultRecipientResolver,
    deliverySink = null, authorize = NotificationEventProcessor.defaultAuthorize,
    configurationService = null, transaction = null, durableConfiguration = false
  } = {}) {
    if (!notificationService) throw new Error("notificationService is required");
    if (durableConfiguration && (!configurationService || !transaction)) {
      throw new Error("Durable configuration processing requires configurationService and transaction");
    }
    this.ruleStore=ruleStore; this.templateStore=templateStore; this.notificationService=notificationService;
    this.recipientResolver=recipientResolver; this.deliverySink=deliverySink; this.authorize=authorize;
    this.configurationService=configurationService; this.transaction=transaction; this.durableConfiguration=durableConfiguration;
  }

  process(args) {
    return this.durableConfiguration ? this.#processDurable(args) : this.#processMemory(args);
  }

  #processMemory({principal,event}={}) {
    this.#requirePrincipal(principal);
    this.#validateEvent(principal,event);
    const rules=[...this.ruleStore.values()]
      .filter(rule=>rule.organizationId===event.organizationId)
      .filter(rule=>rule.eventType===event.eventType)
      .filter(rule=>rule.status==="published"&&rule.enabled)
      .filter(rule=>this.#matchesConditions(rule.conditions,event));
    const results=[];
    for(const rule of rules) {
      const recipients=this.#resolveRecipients(rule,event);
      if(recipients.length===0) throw new Error("No recipientId could be resolved for notification rule");
      const refs=rule.templateRefs||(rule.templateIds||[]).map(templateId=>({templateId,version:null}));
      for(const recipientId of recipients) for(const ref of refs) {
        const template=this.templateStore.get(ref.templateId+":"+(ref.version??""))||this.templateStore.get(ref.templateId);
        if(!template||template.organizationId!==event.organizationId||template.status!=="published") continue;
        if(ref.version!==null&&ref.version!==undefined&&template.version!==ref.version) continue;
        if(!rule.allowedChannels.includes(template.channel)) continue;
        results.push(this.#processOneMemory({principal,event,rule,template,recipientId}));
      }
    }
    return results;
  }

  async #processDurable({principal,event}={}) {
    this.#requirePrincipal(principal);
    this.#validateEvent(principal,event);
    // Resolve every published rule and exact template version in one short read transaction.
    const snapshot=await this.transaction(principal,"notification.configuration.dispatch.snapshot",async db=>{
      const rules=await this.configurationService.ruleRepository.list({principal,publishedOnly:true,db});
      const matching=rules.filter(rule=>rule.eventType===event.eventType&&rule.status==="published"&&rule.enabled&&this.#matchesConditions(rule.conditions,event));
      const byRule=[];
      for(const rule of matching) {
        const templates=[];
        for(const ref of rule.templateRefs) {
          const template=await this.configurationService.templateRepository.getVersion({principal,templateId:ref.templateId,version:ref.version,db});
          if(!template||template.status!=="published") throw new Error("Published notification rule references an unavailable template version");
          if(!rule.allowedChannels.includes(template.channel)) throw new Error("Published notification rule references a template on a disallowed channel");
          templates.push(template);
        }
        byRule.push({rule,templates});
      }
      return byRule;
    });
    const results=[];
    for(const {rule,templates} of snapshot) {
      const recipients=this.#resolveRecipients(rule,event);
      if(recipients.length===0) throw new Error("No recipientId could be resolved for notification rule");
      for(const recipientId of recipients) for(const template of templates) {
        if(!rule.allowedChannels.includes(template.channel)) continue;
        results.push(await this.#processOneDurable({principal,event,rule,template,recipientId}));
      }
    }
    return results;
  }

  #processOneMemory({principal,event,rule,template,recipientId}) {
    const rendered=this.#renderTemplate(template,event);
    const deliveryKey=[event.id,rule.id,template.id,recipientId].join(":");
    const result={id:crypto.randomUUID(),ruleId:rule.id,eventId:event.id,recipientId,deliveryKey,channel:template.channel,status:"queued",templateId:template.id,templateVersion:template.version};
    if(template.channel==="in_app") {
      const existing=[...this.notificationService.notificationStore.values()].find(candidate=>candidate.organizationId===event.organizationId&&candidate.deliveryKey===deliveryKey);
      const notification=this.notificationService.create({
        principal,id:result.id,organizationId:event.organizationId,recipientId,
        severity:rule.priority==="critical"?"critical":rule.priority==="high"?"important":"information",
        title:rendered.subject||template.name,message:rendered.body,type:"event",
        relatedEntityType:event.entityType,relatedEntityId:event.entityId,sourceEventId:event.id,sourceEventType:event.eventType,
        deliveryKey,templateId:template.id,templateVersion:template.version,requiresAcknowledgement:rule.required
      });
      result.status=existing?"deduplicated":"created";
      result.notificationId=notification.id;
    } else if(this.deliverySink) {
      this.deliverySink({...result,organizationId:event.organizationId,subject:rendered.subject,body:rendered.body,event});
      result.status="handed_off";
    } else result.status="delivery_pending";
    return result;
  }

  async #processOneDurable({principal,event,rule,template,recipientId}) {
    const rendered=this.#renderTemplate(template,event);
    const deliveryKey=[event.id,rule.id,template.id,recipientId].join(":");
    const result={id:crypto.randomUUID(),ruleId:rule.id,eventId:event.id,recipientId,deliveryKey,channel:template.channel,status:"queued",templateId:template.id,templateVersion:template.version};
    if(template.channel==="in_app") {
      const existing=await this.notificationService.notificationRepository.findByDeliveryKey({principal,deliveryKey});
      const notification=await this.notificationService.create({
        principal,id:result.id,organizationId:event.organizationId,recipientId,
        severity:rule.priority==="critical"?"critical":rule.priority==="high"?"important":"information",
        title:rendered.subject||template.name,message:rendered.body,type:"event",
        relatedEntityType:event.entityType,relatedEntityId:event.entityId,sourceEventId:event.id,sourceEventType:event.eventType,
        deliveryKey,templateId:template.id,templateVersion:template.version,requiresAcknowledgement:rule.required
      });
      result.status=existing?"deduplicated":"created";
      result.notificationId=notification.id;
    } else if(this.deliverySink) {
      // Database snapshot transactions have ended before external delivery handoff.
      this.deliverySink({...result,organizationId:event.organizationId,subject:rendered.subject,body:rendered.body,event});
      result.status="handed_off";
    } else result.status="delivery_pending";
    return result;
  }

  #resolveRecipients(rule,event) {
    const ids=new Set();
    for(const recipientRule of rule.recipientRules) {
      const resolved=this.recipientResolver(recipientRule,event);
      for(const id of Array.isArray(resolved)?resolved:[resolved]) if(id) ids.add(id);
    }
    return [...ids];
  }

  #renderTemplate(template,event) {
    const variables=new Set(template.variables);
    const context={eventId:event.id,eventType:event.eventType,entityType:event.entityType,entityId:event.entityId,source:event.source,occurredAt:event.occurredAt,actorUserId:event.actorUserId,...event.payload};
    const render=value=>String(value).replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g,(match,name)=>{
      if(!variables.has(name)) return match;
      const resolved=NotificationEventProcessor.getPath(context,name);
      return resolved===undefined||resolved===null?"":String(resolved);
    });
    return {subject:template.subject?render(template.subject):null,body:render(template.body)};
  }

  #matchesConditions(conditions,event) {
    return Object.entries(conditions||{}).every(([path,expected])=>NotificationEventProcessor.getPath({...event,...event.payload},path)===expected);
  }
  #validateEvent(principal,event) {
    if(!event?.id||!event.organizationId||!event.eventType) throw new Error("Domain event is required");
    if(event.organizationId!==principal.organizationId) throw new Error("Not authorized");
    this.#authorize(principal,principal.organizationId);
  }
  #authorize(principal,organizationId) {if(!this.authorize(principal,organizationId))throw new Error("Not authorized");}
  #requirePrincipal(principal) {if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}

  static getPath(object,path) {return String(path).split(".").reduce((value,key)=>value==null?undefined:value[key],object);}
  static defaultRecipientResolver(rule,event) {
    if(!SUPPORTED_RECIPIENT_RULES.includes(rule?.type)) throw new Error("Unsupported recipient rule");
    if(rule.type==="actor") return event.actorUserId;
    if(rule.type==="event_payload") return NotificationEventProcessor.getPath(event.payload||{},rule.path);
    if(rule.type==="static_user") return rule.userId;
  }
  static defaultAuthorize(principal,organizationId) {
    return principal.organizationId===organizationId&&Array.isArray(principal.permissions)&&principal.permissions.includes("notification:dispatch");
  }
}
module.exports={NotificationEventProcessor,SUPPORTED_RECIPIENT_RULES};
