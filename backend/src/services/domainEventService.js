const crypto = require("node:crypto");
const { DomainEvent } = require("../models/domainEvent");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({ EMIT:"event:emit", READ:"event:read" });

class DomainEventService {
  constructor({ eventStore=[], auditStore=[], eventRepository=null, outboxRepository=null, transaction=null, authorize=DomainEventService.defaultAuthorize }={}) {
    if ((eventRepository || outboxRepository) && !transaction) throw new Error("transaction is required with durable event persistence");
    this.eventStore=eventStore; this.auditStore=auditStore; this.eventRepository=eventRepository; this.outboxRepository=outboxRepository;
    this.transaction=transaction; this.authorize=authorize;
  }

  emit(args={}) { return this.eventRepository ? this.#durableEmit(args) : this.#memoryEmit(args); }
  list(args={}) { return this.eventRepository ? this.#durableList(args) : this.#memoryList(args); }

  async #durableEmit({
    principal,id=crypto.randomUUID(),eventType,entityType,entityId,payload={},source="application",occurredAt=new Date(),
    correlationId=null,causationId=null,outboxId=null,availableAt=null,db=null
  }={}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal,ACTIONS.EMIT,principal.organizationId);
    const event=new DomainEvent({id,organizationId:principal.organizationId,eventType,entityType,entityId,actorUserId:principal.userId,
      payload,source,occurredAt,correlationId,causationId});
    const write=async client=>{
      if(await this.eventRepository.get({principal,eventId:event.id,db:client})) throw new Error("Domain event ID already exists");
      const saved=await this.eventRepository.create({principal,event,db:client});
      if(this.outboxRepository) await this.outboxRepository.enqueue({principal,event:saved,id:outboxId,availableAt,db:client});
      await client.query(
        `INSERT INTO audit_events
         (id,organization_id,user_id,action,entity_type,entity_id,new_value,source,created_at)
         VALUES (gen_random_uuid()::text,$1,$2,'domain-event.emitted',$3,$4,$5::jsonb,'application',$6)`,
        [principal.organizationId,principal.userId,saved.entityType,saved.entityId,
         JSON.stringify({eventId:saved.id,eventType:saved.eventType,source:saved.source}),saved.occurredAt]
      );
      return saved;
    };
    return db ? write(db) : this.transaction(principal,"domain-event.emit",write);
  }

  async #durableList({principal,entityType=null,entityId=null,eventType=null}={}) {
    this.#requirePrincipal(principal); this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    return this.transaction(principal,"domain-event.list",db=>this.eventRepository.list({principal,entityType,entityId,eventType,db}));
  }

  #memoryEmit({principal,id=crypto.randomUUID(),eventType,entityType,entityId,payload={},source="application",occurredAt=new Date(),correlationId=null,causationId=null}) {
    this.#requirePrincipal(principal);
    if(this.eventStore.some(event=>event.id===id)) throw new Error("Domain event ID already exists");
    this.#authorize(principal,ACTIONS.EMIT,principal.organizationId);
    const event=new DomainEvent({id,organizationId:principal.organizationId,eventType,entityType,entityId,actorUserId:principal.userId,payload,source,occurredAt,correlationId,causationId});
    this.eventStore.push(event);
    this.auditStore.push(new AuditEvent({id:"domain-event-emitted:"+event.id,organizationId:event.organizationId,userId:principal.userId,
      action:"domain-event.emitted",entityType:event.entityType,entityId:event.entityId,newValue:{eventId:event.id,eventType:event.eventType,source:event.source}}));
    return event;
  }

  #memoryList({principal,entityType=null,entityId=null,eventType=null}={}) {
    this.#requirePrincipal(principal); this.#authorize(principal,ACTIONS.READ,principal.organizationId);
    return this.eventStore.filter(event=>event.organizationId===principal.organizationId)
      .filter(event=>!entityType||event.entityType===entityType).filter(event=>!entityId||event.entityId===entityId)
      .filter(event=>!eventType||event.eventType===eventType);
  }

  #authorize(principal,action,organizationId) { if(!this.authorize(principal,action,{organizationId})) throw new Error("Not authorized"); }
  #requirePrincipal(principal) { if(!principal?.userId||!principal?.organizationId) throw new Error("Trusted principal is required"); }
  static defaultAuthorize(principal,action,{organizationId}) {
    return principal.organizationId===organizationId && Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}
module.exports={DomainEventService,ACTIONS};