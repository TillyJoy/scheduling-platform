const CHANNELS = Object.freeze(["in_app","email","sms"]);
const STATUSES = Object.freeze(["draft","published","inactive","archived"]);

class NotificationTemplate {
  constructor({ id, organizationId, name, channel = "in_app", subject = null, body, variables = [], version = 1, status = "draft", createdAt = new Date(), updatedAt = createdAt, publishedAt = null }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!name) throw new Error("name is required");
    if (!CHANNELS.includes(channel)) throw new Error("Invalid notification template channel");
    if (!body) throw new Error("body is required");
    if (!Number.isInteger(version) || version < 1) throw new Error("version must be a positive integer");
    if (!STATUSES.includes(status)) throw new Error("Invalid notification template status");
    if (!Array.isArray(variables)) throw new Error("variables must be an array");
    this.id=id; this.organizationId=organizationId; this.name=name; this.channel=channel; this.subject=subject; this.body=body;
    this.variables=Object.freeze([...variables]); this.version=version; this.status=status; this.createdAt=createdAt; this.updatedAt=updatedAt; this.publishedAt=publishedAt;
  }
}
module.exports = { NotificationTemplate, CHANNELS, STATUSES };
