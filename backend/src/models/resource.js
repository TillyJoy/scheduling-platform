class Resource {
  constructor({
    id,
    name,
    role = null,
    qualifications = [],
    active = true
  }) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.qualifications = qualifications;
    this.active = active;
  }
}

module.exports = { Resource };
