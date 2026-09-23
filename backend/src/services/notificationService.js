const { Notification, SEVERITIES } = require("../models/notification");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({ CREATE:"notification:create", READ:"notification:read", ACKNOWLEDGE:"notification:acknowledge", DISMISS:"notification:dismiss" });

class NotificationService {
  constructor({ notificationStore = new Map(), auditStore = [], authorize = NotificationService.defaultAuthorize } = {}) { this.notificationStore=notificationStore; this.auditStore=auditStore; this.authorize=authorize; }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const notification = new Notification(input);
    this.#authorize(principal, ACTIONS.CREATE, { organizationId: notification.organizationId, recipientId: notification.recipientId });
    if (this.notificationStore.has(notification.id)) throw new Error("Notification ID already exists");
    this.notificationStore.set(notification.id, notification);
    this.auditStore.push(new AuditEvent({ id:`notification-created:${notification.id}`, organizationId:notification.organizationId, userId:principal.userId, action:"notification.created", entityType:"notification", entityId:notification.id, newValue:{severity:notification.severity,recipientId:notification.recipientId,sourceEventType:notification.sourceEventType} }));
    return notification;
  }

  listForRecipient({ principal, status } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, { organizationId:principal.organizationId, recipientId:principal.userId });
    return [...this.notificationStore.values()].filter(n=>n.organizationId===principal.organizationId).filter(n=>n.recipientId===principal.userId).filter(n=>!status||n.status===status).filter(n=>!n.isExpired()).sort((a,b)=>{ const order={critical:0,important:1,warning:2,information:3,success:4}; return (order[a.severity]-order[b.severity]) || (new Date(b.createdAt)-new Date(a.createdAt)); });
  }

  markRead({ principal, notificationId }) { const n=this.#authorizedNotification(principal,ACTIONS.READ,notificationId); const previous=n.status; n.markRead(); this.#audit(n,principal.userId,"notification.read",previous,n.status); return n; }
  acknowledge({ principal, notificationId }) { const n=this.#authorizedNotification(principal,ACTIONS.ACKNOWLEDGE,notificationId); const previous=n.status; n.acknowledge(); this.#audit(n,principal.userId,"notification.acknowledged",previous,n.status); return n; }
  dismiss({ principal, notificationId }) { const n=this.#authorizedNotification(principal,ACTIONS.DISMISS,notificationId); const previous=n.status; n.dismiss(); this.#audit(n,principal.userId,"notification.dismissed",previous,n.status); return n; }

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
