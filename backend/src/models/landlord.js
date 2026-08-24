class Landlord {
  constructor({
    id,
    firstName,
    lastName,
    phone = null,
    email = null,
    mailingAddress = null
  }) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
    this.phone = phone;
    this.email = email;
    this.mailingAddress = mailingAddress;
  }
}

module.exports = { Landlord };
