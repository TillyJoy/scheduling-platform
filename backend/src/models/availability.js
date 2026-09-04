class Availability {
  constructor({
    id,
    resourceId,
    startTime,
    endTime,
    zoneId = null,
    available = true
  }) {
    this.id = id;
    this.resourceId = resourceId;
    this.startTime = startTime;
    this.endTime = endTime;
    this.zoneId = zoneId;
    this.available = available;
  }
}

module.exports = { Availability };
