class ActualWork {
  constructor({
    id,
    organizationId,
    fieldVisitId,
    workOrderId,
    resourceId = null,
    description,
    actualStartTime = null,
    actualEndTime = null,
    quantity = null,
    unit = null,
    metadata = {}
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!fieldVisitId) throw new Error("fieldVisitId is required");
    if (!workOrderId) throw new Error("workOrderId is required");
    if (!description) throw new Error("description is required");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      throw new Error("quantity must be a non-negative number");
    }
    if (actualStartTime === null && actualEndTime !== null || actualStartTime !== null && actualEndTime === null) {
      throw new Error("actualStartTime and actualEndTime must be provided together");
    }

    const start = actualStartTime === null ? null : new Date(actualStartTime);
    const end = actualEndTime === null ? null : new Date(actualEndTime);
    if (start && Number.isNaN(start.getTime())) throw new Error("actualStartTime must be a valid date");
    if (end && Number.isNaN(end.getTime())) throw new Error("actualEndTime must be a valid date");
    if (start && end && end <= start) throw new Error("actualEndTime must be after actualStartTime");

    this.id = id;
    this.organizationId = organizationId;
    this.fieldVisitId = fieldVisitId;
    this.workOrderId = workOrderId;
    this.resourceId = resourceId;
    this.description = description;
    this.actualStartTime = start;
    this.actualEndTime = end;
    this.quantity = quantity;
    this.unit = unit;
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { ActualWork };
