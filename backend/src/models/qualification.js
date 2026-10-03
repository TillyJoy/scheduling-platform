class Qualification {
  constructor({
    qualificationId,
    organizationId,
    code,
    name,
    description = "",
    statusCode = null,
    metadata = {}
  }) {
    if (!qualificationId) throw new Error("qualificationId is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!code) throw new Error("code is required");
    if (!name) throw new Error("name is required");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be an object");
    }

    this.qualificationId = qualificationId;
    this.organizationId = organizationId;
    this.code = code;
    this.name = name;
    this.description = description;
    this.statusCode = statusCode;
    this.metadata = structuredClone(metadata);
  }
}

module.exports = { Qualification };
