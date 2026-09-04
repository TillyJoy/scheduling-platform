const { Notification, SEVERITIES } = require("../models/notification");
const { AuditEvent } = require("../models/auditEvent");

class NotificationService {
  constructor({ notificationStore = new Map(), auditStore = [] } = {}) {
    this.notificationStore = notificationStore;
    this.auditStore = auditStore;
  }

  create({ actorUserId = null, ...input }) {
    const notification = new Notification(input);
    this.notificationStore.set(notification.id, notification);
    this.auditStore.push(
      new AuditEvent({
        id: `notification-created:${notification.id}`,
        organizationId: notification.organizationId,
        userId: actorUserId,
        action: "notification.created",
        entityType: "notification",
        entityId: notification.id,
        newValue: {
          severity: notification.severity,
          recipientId: notification.recipientId,
          sourceEventType: notification.sourceEventType
        }
      })
    );
    return notification;
  }

  listForRecipient({ organizationId, recipientId, status } = {}) {
    return [...this.notificationStore.values()]
      .filter((notification) => notification.organizationId === organizationId)
      .filter((notification) => notification.recipientId === recipientId)
      .filter((notification) => !status || notification.status === status)
      .filter((notification) => !notification.isExpired())
      .sort((a, b) => {
        const severityOrder = { critical: 0, important: 1, warning: 2, information: 3, success: 4 };
        return (severityOrder[a.severity] - severityOrder[b.severity]) ||
          (new Date(b.createdAt) - new Date(a.createdAt));
      });
  }

  markRead({ organizationId, recipientId, notificationId, actorUserId = recipientId }) {
    const notification = this.#authorizedNotification(organizationId, recipientId, notificationId);
    const previousStatus = notification.status;
    notification.markRead();
    this.#audit(notification, actorUserId, "notification.read", previousStatus, notification.status);
    return notification;
  }

  acknowledge({ organizationId, recipientId, notificationId, actorUserId = recipientId }) {
    const notification = this.#authorizedNotification(organizationId, recipientId, notificationId);
    const previousStatus = notification.status;
    notification.acknowledge();
    this.#audit(notification, actorUserId, "notification.acknowledged", previousStatus, notification.status);
    return notification;
  }

  dismiss({ organizationId, recipientId, notificationId, actorUserId = recipientId }) {
    const notification = this.#authorizedNotification(organizationId, recipientId, notificationId);
    const previousStatus = notification.status;
    notification.dismiss();
    this.#audit(notification, actorUserId, "notification.dismissed", previousStatus, notification.status);
    return notification;
  }

  #authorizedNotification(organizationId, recipientId, notificationId) {
    const notification = this.notificationStore.get(notificationId);
    if (!notification || notification.organizationId !== organizationId || notification.recipientId !== recipientId) {
      throw new Error("Notification not found");
    }
    return notification;
  }

  #audit(notification, userId, action, previousValue, newValue) {
    this.auditStore.push(
      new AuditEvent({
        id: `${action}:${notification.id}:${this.auditStore.length + 1}`,
        organizationId: notification.organizationId,
        userId,
        action,
        entityType: "notification",
        entityId: notification.id,
        previousValue,
        newValue
      })
    );
  }
}

module.exports = { NotificationService, SEVERITIES };
