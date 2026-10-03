class Resource {
  constructor({
    id,
    organizationId = null,
    name,
    resourceType = null,
    role = null,
    capabilities = [],
    statusCode = null,
    active = true,
    geographicRestrictions = {},
    serviceRestrictions = {},
    metadata = {},
    qualifications = []
  }) {
    if (!id) throw new Error("id is required");
    if (!name) throw new Error("name is required");
    if (!Array.isArray(capabilities)) throw new Error("capabilities must be an array");
    if (!Array.isArray(qualifications)) throw new Error("qualifications must be an array");
    for (const [name, value] of [["geographicRestrictions", geographicRestrictions], ["serviceRestrictions", serviceRestrictions], ["metadata", metadata]]) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
    }

    this.id = id;
    this.organizationId = organizationId;
    this.name = name;
    this.resourceType = resourceType;
    this.role = role;
    this.capabilities = structuredClone(capabilities);
    this.statusCode = statusCode;
    this.active = active !== false;
    this.geographicRestrictions = structuredClone(geographicRestrictions);
    this.serviceRestrictions = structuredClone(serviceRestrictions);
    this.metadata = structuredClone(metadata);
    this.qualifications = [...qualifications];
  }
}

module.exports = { Resource };
