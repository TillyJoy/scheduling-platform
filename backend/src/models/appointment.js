class Appointment {
  constructor({
    id,
    organizationId,
    clientId,
    propertyId,
    unitIds = [],
    serviceIds = [],
    teamId = null,
    memberIds = [],
    startTime,
    endTime,
    status = "scheduled"
  }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!clientId) throw new Error("clientId is required");
    if (!propertyId) throw new Error("propertyId is required");
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
    this.unitIds = [...unitIds];
    this.serviceIds = [...serviceIds];
    this.teamId = teamId;
    this.memberIds = [...memberIds];
    this.startTime = start;
    this.endTime = end;
    this.status = status;
  }
}

module.exports = { Appointment };
