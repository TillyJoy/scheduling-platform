const crypto=require("node:crypto");

const SUPPORTED_RECIPIENT_RULES=Object.freeze(["actor","event_payload","static_user"]);

class NotificationEventProcessor {
  constructor({ruleStore=new Map(),templateStore=new Map(),notificationService,deliveryAttemptRepository=null,recipientResolver=NotificationEventProcessor.defaultRecipientResolver,deliverySink=null,authorize=NotificationEventProcessor.defaultAuthorize}={}) {
    if(!notificationService)throw new Error("notificationService is required");
    if(deliveryAttemptRepository&&!notificationService.transaction)throw new Error("transaction is required with durable delivery persistence");
    this.ruleStore=ruleStore;this.templateStore=templateStore;this.notificationService=notificationService;this.deliveryAttemptRepository=deliveryAttemptRepository;
    this.recipientResolver=recipientResolver;this.deliverySink=deliverySink;this.authorize=authorize;
  }

  process({principal,event}={}) {
    this.#requirePrincipal(principal);
    if(!event?.id||!event.organizationId||!event.eventType)throw new Error("Domain event is required");
    if(event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    this.#authorize(principal,principal.organizationId);
    const rules=[...this.ruleStore.values()].filter(r=>r.organizationId===event.organizationId).filter(r=>r.eventType===event.eventType)
      .filter(r=>r.status==="published"&&r.enabled).filter(r=>this.#matchesConditions(r.conditions,event));
    const results=[];
    for(const rule of rules){
      const recipients=this.#resolveRecipients(rule,event);if(recipients.length===0)throw new Error("No recipientId could be resolved for notification rule");
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
          return Promise.resolve(outcome).then(({notification,created})=>this.#recordInAppAttempt({principal,notification,result,created,results}))
            .then(() => results);
        }
        const handoff=()=>{
          if(this.deliverySink){this.deliverySink({...result,organizationId:event.organizationId,subject:rendered.subject,body:rendered.body,event});result.status="handed_off";}
          else result.status="delivery_pending";
          results.push(result);
          return results;
        };
        return Promise.resolve(this.#recordExternalAttempt({principal,notificationId:null,result}))
          .then(()=>handoff());
      }
    }
    return results;
  }

  #recordInAppAttempt({principal,notification,result,created,results}){
    if(!created&&!this.deliveryAttemptRepository){result.status="deduplicated";result.notificationId=notification.id;results.push(result);return null;}
    result.status=created?"created":"deduplicated";result.notificationId=notification.id;
    if(!this.deliveryAttemptRepository){results.push(result);return null;}
    return this.notificationService.transaction(principal,"notification.delivery-attempt.create",async db=>{
      let attempt;
      const existing=await this.deliveryAttemptRepository.get({principal,deliveryAttemptId:result.id+":attempt",db});
      if(existing)attempt=existing;
      else attempt=await this.deliveryAttemptRepository.create({principal,attempt:{id:result.id+":attempt",notificationId:notification.id,channel:"in_app",provider:"internal",
        status:"delivered",attemptNumber:1,idempotencyKey:result.deliveryKey+":attempt:1",requestedAt:notification.createdAt,deliveredAt:notification.createdAt},db});
      results.push(result);return attempt;
    });
  }

  #recordExternalAttempt({principal,notificationId,result}){
    if(!this.deliveryAttemptRepository)return null;
    return this.notificationService.transaction(principal,"notification.delivery-attempt.create",async db=>{
      const notification=notificationId?notificationId:null;
      if(notification)return;
      // External provider delivery is not implemented. The attempt foundation is recorded only
      // when a logical notification exists; provider adapters will create subsequent attempts.
    });
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