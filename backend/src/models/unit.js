class Unit {
  constructor({ id, organizationId = null, propertyId, unitIdentifier, clientId = null }) {
    this.id = id;
    this.organizationId = organizationId;
    this.propertyId = propertyId;
    this.unitIdentifier = unitIdentifier;
    this.clientId = clientId;
  }
}
module.exports = { Unit };
