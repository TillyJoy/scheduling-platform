class Team {
  constructor({
    id,
    name,
    members = [],
    roles = [],
    qualifications = []
  }) {
    this.id = id;
    this.name = name;
    this.members = members;
    this.roles = roles;
    this.qualifications = qualifications;
  }
}

module.exports = { Team };
