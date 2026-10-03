class ClientPropertyRelationship {
  constructor({ id, organizationId, clientId, propertyId, unitId = null, relationshipType, startAt, endAt = null, createdAt = null }) {
    if (!id) throw new Error("id is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!clientId) throw new Error("clientId is required");
    if (!propertyId) throw new Error("propertyId is required");
    if (!relationshipType) throw new Error("relationshipType is required");
    const start = new Date(startAt);
    const end = endAt === null ? null : new Date(endAt);
    if (Number.isNaN(start.getTime())) throw new Error("startAt must be a valid date");
    if (end && (Number.isNaN(end.getTime()) || end <= start)) throw new Error("endAt must be after startAt");
    this.id = id; this.organizationId = organizationId; this.clientId = clientId;
    this.propertyId = propertyId; this.unitId = unitId; this.relationshipType = relationshipType;
    this.startAt = start; this.endAt = end; this.createdAt = createdAt ? new Date(createdAt) : null;
  }
}
module.exports = { ClientPropertyRelationship };
