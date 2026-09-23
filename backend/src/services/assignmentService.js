const { Assignment } = require("../models/assignment");

class AssignmentService {
  constructor({ assignmentStore = new Map(), authorize = AssignmentService.defaultAuthorize } = {}) {
    this.assignmentStore = assignmentStore;
    this.authorize = authorize;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const assignment = new Assignment(input);
    this.#authorize(principal, "assignment:create", assignment.organizationId);
    if (this.assignmentStore.has(assignment.id)) throw new Error("Assignment ID already exists");
    this.#assertResourceAvailable(assignment);
    this.assignmentStore.set(assignment.id, assignment);
    return assignment;
  }

  get({ principal, assignmentId }) {
    this.#requirePrincipal(principal);
    const assignment = this.assignmentStore.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    this.#authorize(principal, "assignment:read", assignment.organizationId);
    return assignment;
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
      .sort((a, b) => a.startTime - b.startTime);
  }

  #assertResourceAvailable(candidate) {
    for (const existing of this.assignmentStore.values()) {
      if (existing.organizationId !== candidate.organizationId || existing.resourceId !== candidate.resourceId) continue;
      if (existing.statusCode === "cancelled") continue;
      if (existing.endTime <= candidate.startTime || existing.startTime >= candidate.endTime) continue;
      throw new Error("Resource is already assigned to an overlapping assignment");
    }
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
