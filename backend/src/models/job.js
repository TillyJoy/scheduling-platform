class Job {
  constructor({
    id,
    organizationId,
    title,
    description = "",
    clientId = null,
    serviceIds = [],
    statusCode = null,
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!title) throw new Error("title is required");
    if (!Array.isArray(serviceIds)) throw new Error("serviceIds must be an array");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.title = title;
    this.description = description;
    this.clientId = clientId;
    this.serviceIds = [...serviceIds];
    this.statusCode = statusCode;
    this.metadata = { ...metadata };
  }
}

module.exports = { Job };
