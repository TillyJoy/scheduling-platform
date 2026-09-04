class Zone {
  constructor({
    id,
    name,
    definitionType = "custom",
    definition = {},
    active = true
  }) {
    this.id = id;
    this.name = name;
    this.definitionType = definitionType;
    this.definition = definition;
    this.active = active;
  }
}

module.exports = { Zone };
