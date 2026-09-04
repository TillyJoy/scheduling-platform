class Appointment {
  constructor({
    id,
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
    this.id = id;
    this.clientId = clientId;
    this.propertyId = propertyId;
    this.unitIds = unitIds;
    this.serviceIds = serviceIds;
    this.teamId = teamId;
    this.memberIds = memberIds;
    this.startTime = startTime;
    this.endTime = endTime;
    this.status = status;
  }
}

module.exports = { Appointment };
