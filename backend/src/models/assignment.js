class Assignment {
  constructor({
    id,
    organizationId,
    resourceId,
    jobId = null,
    workOrderId = null,
    startTime,
    endTime,
    statusCode = null,
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!resourceId) throw new Error("resourceId is required");
    if (!jobId && !workOrderId) throw new Error("jobId or workOrderId is required");
    if (!startTime || !endTime) throw new Error("startTime and endTime are required");

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("endTime must be after startTime");
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.resourceId = resourceId;
    this.jobId = jobId;
    this.workOrderId = workOrderId;
    this.startTime = start;
    this.endTime = end;
    this.statusCode = statusCode;
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { Assignment };
