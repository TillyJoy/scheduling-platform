class Eligibility {
  constructor({
    id,
    clientId = null,
    propertyId = null,
    unitId = null,
    serviceId,
    eligible = false,
    reason = null,
    fundingIds = []
  }) {
    this.id = id;
    this.clientId = clientId;
    this.propertyId = propertyId;
    this.unitId = unitId;
    this.serviceId = serviceId;
    this.eligible = eligible;
    this.reason = reason;
    this.fundingIds = fundingIds;
  }
}

module.exports = { Eligibility };
