const STATUS_CATEGORIES = Object.freeze(["active", "pending", "completed", "cancelled", "exception"]);

class StatusDefinition {
  constructor({
    id, organizationId, entityType, code, label, category = "active",
    description = null, color = null, icon = null, sortOrder = 0,
    initial = false, terminal = false, metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!entityType) throw new Error("entityType is required");
    if (!code) throw new Error("code is required");
    if (!label) throw new Error("label is required");
    if (!STATUS_CATEGORIES.includes(category)) throw new Error("Invalid status category");
    if (!Number.isInteger(sortOrder)) throw new Error("sortOrder must be an integer");
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }
    this.id = id;
    this.organizationId = organizationId;
    this.entityType = entityType;
    this.code = code;
    this.label = label;
    this.category = category;
    this.description = description;
    this.color = color;
    this.icon = icon;
    this.sortOrder = sortOrder;
    this.initial = Boolean(initial);
    this.terminal = Boolean(terminal);
    this.metadata = { ...metadata };
  }
}

module.exports = { StatusDefinition, STATUS_CATEGORIES };
