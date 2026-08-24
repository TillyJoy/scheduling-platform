class Service {
  constructor({
    id,
    name,
    description = "",
    durationMinutes = null,
    active = true
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.durationMinutes = durationMinutes;
    this.active = active;
  }
}

module.exports = { Service };
