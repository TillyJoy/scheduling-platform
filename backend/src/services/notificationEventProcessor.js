const crypto = require("node:crypto");

const SUPPORTED_RECIPIENT_RULES = Object.freeze(["actor", "event_payload", "static_user"]);

class NotificationEventProcessor {
  constructor({
    ruleStore = new Map(),
    templateStore = new Map(),
    notificationService,
    recipientResolver = NotificationEventProcessor.defaultRecipientResolver,
    deliverySink = null,
    authorize = NotificationEventProcessor.defaultAuthorize
  } = {}) {
    if (!notificationService) throw new Error("notificationService is required");
    this.ruleStore = ruleStore;
    this.templateStore = templateStore;
    this.notificationService = notificationService;
    this.recipientResolver = recipientResolver;
    this.deliverySink = deliverySink;
    this.authorize = authorize;
  }

  process({ principal, event } = {}) {
    this.#requirePrincipal(principal);
    if (!event?.id || !event.organizationId || !event.eventType) throw new Error("Domain event is required");
    if (event.organizationId !== principal.organizationId) throw new Error("Not authorized");
    this.#authorize(principal, principal.organizationId);

    const rules = [...this.ruleStore.values()]
      .filter(rule => rule.organizationId === event.organizationId)
      .filter(rule => rule.eventType === event.eventType)
      .filter(rule => rule.status === "published" && rule.enabled)
      .filter(rule => this.#matchesConditions(rule.conditions, event));

    const results = [];
    for (const rule of rules) {
      const recipients = this.#resolveRecipients(rule, event);
      if (recipients.length === 0) throw new Error("No recipientId could be resolved for notification rule");

      const templates = rule.templateIds
        .map(id => this.templateStore.get(id))
        .filter(template => template && template.organizationId === event.organizationId && template.status === "published");

      for (const recipientId of recipients) {
        for (const template of templates) {
          if (!rule.allowedChannels.includes(template.channel)) continue;
          const rendered = this.#renderTemplate(template, event);
          const result = {
            id: crypto.randomUUID(),
            ruleId: rule.id,
            eventId: event.id,
            recipientId,
            channel: template.channel,
            status: "queued"
          };

          if (template.channel === "in_app") {
            const notification = this.notificationService.create({
              principal,
              id: result.id,
              organizationId: event.organizationId,
              recipientId,
              severity: rule.priority === "critical" ? "critical" : rule.priority === "high" ? "important" : "information",
              title: rendered.subject || template.name,
              message: rendered.body,
              type: "event",
              relatedEntityType: event.entityType,
              relatedEntityId: event.entityId,
              sourceEventType: event.eventType,
              requiresAcknowledgement: rule.required
            });
            result.status = "created";
            result.notificationId = notification.id;
          } else if (this.deliverySink) {
            this.deliverySink({ ...result, organizationId: event.organizationId, subject: rendered.subject, body: rendered.body, event });
            result.status = "handed_off";
          } else {
            result.status = "delivery_pending";
          }

          results.push(result);
        }
      }
    }
    return results;
  }

  #resolveRecipients(rule, event) {
    const ids = new Set();
    for (const recipientRule of rule.recipientRules) {
      const resolved = this.recipientResolver(recipientRule, event);
      for (const id of Array.isArray(resolved) ? resolved : [resolved]) {
        if (id) ids.add(id);
      }
    }
    return [...ids];
  }

  #renderTemplate(template, event) {
    const variables = new Set(template.variables);
    const context = {
      eventId: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      source: event.source,
      occurredAt: event.occurredAt,
      actorUserId: event.actorUserId,
      ...event.payload
    };

    const render = value => String(value).replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (match, name) => {
      if (!variables.has(name)) return match;
      const resolved = NotificationEventProcessor.getPath(context, name);
      return resolved === undefined || resolved === null ? "" : String(resolved);
    });

    return { subject: template.subject ? render(template.subject) : null, body: render(template.body) };
  }

  #matchesConditions(conditions, event) {
    return Object.entries(conditions || {}).every(([path, expected]) => {
      return NotificationEventProcessor.getPath({ ...event, ...event.payload }, path) === expected;
    });
  }

  #authorize(principal, organizationId) {
    if (!this.authorize(principal, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static getPath(object, path) {
    return String(path).split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  }

  static defaultRecipientResolver(rule, event) {
    if (!SUPPORTED_RECIPIENT_RULES.includes(rule?.type)) throw new Error("Unsupported recipient rule");
    if (rule.type === "actor") return event.actorUserId;
    if (rule.type === "event_payload") return NotificationEventProcessor.getPath(event.payload || {}, rule.path);
    if (rule.type === "static_user") return rule.userId;
  }

  static defaultAuthorize(principal, organizationId) {
    return principal.organizationId === organizationId
      && Array.isArray(principal.permissions)
      && principal.permissions.includes("notification:dispatch");
  }
}

module.exports = { NotificationEventProcessor, SUPPORTED_RECIPIENT_RULES };
