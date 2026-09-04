class Property {
  constructor({
    id,
    address,
    city,
    state,
    postalCode,
    landlordId = null,
    units = []
  }) {
    this.id = id;
    this.address = address;
    this.city = city;
    this.state = state;
    this.postalCode = postalCode;
    this.landlordId = landlordId;
    this.units = units;
  }
}

module.exports = { Property };
