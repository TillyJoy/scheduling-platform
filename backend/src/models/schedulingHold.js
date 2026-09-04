class SchedulingHold {
  constructor({
    id,
    schedulerId,
    zoneId,
    startTime,
    endTime,
    expiresAt,
    status = "active"
  }) {
    this.id = id;
    this.schedulerId = schedulerId;
    this.zoneId = zoneId;
    this.startTime = startTime;
    this.endTime = endTime;
    this.expiresAt = expiresAt;
    this.status = status;
  }
}

module.exports = { SchedulingHold };
