const { Assignment } = require("../models/assignment");

class AssignmentService {
  constructor({
    assignmentStore = new Map(),
    authorize = AssignmentService.defaultAuthorize,
    statusResolver = null
  } = {}) {
    this.assignmentStore = assignmentStore;
    this.authorize = authorize;
    this.statusResolver = statusResolver;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const assignment = new Assignment(input);
    this.#authorize(principal, "assignment:create", assignment.organizationId);
    const key = this.#key(assignment.organizationId, assignment.id);
    if (this.assignmentStore.has(key)) throw new Error("Assignment ID already exists");
    this.#assertResourceAvailable(assignment);
    this.assignmentStore.set(key, assignment);
    return this.#clone(assignment);
  }

  get({ principal, assignmentId }) {
    this.#requirePrincipal(principal);
    const assignment = this.assignmentStore.get(this.#key(principal.organizationId, assignmentId));
    if (!assignment) throw new Error("Assignment not found");
    this.#authorize(principal, "assignment:read", assignment.organizationId);
    return this.#clone(assignment);
  }

  list({ principal, resourceId = null, startTime = null, endTime = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "assignment:read", principal.organizationId);
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    return [...this.assignmentStore.values()]
      .filter(a => a.organizationId === principal.organizationId)
      .filter(a => !resourceId || a.resourceId === resourceId)
      .filter(a => !start || a.endTime > start)
      .filter(a => !end || a.startTime < end)
      .sort((a, b) => a.startTime - b.startTime)
      .map(assignment => this.#clone(assignment));
  }

  #assertResourceAvailable(candidate) {
    for (const existing of this.assignmentStore.values()) {
      if (existing.organizationId !== candidate.organizationId || existing.resourceId !== candidate.resourceId) continue;
      if (!this.#consumesResource(existing)) continue;
      if (existing.endTime <= candidate.startTime || existing.startTime >= candidate.endTime) continue;
      throw new Error("Resource is already assigned to an overlapping assignment");
    }
  }

  #consumesResource(assignment) {
    if (!assignment.statusCode || !this.statusResolver) return true;
    const status = this.statusResolver({
      organizationId: assignment.organizationId,
      entityType: "assignment",
      statusCode: assignment.statusCode
    });
    if (!status) return true;
    return status.category !== "cancelled";
  }

  #clone(assignment) {
    return new Assignment({
      id: assignment.id,
      organizationId: assignment.organizationId,
      resourceId: assignment.resourceId,
      jobId: assignment.jobId,
      workOrderId: assignment.workOrderId,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      statusCode: assignment.statusCode,
      metadata: assignment.metadata
    });
  }

  #key(organizationId, assignmentId) {
    return JSON.stringify([organizationId, assignmentId]);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}

module.exports = { AssignmentService };
