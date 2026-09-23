class WorkOrder {
  constructor({
    id,
    organizationId,
    jobId,
    number,
    title = "",
    statusCode = null,
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!jobId) throw new Error("jobId is required");
    if (!number) throw new Error("number is required");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.jobId = jobId;
    this.number = number;
    this.title = title;
    this.statusCode = statusCode;
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { WorkOrder };
