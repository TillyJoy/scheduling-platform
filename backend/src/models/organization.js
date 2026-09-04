class Organization {
  constructor({
    id,
    name,
    active = true,
    terminology = {},
    settings = {}
  }) {
    this.id = id;
    this.name = name;
    this.active = active;
    this.terminology = terminology;
    this.settings = settings;
  }
}

module.exports = { Organization };
