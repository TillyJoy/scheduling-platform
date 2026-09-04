class Unit {
  constructor({
    id,
    propertyId,
    unitIdentifier,
    clientId = null
  }) {
    this.id = id;
    this.propertyId = propertyId;
    this.unitIdentifier = unitIdentifier;
    this.clientId = clientId;
  }
}

module.exports = { Unit };
