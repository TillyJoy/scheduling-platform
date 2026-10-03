class Availability {
  constructor({
    id,
    organizationId = null,
    resourceId,
    startTime,
    endTime,
    zoneId = null,
    available = true
  }) {
    if (!id) throw new Error("id is required");
    if (!resourceId) throw new Error("resourceId is required");
    if (!startTime || !endTime) throw new Error("startTime and endTime are required");

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("startTime and endTime must be valid dates");
    }
    if (end <= start) throw new Error("endTime must be after startTime");

    this.id = id;
    this.organizationId = organizationId;
    this.resourceId = resourceId;
    this.startTime = start;
    this.endTime = end;
    this.zoneId = zoneId;
    this.available = available !== false;
  }
}

module.exports = { Availability };
