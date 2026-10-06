const crypto=require("node:crypto");
const {DomainEventOutboxEntry}=require("../models/domainEventOutboxEntry");

const ACTIONS=Object.freeze({ENQUEUE:"event:emit",DISPATCH:"event:dispatch"});

class DomainEventOutboxService {
  constructor({outboxStore=[],auditStore=[],outboxRepository=null,transaction=null,authorize=DomainEventOutboxService.defaultAuthorize}={}) {
    if(outboxRepository&&!transaction)throw new Error("transaction is required with durable outbox persistence");
    this.outboxStore=outboxStore;this.auditStore=auditStore;this.outboxRepository=outboxRepository;this.transaction=transaction;this.authorize=authorize;
  }

  enqueue({principal,event,id=crypto.randomUUID(),availableAt=new Date(),db=null}={}) {
    return this.outboxRepository?this.#durableEnqueue({principal,event,id,availableAt,db}):this.#memoryEnqueue({principal,event,id,availableAt});
  }
  claimBatch({principal,limit=10,now=new Date()}={}) { return this.outboxRepository?this.transaction(principal,"event.dispatch.claim",db=>this.#durableClaim({principal,limit,now,db})):this.#memoryClaim({principal,limit,now}); }
  markPublished({principal,outboxId,publishedAt=new Date()}={}) { return this.outboxRepository?this.transaction(principal,"event.dispatch.publish",db=>this.outboxRepository.markPublished({principal,outboxId,publishedAt,db})):this.#memoryMarkPublished({principal,outboxId,publishedAt}); }
  markFailed({principal,outboxId,error,availableAt=new Date()}={}) { return this.outboxRepository?this.transaction(principal,"event.dispatch.fail",db=>this.outboxRepository.markFailed({principal,outboxId,error,availableAt,db})):this.#memoryMarkFailed({principal,outboxId,error,availableAt}); }
  listPending({principal}={}) { return this.outboxRepository?this.transaction(principal,"event.dispatch.list",db=>this.outboxRepository.listPending({principal,db})):this.#memoryListPending({principal}); }

  async #durableEnqueue({principal,event,id,availableAt,db}) {
    this.#requirePrincipal(principal);
    if(!event?.id||event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    this.#authorize(principal,ACTIONS.ENQUEUE,principal.organizationId);
    if(db)return this.outboxRepository.enqueue({principal,event,id,availableAt,db});
    return this.transaction(principal,"event.emit.outbox",client=>this.outboxRepository.enqueue({principal,event,id,availableAt,db:client}));
  }
  async #durableClaim({principal,limit,now,db}) { this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.DISPATCH,principal.organizationId);return this.outboxRepository.claimBatch({principal,limit,now,db}); }

  #memoryEnqueue({principal,event,id,availableAt}) {
    this.#requirePrincipal(principal);if(!event?.id||event.organizationId!==principal.organizationId)throw new Error("Not authorized");
    this.#authorize(principal,ACTIONS.ENQUEUE,principal.organizationId);
    if(this.outboxStore.some(e=>e.eventId===event.id||e.id===id))throw new Error("Domain event or outbox entry is already queued");
    const entry=new DomainEventOutboxEntry({id,organizationId:principal.organizationId,eventId:event.id,eventType:event.eventType,entityType:event.entityType,entityId:event.entityId,
      payload:event.payload,source:event.source,occurredAt:event.occurredAt,availableAt});this.outboxStore.push(entry);return entry;
  }
  #memoryClaim({principal,limit,now}) {
    this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.DISPATCH,principal.organizationId);if(!Number.isInteger(limit)||limit<1)throw new Error("limit must be a positive integer");
    const claimed=this.outboxStore.filter(e=>e.organizationId===principal.organizationId).filter(e=>(e.status==="pending"||e.status==="failed")).filter(e=>new Date(e.availableAt)<=now).sort((a,b)=>new Date(a.availableAt)-new Date(b.availableAt)).slice(0,limit);
    for(const e of claimed){e.status="processing";e.attempts+=1;e.lockedAt=now;}return claimed;
  }
  #memoryMarkPublished({principal,outboxId,publishedAt}){this.#requirePrincipal(principal);const e=this.#findMemory(principal,outboxId);this.#authorize(principal,ACTIONS.DISPATCH,e.organizationId);if(e.status!=="processing")throw new Error("Outbox entry is not processing");e.status="published";e.publishedAt=publishedAt;e.lockedAt=null;e.lastError=null;return e;}
  #memoryMarkFailed({principal,outboxId,error,availableAt}){this.#requirePrincipal(principal);const e=this.#findMemory(principal,outboxId);this.#authorize(principal,ACTIONS.DISPATCH,e.organizationId);if(e.status!=="processing")throw new Error("Outbox entry is not processing");e.status="failed";e.lockedAt=null;e.lastError=String(error||"Unknown dispatch failure");e.availableAt=availableAt;return e;}
  #memoryListPending({principal}){this.#requirePrincipal(principal);this.#authorize(principal,ACTIONS.DISPATCH,principal.organizationId);return this.outboxStore.filter(e=>e.organizationId===principal.organizationId&&e.status!=="published");}
  #findMemory(principal,id){const e=this.outboxStore.find(x=>x.id===id&&x.organizationId===principal.organizationId);if(!e)throw new Error("Outbox entry not found");return e;}
  #authorize(principal,action,organizationId){if(!this.authorize(principal,action,{organizationId}))throw new Error("Not authorized");}
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
  static defaultAuthorize(principal,action,{organizationId}){return principal.organizationId===organizationId&&Array.isArray(principal.permissions)&&principal.permissions.includes(action);}
}
module.exports={DomainEventOutboxService,ACTIONS};