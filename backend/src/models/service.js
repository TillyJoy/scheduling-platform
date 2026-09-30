class Service {
  constructor({
    id,
    organizationId,
    name,
    description = "",
    durationMinutes = null,
    active = true
  }) {
    if (!organizationId) throw new Error("organizationId is required");

    this.id = id;
    this.organizationId = organizationId;
    this.name = name;
    this.description = description;
    this.durationMinutes = durationMinutes;
    this.active = active;
  }
}

module.exports = { Service };
