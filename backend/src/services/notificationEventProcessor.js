const crypto=require("node:crypto");

const SUPPORTED_RECIPIENT_RULES=Object.freeze(["actor","event_payload","static_user"]);

class NotificationEventProcessor {
  constructor({ruleStore=new Map(),templateStore=new Map(),notificationService,deliveryAttemptRepository=null,recipientResolver=NotificationEventProcessor.defaultRecipientResolver,deliverySink=null,authorize=NotificationEventProcessor.defaultAuthorize}={}) {
    if(!notificationService)throw new Error("notificationService is required");
    if(deliveryAttemptRepository&&!notificationService.transaction)throw new Error("transaction is required with durable delivery persistence");
    this.ruleStore=ruleStore;this.templateStore=templateStore;this.notificationService=notificationService;this.deliveryAttemptRepository=deliveryAttemptRepository;
    this.recipientResolver=recipientResolver;this.deliverySink=deliverySink;this.authorize=authorize;
  }

  process(args={}) { return this.deliveryAttemptRepository ? this.#processAsync(args) : this.#processMemory(args); }

  #processMemory({principal,event}={}) {
    this.#requirePrincipal(principal);
    if(!event?.id||!event.organizationId||!event.eventType)throw new Error("Domain event is required");
    if(event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    this.#authorize(principal,principal.organizationId);
    const rules=[...this.ruleStore.values()].filter(r=>r.organizationId===event.organizationId).filter(r=>r.eventType===event.eventType).filter(r=>r.status==="published"&&r.enabled).filter(r=>this.#matchesConditions(r.conditions,event));
    const results=[];
    for(const rule of rules){
      const recipients=this.#resolveRecipients(rule,event);
      if(recipients.length===0)throw new Error("No recipientId could be resolved for notification rule");
      const templates=rule.templateIds.map(id=>this.templateStore.get(id)).filter(t=>t&&t.organizationId===event.organizationId&&t.status==="published");
      for(const recipientId of recipients)for(const template of templates){
        if(!rule.allowedChannels.includes(template.channel))continue;
        const rendered=this.#renderTemplate(template,event);
        const result={id:crypto.randomUUID(),ruleId:rule.id,eventId:event.id,recipientId,deliveryKey:[event.id,rule.id,template.id,recipientId].join(":"),channel:template.channel,status:"queued"};
        if(template.channel==="in_app"){
          const outcome=this.notificationService.createWithResult({principal,id:result.id,organizationId:event.organizationId,recipientId,
            severity:rule.priority==="critical"?"critical":rule.priority==="high"?"important":"information",title:rendered.subject||template.name,message:rendered.body,
            type:"event",relatedEntityType:event.entityType,relatedEntityId:event.entityId,sourceEventId:event.id,sourceEventType:event.eventType,
            deliveryKey:result.deliveryKey,templateId:template.id,templateVersion:template.version,requiresAcknowledgement:rule.required});
          result.status=outcome.created?"created":"deduplicated";result.notificationId=outcome.notification.id;
        }else{
          result.status=this.deliverySink?"handed_off":"delivery_pending";
          if(this.deliverySink)this.deliverySink({...result,organizationId:event.organizationId,subject:rendered.subject,body:rendered.body,event});
        }
        results.push(result);
      }
    }
    return results;
  }

  async #processAsync({principal,event}={}) {
    this.#requirePrincipal(principal);
    if(!event?.id||!event.organizationId||!event.eventType)throw new Error("Domain event is required");
    if(event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    this.#authorize(principal,principal.organizationId);
    const rules=[...this.ruleStore.values()].filter(r=>r.organizationId===event.organizationId).filter(r=>r.eventType===event.eventType).filter(r=>r.status==="published"&&r.enabled).filter(r=>this.#matchesConditions(r.conditions,event));
    const results=[];
    for(const rule of rules){
      const recipients=this.#resolveRecipients(rule,event);
      if(recipients.length===0)throw new Error("No recipientId could be resolved for notification rule");
      const templates=rule.templateIds.map(id=>this.templateStore.get(id)).filter(t=>t&&t.organizationId===event.organizationId&&t.status==="published");
      for(const recipientId of recipients)for(const template of templates){
        if(!rule.allowedChannels.includes(template.channel))continue;
        const rendered=this.#renderTemplate(template,event);
        const result={id:crypto.randomUUID(),ruleId:rule.id,eventId:event.id,recipientId,deliveryKey:[event.id,rule.id,template.id,recipientId].join(":"),channel:template.channel,status:"queued"};
        if(template.channel==="in_app"){
          const outcome=await this.notificationService.createWithResult({
            principal,id:result.id,organizationId:event.organizationId,recipientId,
            severity:rule.priority==="critical"?"critical":rule.priority==="high"?"important":"information",
            title:rendered.subject||template.name,message:rendered.body,type:"event",
            relatedEntityType:event.entityType,relatedEntityId:event.entityId,sourceEventId:event.id,sourceEventType:event.eventType,
            deliveryKey:result.deliveryKey,templateId:template.id,templateVersion:template.version,requiresAcknowledgement:rule.required
          });
          result.status=outcome.created?"created":"deduplicated";result.notificationId=outcome.notification.id;
          if(this.deliveryAttemptRepository && outcome.created){
            await this.notificationService.transaction(principal,"notification.delivery-attempt.create",async db=>{
              await this.deliveryAttemptRepository.create({principal,attempt:{
                id:result.id+":in_app:1",notificationId:outcome.notification.id,channel:"in_app",provider:"internal",
                status:"delivered",attemptNumber:1,idempotencyKey:result.deliveryKey+":attempt:1",requestedAt:outcome.notification.createdAt,
                deliveredAt:outcome.notification.createdAt,maxAttempts:1
              },db});
            });
          }
        }else{
          result.status=this.deliverySink?"handed_off":"delivery_pending";
          if(this.deliverySink)this.deliverySink({...result,organizationId:event.organizationId,subject:rendered.subject,body:rendered.body,event});
        }
        results.push(result);
      }
    }
    return results;
  }

  #resolveRecipients(rule,event){const ids=new Set();for(const rr of rule.recipientRules){const resolved=this.recipientResolver(rr,event);for(const id of (Array.isArray(resolved)?resolved:[resolved]))if(id)ids.add(id);}return [...ids];}
  #renderTemplate(template,event){const variables=new Set(template.variables);const context={eventId:event.id,eventType:event.eventType,entityType:event.entityType,entityId:event.entityId,source:event.source,occurredAt:event.occurredAt,actorUserId:event.actorUserId,...event.payload};const render=v=>String(v).replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g,(match,name)=>{if(!variables.has(name))return match;const value=NotificationEventProcessor.getPath(context,name);return value==null?"":String(value);});return{subject:template.subject?render(template.subject):null,body:render(template.body)};}
  #matchesConditions(c,e){return Object.entries(c||{}).every(([p,x])=>NotificationEventProcessor.getPath({...e,...e.payload},p)===x);}
  #authorize(p,o){if(!this.authorize(p,o))throw new Error("Not authorized");}
  #requirePrincipal(p){if(!p?.userId||!p?.organizationId)throw new Error("Trusted principal is required");}
  static getPath(o,p){return String(p).split(".").reduce((v,k)=>v==null?undefined:v[k],o);}
  static defaultRecipientResolver(r,e){if(!SUPPORTED_RECIPIENT_RULES.includes(r?.type))throw new Error("Unsupported recipient rule");if(r.type==="actor")return e.actorUserId;if(r.type==="event_payload")return NotificationEventProcessor.getPath(e.payload||{},r.path);return r.userId;}
  static defaultAuthorize(p,o){return p.organizationId===o&&Array.isArray(p.permissions)&&p.permissions.includes("notification:dispatch");}
}
module.exports={NotificationEventProcessor,SUPPORTED_RECIPIENT_RULES};
