const { Notification, SEVERITIES } = require("../models/notification");
const { AuditEvent } = require("../models/auditEvent");
const crypto = require("node:crypto");

const ACTIONS = Object.freeze({ CREATE:"notification:create", READ:"notification:read", ACKNOWLEDGE:"notification:acknowledge", DISMISS:"notification:dismiss" });

class NotificationService {
  constructor({ notificationStore = new Map(), auditStore = [], authorize = NotificationService.defaultAuthorize,
    notificationRepository = null, auditRepository = null, transaction = null } = {}) {
    if (notificationRepository && !transaction) throw new Error("transaction is required with durable notification persistence");
    this.notificationStore=notificationStore; this.auditStore=auditStore; this.authorize=authorize;
    this.notificationRepository=notificationRepository; this.auditRepository=auditRepository; this.transaction=transaction;
  }

  create(args) {
    if(this.notificationRepository) return this.#createDurable(args);
    const { principal, ...input } = args;
    this.#requirePrincipal(principal);
    const notification = new Notification(input);
    this.#authorize(principal, ACTIONS.CREATE, { organizationId: notification.organizationId, recipientId: notification.recipientId });
    if (this.notificationStore.has(notification.id)) throw new Error("Notification ID already exists");
    if (notification.deliveryKey) {
      const existing = [...this.notificationStore.values()].find(candidate =>
        candidate.organizationId === notification.organizationId && candidate.deliveryKey === notification.deliveryKey
      );
      if (existing) return existing;
    }
    this.notificationStore.set(notification.id, notification);
    this.auditStore.push(new AuditEvent({ id:`notification-created:${notification.id}`, organizationId:notification.organizationId, userId:principal.userId, action:"notification.created", entityType:"notification", entityId:notification.id, newValue:{severity:notification.severity,recipientId:notification.recipientId,sourceEventId:notification.sourceEventId,sourceEventType:notification.sourceEventType,deliveryKey:notification.deliveryKey} }));
    return notification;
  }

  listForRecipient(args = {}) {
    if(this.notificationRepository) return this.#listDurable(args);
    const {principal,status}=args;
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, { organizationId:principal.organizationId, recipientId:principal.userId });
    return [...this.notificationStore.values()].filter(n=>n.organizationId===principal.organizationId).filter(n=>n.recipientId===principal.userId).filter(n=>!status||n.status===status).filter(n=>!n.isExpired()).sort((a,b)=>{ const order={critical:0,important:1,warning:2,information:3,success:4}; return (order[a.severity]-order[b.severity]) || (new Date(b.createdAt)-new Date(a.createdAt)); });
  }

  markRead({ principal, notificationId }) { if(this.notificationRepository) return this.#updateDurableStatus({principal,notificationId,status:"read",action:"notification.read",permission:ACTIONS.READ}); const n=this.#authorizedNotification(principal,ACTIONS.READ,notificationId); const previous=n.status; n.markRead(); this.#audit(n,principal.userId,"notification.read",previous,n.status); return n; }
  acknowledge({ principal, notificationId }) { if(this.notificationRepository) return this.#updateDurableStatus({principal,notificationId,status:"acknowledged",action:"notification.acknowledged",permission:ACTIONS.ACKNOWLEDGE}); const n=this.#authorizedNotification(principal,ACTIONS.ACKNOWLEDGE,notificationId); const previous=n.status; n.acknowledge(); this.#audit(n,principal.userId,"notification.acknowledged",previous,n.status); return n; }
  dismiss({ principal, notificationId }) { if(this.notificationRepository) return this.#updateDurableStatus({principal,notificationId,status:"dismissed",action:"notification.dismissed",permission:ACTIONS.DISMISS}); const n=this.#authorizedNotification(principal,ACTIONS.DISMISS,notificationId); const previous=n.status; n.dismiss(); this.#audit(n,principal.userId,"notification.dismissed",previous,n.status); return n; }

  async #createDurable({principal,...input}) {
    this.#requirePrincipal(principal);
    const notification=new Notification(input);
    this.#authorize(principal,ACTIONS.CREATE,{organizationId:notification.organizationId,recipientId:notification.recipientId});
    if(notification.organizationId!==principal.organizationId) throw new Error("Not authorized");
    return this.transaction(principal,"notification.create",async db=>{
      if(notification.deliveryKey) {
        const existing=await this.notificationRepository.findByDeliveryKey({principal,deliveryKey:notification.deliveryKey,db});
        if(existing) return existing;
      }
      const created=await this.notificationRepository.create({principal,notification,db});
      if(this.auditRepository) await this.auditRepository.create({principal,event:{
        id:"notification-created:"+created.id,organizationId:principal.organizationId,action:"notification.created",
        entityType:"notification",entityId:created.id,newValue:{severity:created.severity,recipientId:created.recipientId,
          sourceEventId:created.sourceEventId,sourceEventType:created.sourceEventType,deliveryKey:created.deliveryKey,
          templateId:created.templateId,templateVersion:created.templateVersion},source:"application"
      },db});
      return created;
    });
  }

  async #listDurable({principal,status=null}={}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal,ACTIONS.READ,{organizationId:principal.organizationId,recipientId:principal.userId});
    return this.transaction(principal,"notification.list",db=>this.notificationRepository.listForRecipient({principal,status,db}));
  }

  async #updateDurableStatus({principal,notificationId,status,action,permission}) {
    this.#requirePrincipal(principal);
    return this.transaction(principal,action,async db=>{
      const current=await this.notificationRepository.get({principal,notificationId,db});
      if(!current) throw new Error("Notification not found");
      this.#authorize(principal,permission,{organizationId:current.organizationId,recipientId:current.recipientId});
      const updated=await this.notificationRepository.updateStatus({principal,notificationId,status,db});
      if(this.auditRepository) await this.auditRepository.create({principal,event:{
        id:action+":"+updated.id+":"+crypto.randomUUID(),organizationId:principal.organizationId,action,
        entityType:"notification",entityId:updated.id,previousValue:{status:current.status},newValue:{status:updated.status},source:"application"
      },db});
      return updated;
    });
  }

  #authorizedNotification(principal, action, notificationId) {
    this.#requirePrincipal(principal);
    const notification=this.notificationStore.get(notificationId);
    if (!notification) throw new Error("Notification not found");
    this.#authorize(principal, action, { organizationId:notification.organizationId, recipientId:notification.recipientId });
    return notification;
  }
  #authorize(principal, action, context) { if (!this.authorize(principal,action,context)) throw new Error("Not authorized"); }
  #requirePrincipal(principal) { if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required"); }
  #audit(notification,userId,action,previousValue,newValue) { this.auditStore.push(new AuditEvent({id:`${action}:${notification.id}:${this.auditStore.length+1}`,organizationId:notification.organizationId,userId,action,entityType:"notification",entityId:notification.id,previousValue,newValue})); }

  static defaultAuthorize(principal, action, { organizationId, recipientId }) {
    if (principal.organizationId !== organizationId) return false;
    if (!Array.isArray(principal.permissions)) return false;
    if (action === ACTIONS.CREATE && principal.permissions.includes("notification:dispatch")) return true;
    if (!principal.permissions.includes(action)) return false;
    return principal.permissions.includes("notification:manage") || principal.userId === recipientId;
  }
}

module.exports = { NotificationService, SEVERITIES, ACTIONS };
