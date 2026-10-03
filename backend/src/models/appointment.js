class Appointment {
  constructor({
    id,
    organizationId,
    clientId,
    propertyId,
    workOrderId = null,
    departmentId = null,
    zoneId = null,
    unitIds = [],
    serviceIds = [],
    teamId = null,
    memberIds = [],
    startTime,
    endTime,
    status = "scheduled",
    schedulerId = null,
    clientSchedulingIndicator = false,
    internalNotes = "",
    cancellationReason = null,
    rescheduleReason = null
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!clientId) throw new Error("clientId is required");
    if (!propertyId) throw new Error("propertyId is required");
    if (!Array.isArray(unitIds)) throw new Error("unitIds must be an array");
    if (!Array.isArray(serviceIds)) throw new Error("serviceIds must be an array");
    if (!Array.isArray(memberIds)) throw new Error("memberIds must be an array");
    if (new Set(unitIds).size !== unitIds.length) throw new Error("unitIds must not contain duplicates");
    if (new Set(serviceIds).size !== serviceIds.length) throw new Error("serviceIds must not contain duplicates");
    if (new Set(memberIds).size !== memberIds.length) throw new Error("memberIds must not contain duplicates");
    if (!startTime || !endTime) throw new Error("startTime and endTime are required");

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("endTime must be after startTime");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.clientId = clientId;
    this.propertyId = propertyId;
    this.workOrderId = workOrderId;
    this.departmentId = departmentId;
    this.zoneId = zoneId;
    this.unitIds = [...unitIds];
    this.serviceIds = [...serviceIds];
    this.teamId = teamId;
    this.memberIds = [...memberIds];
    this.startTime = start;
    this.endTime = end;
    this.status = status;
    this.schedulerId = schedulerId;
    this.clientSchedulingIndicator = Boolean(clientSchedulingIndicator);
    this.internalNotes = internalNotes ?? "";
    this.cancellationReason = cancellationReason;
    this.rescheduleReason = rescheduleReason;
  }
}

module.exports = { Appointment };
