const CHANNELS = Object.freeze(["in_app","email","sms"]);
const STATUSES = Object.freeze(["draft","published","inactive","archived"]);

class NotificationRule {
  constructor({ id, organizationId, name, eventType, conditions = {}, recipientRules = [], templateIds = [], allowedChannels = ["in_app"], timing = { mode: "immediate" }, required = false, priority = "normal", enabled = true, status = "draft", createdAt = new Date(), updatedAt = createdAt, publishedAt = null }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!name) throw new Error("name is required");
    if (!eventType) throw new Error("eventType is required");
    if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) throw new Error("conditions must be an object");
    if (!Array.isArray(recipientRules) || recipientRules.length === 0) throw new Error("recipientRules must contain at least one rule");
    if (!Array.isArray(templateIds) || templateIds.length === 0) throw new Error("templateIds must contain at least one template");
    if (!allowedChannels.every(channel => CHANNELS.includes(channel))) throw new Error("Invalid notification rule channel");
    if (!timing || typeof timing !== "object" || Array.isArray(timing) || !timing.mode) throw new Error("timing.mode is required");
    if (!STATUSES.includes(status)) throw new Error("Invalid notification rule status");
    this.id=id; this.organizationId=organizationId; this.name=name; this.eventType=eventType; this.conditions=Object.freeze({...conditions});
    this.recipientRules=Object.freeze([...recipientRules]); this.templateIds=Object.freeze([...templateIds]); this.allowedChannels=Object.freeze([...allowedChannels]);
    this.timing=Object.freeze({...timing}); this.required=Boolean(required); this.priority=priority; this.enabled=Boolean(enabled); this.status=status;
    this.createdAt=createdAt; this.updatedAt=updatedAt; this.publishedAt=publishedAt;
  }
}
module.exports = { NotificationRule, CHANNELS, STATUSES };
