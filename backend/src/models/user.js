class User {
  constructor({
    id,
    organizationId,
    firstName,
    lastName,
    email,
    roleIds = [],
    active = true
  }) {
    this.id = id;
    this.organizationId = organizationId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.roleIds = roleIds;
    this.active = active;
  }
}

module.exports = { User };
