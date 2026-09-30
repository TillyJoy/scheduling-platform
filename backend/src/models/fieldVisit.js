class FieldVisit {
  constructor({
    id,
    organizationId,
    appointmentId,
    workOrderId,
    statusCode = null,
    resourceIds = [],
    arrivedAt = null,
    actualStartTime = null,
    actualEndTime = null,
    completedAt = null,
    completedByUserId = null,
    closedAt = null,
    closedByUserId = null,
    outcomeCode = null,
    outcomeReason = null,
    notes = "",
    observations = [],
    completionData = {},
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");\n    if (!Number.isInteger(version) || version < 1) throw new Error("version must be a positive integer");
    if (!organizationId) throw new Error("organizationId is required");
    if (!appointmentId) throw new Error("appointmentId is required");
    if (!workOrderId) throw new Error("workOrderId is required");
    if (!Array.isArray(resourceIds)) throw new Error("resourceIds must be an array");
    if (!Array.isArray(observations)) throw new Error("observations must be an array");
    if (!completionData || typeof completionData !== "object" || Array.isArray(completionData)) {
      throw new Error("completionData must be an object");
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    const arrival = arrivedAt === null ? null : new Date(arrivedAt);
    const start = actualStartTime === null ? null : new Date(actualStartTime);
    const end = actualEndTime === null ? null : new Date(actualEndTime);
    const completed = completedAt === null ? null : new Date(completedAt);
    const closed = closedAt === null ? null : new Date(closedAt);

    for (const [name, value] of [["arrivedAt", arrival], ["actualStartTime", start], ["actualEndTime", end], ["completedAt", completed], ["closedAt", closed]]) {
      if (value && Number.isNaN(value.getTime())) throw new Error(`${name} must be a valid date`);
    }
    if (start && arrival && start < arrival) throw new Error("actualStartTime cannot be before arrivedAt");
    if (start && end && end <= start) throw new Error("actualEndTime must be after actualStartTime");
    if (completed && !completedByUserId) throw new Error("completedByUserId is required when completedAt is set");
    if (closed && !closedByUserId) throw new Error("closedByUserId is required when closedAt is set");
    if (closed && completed) throw new Error("A completed field visit cannot also be closed as incomplete");
    if (!observations.every(item => item && typeof item === "object" && !Array.isArray(item))) {
      throw new Error("observations must contain objects");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.appointmentId = appointmentId;
    this.workOrderId = workOrderId;
    this.statusCode = statusCode;
    this.resourceIds = [...new Set(resourceIds)];
    this.arrivedAt = arrival;
    this.actualStartTime = start;
    this.actualEndTime = end;
    this.completedAt = completed;
    this.completedByUserId = completedByUserId;
    this.closedAt = closed;
    this.closedByUserId = closedByUserId;
    this.outcomeCode = outcomeCode;
    this.outcomeReason = outcomeReason;
    this.notes = notes;
    this.observations = structuredClone(observations);
    this.completionData = structuredClone(completionData);
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { FieldVisit };