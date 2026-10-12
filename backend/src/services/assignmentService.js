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
    statusResolver = null,
    statusConfigurationService = null
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
    this.statusConfigurationService = statusConfigurationService;
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

  transitionStatus(args = {}) {
    return this.#durableTransitionStatus(args);
  }

  async #durableTransitionStatus({ principal, assignmentId, expectedStatusCode, statusCode, reason = null, metadata = {} }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "assignment:update", principal.organizationId);
    this.#authorize(principal, "status:transition", principal.organizationId);
    if (!this.assignmentRepository || !this.statusConfigurationService?.repository || !this.transaction) {
      const error = new Error("Durable assignment status transitions require database persistence");
      error.statusCode = 503;
      throw error;
    }
    if (!assignmentId || typeof expectedStatusCode !== "string" || !expectedStatusCode || typeof statusCode !== "string" || !statusCode) {
      const error = new Error("assignmentId, expectedStatusCode, and statusCode are required");
      error.statusCode = 400;
      throw error;
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      const error = new Error("metadata must be an object");
      error.statusCode = 400;
      throw error;
    }

    return this.transaction(principal, "assignment.status.transition", async db => {
      const initial = await this.assignmentRepository.get({ principal, assignmentId, db });
      if (!initial) {
        const error = new Error("Assignment not found");
        error.statusCode = 404;
        throw error;
      }
      await lockResources(db, principal.organizationId, [initial.resourceId]);
      const current = await this.assignmentRepository.get({ principal, assignmentId, db, forUpdate: true });
      if (!current) {
        const error = new Error("Assignment not found");
        error.statusCode = 404;
        throw error;
      }
      if (current.statusCode !== expectedStatusCode) {
        const error = new Error("Assignment status changed; reload and retry");
        error.statusCode = 409;
        throw error;
      }
      const currentStatus = await this.statusConfigurationService.repository.getStatus({
        principal, entityType: "assignment", code: current.statusCode, db
      });
      if (!currentStatus) {
        const error = new Error("Current assignment status is not configured");
        error.statusCode = 409;
        throw error;
      }
      const allowed = await this.statusConfigurationService.getAllowedTransitionsForLifecycle({
        principal, entityType: "assignment", fromCode: current.statusCode, db
      });
      const targetStatus = allowed.find(status => status.code === statusCode);
      if (!targetStatus) {
        const error = new Error("Status transition is not allowed");
        error.statusCode = 409;
        throw error;
      }
      if (targetStatus.category !== "cancelled") {
        const conflicts = await this.assignmentRepository.findConflicts({
          principal, resourceId: current.resourceId, startTime: current.startTime,
          endTime: current.endTime, excludeAssignmentId: current.id, db
        });
        for (const conflict of conflicts) {
          const conflictStatus = conflict.statusCode && await this.statusConfigurationService.repository.getStatus({
            principal, entityType: "assignment", code: conflict.statusCode, db
          });
          if (!conflictStatus || conflictStatus.category !== "cancelled") {
            const error = new Error("Resource is already assigned to an overlapping assignment");
            error.statusCode = 409;
            throw error;
          }
        }
      }
      return this.assignmentRepository.transitionStatus({
        principal, assignmentId, expectedStatusCode, statusCode, reason, metadata, db
      });
    });
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
      for (const existing of conflicts) {
        let consumesResource = this.#consumesResource(existing);
        if (this.statusConfigurationService?.repository && existing.statusCode) {
          const configuredStatus = await this.statusConfigurationService.repository.getStatus({
            principal, entityType: "assignment", code: existing.statusCode, db
          });
          consumesResource = !configuredStatus || configuredStatus.category !== "cancelled";
        }
        if (consumesResource) throw new Error("Resource is already assigned to an overlapping assignment");
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
