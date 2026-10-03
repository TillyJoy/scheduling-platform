class ResourceQualification {
  constructor({
    resourceQualificationId,
    organizationId,
    resourceId,
    qualificationId,
    serviceRef = null,
    statusCode = null,
    effectiveAt = null,
    expirationAt = null,
    restrictions = {},
    verificationStatus = null,
    verificationMetadata = {},
    verifiedAt = null,
    verifierRef = null,
    evidenceRefs = []
  }) {
    if (!resourceQualificationId) throw new Error("resourceQualificationId is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!resourceId) throw new Error("resourceId is required");
    if (!qualificationId) throw new Error("qualificationId is required");
    if (!restrictions || typeof restrictions !== "object" || Array.isArray(restrictions)) {
      throw new Error("restrictions must be an object");
    }
    if (!verificationMetadata || typeof verificationMetadata !== "object" || Array.isArray(verificationMetadata)) {
      throw new Error("verificationMetadata must be an object");
    }
    if (!Array.isArray(evidenceRefs)) throw new Error("evidenceRefs must be an array");

    const effective = effectiveAt === null ? null : new Date(effectiveAt);
    const expiration = expirationAt === null ? null : new Date(expirationAt);
    const verified = verifiedAt === null ? null : new Date(verifiedAt);
    for (const [name, value] of [["effectiveAt", effective], ["expirationAt", expiration], ["verifiedAt", verified]]) {
      if (value && Number.isNaN(value.getTime())) throw new Error(name + " must be a valid date");
    }
    if (effective && expiration && expiration <= effective) {
      throw new Error("expirationAt must be after effectiveAt");
    }

    this.resourceQualificationId = resourceQualificationId;
    this.organizationId = organizationId;
    this.resourceId = resourceId;
    this.qualificationId = qualificationId;
    this.serviceRef = serviceRef;
    this.statusCode = statusCode;
    this.effectiveAt = effective;
    this.expirationAt = expiration;
    this.restrictions = structuredClone(restrictions);
    this.verificationStatus = verificationStatus;
    this.verificationMetadata = structuredClone(verificationMetadata);
    this.verifiedAt = verified;
    this.verifierRef = verifierRef;
    this.evidenceRefs = structuredClone(evidenceRefs);
  }
}

module.exports = { ResourceQualification };
