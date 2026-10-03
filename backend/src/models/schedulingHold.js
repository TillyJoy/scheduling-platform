class SchedulingHold {
  constructor({
    id,
    organizationId,
    schedulerId,
    clientId,
    propertyId,
    workOrderId = null,
    departmentId = null,
    zoneId = null,
    unitIds = [],
    serviceIds = [],
    memberIds = [],
    startTime,
    endTime,
    expiresAt,
    status = "active"
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!schedulerId) throw new Error("schedulerId is required");
    if (!clientId) throw new Error("clientId is required");
    if (!propertyId) throw new Error("propertyId is required");
    if (!Array.isArray(unitIds)) throw new Error("unitIds must be an array");
    if (!Array.isArray(serviceIds)) throw new Error("serviceIds must be an array");
    if (!Array.isArray(memberIds) || memberIds.length === 0) throw new Error("memberIds must not be empty");

    const start = new Date(startTime);
    const end = new Date(endTime);
    const expiry = new Date(expiresAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("endTime must be after startTime");
    }
    if (Number.isNaN(expiry.getTime())) throw new Error("expiresAt must be a valid date");

    this.id = id;
    this.organizationId = organizationId;
    this.schedulerId = schedulerId;
    this.clientId = clientId;
    this.propertyId = propertyId;
    this.workOrderId = workOrderId;
    this.departmentId = departmentId;
    this.zoneId = zoneId;
    this.unitIds = [...unitIds];
    this.serviceIds = [...serviceIds];
    this.memberIds = [...memberIds];
    this.resourceIds = [...memberIds];
    this.startTime = start;
    this.endTime = end;
    this.expiresAt = expiry;
    this.status = status;
  }
}

module.exports = { SchedulingHold };
