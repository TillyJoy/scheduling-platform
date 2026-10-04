const { Assignment } = require("../models/assignment");
const { lockResources } = require("../database/schedulingConflictLock");

class AssignmentService {
  constructor({
    assignmentStore = new Map(),
    assignmentRepository = null,
    resourceRepository = null,
    jobRepository = null,
    workOrderRepository = null,
    transaction = null,
    authorize = AssignmentService.defaultAuthorize,
    statusResolver = null
  } = {}) {
    if (assignmentRepository && (!transaction || !resourceRepository || !jobRepository || !workOrderRepository)) {
      throw new Error("assignmentRepository requires transaction, resourceRepository, jobRepository, and workOrderRepository");
    }
    this.assignmentStore = assignmentStore;
    this.assignmentRepository = assignmentRepository;
    this.resourceRepository = resourceRepository;
    this.jobRepository = jobRepository;
    this.workOrderRepository = workOrderRepository;
    this.transaction = transaction;
    this.authorize = authorize;
    this.statusResolver = statusResolver;
  }

  create(args = {}) {
    return this.assignmentRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get(args = {}) {
    return this.assignmentRepository ? this.#durableGet(args) : this.#memoryGet(args);
  }

  list(args = {}) {
    return this.assignmentRepository ? this.#durableList(args) : this.#memoryList(args);
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const assignment = new Assignment(input);
    this.#authorize(principal, "assignment:create", assignment.organizationId);
    const key = this.#key(assignment.organizationId, assignment.id);
    if (this.assignmentStore.has(key)) throw new Error("Assignment ID already exists");
    this.#assertResourceAvailable(assignment);
    this.assignmentStore.set(key, assignment);
    return this.#clone(assignment);
  }

  #memoryGet({ principal, assignmentId }) {
    this.#requirePrincipal(principal);
    const assignment = this.assignmentStore.get(this.#key(principal.organizationId, assignmentId));
    if (!assignment) throw new Error("Assignment not found");
    this.#authorize(principal, "assignment:read", assignment.organizationId);
    return this.#clone(assignment);
  }

  #memoryList({ principal, resourceId = null, startTime = null, endTime = null } = {}) {
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

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "assignment:create", principal.organizationId);
    return this.transaction(principal, "assignment.create", async db => {
      const assignment = new Assignment({ ...input, organizationId: principal.organizationId });
      await lockResources(db, principal.organizationId, [assignment.resourceId]);

      if (await this.assignmentRepository.get({ principal, assignmentId: assignment.id, db })) {
        throw new Error("Assignment ID already exists");
      }

      const resource = await this.resourceRepository.get({
        principal,
        resourceId: assignment.resourceId,
        db
      });
      if (!resource) throw new Error("Resource not found");

      if (assignment.jobId) {
        const job = await this.jobRepository.get({ principal, jobId: assignment.jobId, db });
        if (!job) throw new Error("Job not found");
      }

      if (assignment.workOrderId) {
        const workOrder = await this.workOrderRepository.get({
          principal,
          workOrderId: assignment.workOrderId,
          db
        });
        if (!workOrder) throw new Error("Work order not found");
      }

      const conflicts = await this.assignmentRepository.findConflicts({
        principal,
        resourceId: assignment.resourceId,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        db
      });
      if (conflicts.some(existing => this.#consumesResource(existing))) {
        throw new Error("Resource is already assigned to an overlapping assignment");
      }

      return this.assignmentRepository.create({
        principal,
        assignment,
        db
      });
    });
  }

  async #durableGet({ principal, assignmentId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "assignment:read", principal.organizationId);
    const assignment = await this.transaction(
      principal,
      "assignment.read",
      db => this.assignmentRepository.get({ principal, assignmentId, db })
    );
    if (!assignment) throw new Error("Assignment not found");
    return assignment;
  }

  async #durableList({ principal, resourceId = null, startTime = null, endTime = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "assignment:read", principal.organizationId);
    return this.transaction(
      principal,
      "assignment.list",
      db => this.assignmentRepository.list({ principal, resourceId, startTime, endTime, db })
    );
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
