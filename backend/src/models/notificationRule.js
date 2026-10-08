const CHANNELS = Object.freeze(["in_app","email","sms"]);
const STATUSES = Object.freeze(["draft","published","inactive","archived"]);

function normalizeTemplateRefs({ templateRefs, templateIds }) {
  const refs = templateRefs ?? (templateIds || []).map(templateId => ({ templateId, version: null }));
  if (!Array.isArray(refs) || refs.length === 0) throw new Error("templateRefs must contain at least one template reference");
  const seen = new Set();
  return refs.map(ref => {
    if (!ref || typeof ref.templateId !== "string" || !ref.templateId.trim()) throw new Error("template reference requires templateId");
    if (ref.version !== null && ref.version !== undefined && (!Number.isInteger(ref.version) || ref.version < 1)) throw new Error("template reference version must be a positive integer");
    const key = ref.templateId + ":" + (ref.version ?? "latest");
    if (seen.has(key)) throw new Error("Duplicate notification template reference");
    seen.add(key);
    return Object.freeze({ templateId:ref.templateId, version:ref.version ?? null });
  });
}

class NotificationRule {
  constructor({ id, organizationId, name, eventType, conditions = {}, recipientRules = [], templateIds = [], templateRefs = null, allowedChannels = ["in_app"], timing = { mode: "immediate" }, required = false, priority = "normal", enabled = true, status = "draft", createdAt = new Date(), updatedAt = createdAt, publishedAt = null, archivedAt = null }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!name) throw new Error("name is required");
    if (!eventType) throw new Error("eventType is required");
    if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) throw new Error("conditions must be an object");
    if (!Array.isArray(recipientRules) || recipientRules.length === 0) throw new Error("recipientRules must contain at least one rule");
    if (!Array.isArray(allowedChannels) || !allowedChannels.every(channel => CHANNELS.includes(channel))) throw new Error("Invalid notification rule channel");
    if (!timing || typeof timing !== "object" || Array.isArray(timing) || !timing.mode) throw new Error("timing.mode is required");
    if (!STATUSES.includes(status)) throw new Error("Invalid notification rule status");
    const refs = normalizeTemplateRefs({ templateRefs, templateIds });
    this.id=id; this.organizationId=organizationId; this.name=name; this.eventType=eventType;
    this.conditions=Object.freeze({...conditions});
    this.recipientRules=Object.freeze(recipientRules.map(x => x && typeof x === "object" ? Object.freeze({...x}) : x));
    this.templateRefs=Object.freeze(refs);
    this.templateIds=Object.freeze(refs.map(ref => ref.templateId));
    this.allowedChannels=Object.freeze([...allowedChannels]); this.timing=Object.freeze({...timing});
    this.required=Boolean(required); this.priority=priority; this.enabled=Boolean(enabled); this.status=status;
    this.createdAt=createdAt; this.updatedAt=updatedAt; this.publishedAt=publishedAt; this.archivedAt=archivedAt;
  }
}
module.exports = { NotificationRule, CHANNELS, STATUSES, normalizeTemplateRefs };
