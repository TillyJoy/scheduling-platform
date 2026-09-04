class Client {
  constructor({
    id,
    firstName,
    lastName,
    phone,
    email
  }) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
    this.phone = phone;
    this.email = email;
  }
}

module.exports = { Client };
