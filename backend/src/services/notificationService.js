const { Notification, SEVERITIES } = require("../models/notification");
const { AuditEvent } = require("../models/auditEvent");

const ACTIONS = Object.freeze({
  CREATE:"notification:create",
  READ:"notification:read",
  ACKNOWLEDGE:"notification:acknowledge",
  DISMISS:"notification:dismiss"
});

class NotificationService {
  constructor({
    notificationStore = new Map(),
    auditStore = [],
    notificationRepository = null,
    transaction = null,
    authorize = NotificationService.defaultAuthorize
  } = {}) {
    if (notificationRepository && !transaction) throw new Error("transaction is required with notificationRepository");
    this.notificationStore=notificationStore;
    this.auditStore=auditStore;
    this.notificationRepository=notificationRepository;
    this.transaction=transaction;
    this.authorize=authorize;
  }

  create(args = {}) {
    return this.notificationRepository
      ? this.createWithResult(args).then(result => result.notification)
      : this.#memoryCreateWithResult(args).notification;
  }

  createWithResult({ principal, ...input }) {
    return this.notificationRepository
      ? this.#durableCreate({ principal, ...input })
      : this.#memoryCreateWithResult({ principal, ...input });
  }

  listForRecipient(args = {}) {
    return this.notificationRepository ? this.#durableListForRecipient(args) : this.#memoryListForRecipient(args);
  }

  markRead(args = {}) {
    return this.notificationRepository ? this.#durableStatus("read", args) : this.#memoryStatus("read", args);
  }
  acknowledge(args = {}) {
    return this.notificationRepository ? this.#durableStatus("acknowledged", args) : this.#memoryStatus("acknowledged", args);
  }
  dismiss(args = {}) {
    return this.notificationRepository ? this.#durableStatus("dismissed", args) : this.#memoryStatus("dismissed", args);
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const notification = new Notification(input);
    this.#authorize(principal, ACTIONS.CREATE, {
      organizationId: notification.organizationId,
      recipientId: notification.recipientId
    });
    return this.transaction(principal, "notification.create", async db => {
      const existing = await this.notificationRepository.findByDeliveryKey({
        principal, deliveryKey: notification.deliveryKey, db
      });
      if (existing) return { notification: existing, created: false };
      try {
        const saved = await this.notificationRepository.create({ principal, notification, db });
        await this.#auditDurable(principal, saved, db, "notification.created", null, saved);
        return { notification: saved, created: true };
      } catch (error) {
        if (error.code !== "23505" || !notification.deliveryKey) throw error;
        const raced = await this.notificationRepository.findByDeliveryKey({
          principal, deliveryKey: notification.deliveryKey, db
        });
        if (raced) return { notification: raced, created: false };
        throw error;
      }
    });
  }

  async #durableListForRecipient({ principal, status = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, {
      organizationId: principal.organizationId, recipientId: principal.userId
    });
    return this.transaction(principal, "notification.list", db =>
      this.notificationRepository.listForRecipient({ principal, status, db })
    );
  }

  async #durableStatus(status, { principal, notificationId }) {
    this.#requirePrincipal(principal);
    const action = status === "read" ? ACTIONS.READ : status === "acknowledged" ? ACTIONS.ACKNOWLEDGE : ACTIONS.DISMISS;
    const existing = await this.transaction(principal, "notification.read", db =>
      this.notificationRepository.get({ principal, notificationId, db })
    );
    if (!existing) throw new Error("Notification not found");
    this.#authorize(principal, action, {
      organizationId: existing.organizationId, recipientId: existing.recipientId
    });
    return this.transaction(principal, "notification." + status, async db => {
      const current = await this.notificationRepository.get({ principal, notificationId, db });
      if (!current) throw new Error("Notification not found");
      const now = new Date();
      if (status === "acknowledged" && !current.requiresAcknowledgement) {
        throw new Error("Notification does not require acknowledgement");
      }
      const nextStatus = status === "read" ? "read" : status;
      const saved = await this.notificationRepository.updateStatus({
        principal, notificationId, status: nextStatus,
        timestamp: status === "acknowledged" ? now : status === "dismissed" ? now : null, db
      });
      await this.#auditDurable(principal, saved, db, "notification." + status, current.status, saved.status);
      return saved;
    });
  }

  #memoryCreateWithResult({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const notification = new Notification(input);
    this.#authorize(principal, ACTIONS.CREATE, {
      organizationId: notification.organizationId, recipientId: notification.recipientId
    });
    if (this.notificationStore.has(notification.id)) throw new Error("Notification ID already exists");
    if (notification.deliveryKey) {
      const existing = [...this.notificationStore.values()].find(candidate =>
        candidate.organizationId === notification.organizationId && candidate.deliveryKey === notification.deliveryKey
      );
      if (existing) return { notification: existing, created: false };
    }
    this.notificationStore.set(notification.id, notification);
    this.auditStore.push(new AuditEvent({
      id:"notification-created:"+notification.id, organizationId:notification.organizationId, userId:principal.userId,
      action:"notification.created", entityType:"notification", entityId:notification.id,
      newValue:{
        severity:notification.severity, recipientId:notification.recipientId,
        sourceEventId:notification.sourceEventId, sourceEventType:notification.sourceEventType,
        deliveryKey:notification.deliveryKey
      }
    }));
    return { notification, created: true };
  }

  #memoryListForRecipient({ principal, status } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, ACTIONS.READ, {
      organizationId:principal.organizationId, recipientId:principal.userId
    });
    return [...this.notificationStore.values()]
      .filter(n=>n.organizationId===principal.organizationId)
      .filter(n=>n.recipientId===principal.userId)
      .filter(n=>!status||n.status===status)
      .filter(n=>!n.isExpired())
      .sort((a,b)=>{
        const order={critical:0,important:1,warning:2,information:3,success:4};
        return (order[a.severity]-order[b.severity]) || (new Date(b.createdAt)-new Date(a.createdAt));
      });
  }

  #memoryStatus(status, { principal, notificationId }) {
    const action=status==="read"?ACTIONS.READ:status==="acknowledged"?ACTIONS.ACKNOWLEDGE:ACTIONS.DISMISS;
    const notification=this.#authorizedMemoryNotification(principal,action,notificationId);
    const previous=notification.status;
    if (status==="acknowledged") notification.acknowledge();
    else if (status==="dismissed") notification.dismiss();
    else notification.markRead();
    this.#auditMemory(notification,principal.userId,"notification."+status,previous,notification.status);
    return notification;
  }

  #authorizedMemoryNotification(principal, action, notificationId) {
    this.#requirePrincipal(principal);
    const notification=this.notificationStore.get(notificationId);
    if (!notification) throw new Error("Notification not found");
    this.#authorize(principal, action, {
      organizationId:notification.organizationId, recipientId:notification.recipientId
    });
    return notification;
  }

  #auditMemory(notification,userId,action,previousValue,newValue) {
    this.auditStore.push(new AuditEvent({
      id:action+":"+notification.id+":"+this.auditStore.length,
      organizationId:notification.organizationId,userId,action,
      entityType:"notification",entityId:notification.id,previousValue,newValue
    }));
  }

  async #auditDurable(principal, notification, db, action, previousValue, newValue) {
    await db.query(
      `INSERT INTO audit_events
       (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'notification',$4,$5::jsonb,$6::jsonb,'application',now())`,
      [principal.organizationId,principal.userId,action,notification.id,
       previousValue === null ? null : JSON.stringify(previousValue),JSON.stringify(newValue)]
    );
  }

  #authorize(principal, action, context) {
    if (!this.authorize(principal,action,context)) throw new Error("Not authorized");
  }
  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
  static defaultAuthorize(principal, action, { organizationId, recipientId }) {
    if (principal.organizationId!==organizationId) return false;
    if (!Array.isArray(principal.permissions)) return false;
    if (action===ACTIONS.CREATE && principal.permissions.includes("notification:dispatch")) return true;
    if (!principal.permissions.includes(action)) return false;
    return principal.permissions.includes("notification:manage") || principal.userId===recipientId;
  }
}
module.exports={NotificationService,SEVERITIES,ACTIONS};