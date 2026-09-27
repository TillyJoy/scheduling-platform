class FieldVisit {
  constructor({
    id,
    organizationId,
    appointmentId,
    workOrderId,
    statusCode = null,
    resourceIds = [],
    actualStartTime = null,
    actualEndTime = null,
    completedAt = null,
    completedByUserId = null,
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!appointmentId) throw new Error("appointmentId is required");
    if (!workOrderId) throw new Error("workOrderId is required");
    if (!Array.isArray(resourceIds)) throw new Error("resourceIds must be an array");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    const start = actualStartTime === null ? null : new Date(actualStartTime);
    const end = actualEndTime === null ? null : new Date(actualEndTime);
    const completed = completedAt === null ? null : new Date(completedAt);

    if (start && Number.isNaN(start.getTime())) throw new Error("actualStartTime must be a valid date");
    if (end && Number.isNaN(end.getTime())) throw new Error("actualEndTime must be a valid date");
    if (completed && Number.isNaN(completed.getTime())) throw new Error("completedAt must be a valid date");
    if (start && end && end <= start) throw new Error("actualEndTime must be after actualStartTime");
    if (completed && !completedByUserId) throw new Error("completedByUserId is required when completedAt is set");

    this.id = id;
    this.organizationId = organizationId;
    this.appointmentId = appointmentId;
    this.workOrderId = workOrderId;
    this.statusCode = statusCode;
    this.resourceIds = [...resourceIds];
    this.actualStartTime = start;
    this.actualEndTime = end;
    this.completedAt = completed;
    this.completedByUserId = completedByUserId;
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { FieldVisit };
