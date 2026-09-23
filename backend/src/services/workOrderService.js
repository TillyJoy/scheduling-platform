const { WorkOrder } = require("../models/workOrder");

class WorkOrderService {
  constructor({
    workOrderStore = new Map(),
    authorize = WorkOrderService.defaultAuthorize,
    numberGenerator = WorkOrderService.defaultNumberGenerator,
    jobService
  } = {}) {
    this.workOrderStore = workOrderStore;
    this.authorize = authorize;
    this.numberGenerator = numberGenerator;
    this.jobService = jobService;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const organizationId = input.organizationId;
    this.#authorize(principal, "workOrder:create", organizationId);
    this.#requireJob(organizationId, input.jobId);

    const workOrder = new WorkOrder({
      ...input,
      number: input.number ?? this.numberGenerator({
        organizationId,
        jobId: input.jobId,
        workOrderStore: this.workOrderStore
      })
    });

    const key = WorkOrderService.storageKey(workOrder.organizationId, workOrder.id);
    if (this.workOrderStore.has(key)) throw new Error("Work order ID already exists");
    if ([...this.workOrderStore.values()].some(existing =>
      existing.organizationId === workOrder.organizationId && existing.number === workOrder.number
    )) {
      throw new Error("Work order number already exists");
    }
    this.workOrderStore.set(key, workOrder);
    return this.#clone(workOrder);
  }

  get({ principal, workOrderId }) {
    this.#requirePrincipal(principal);
    const workOrder = this.workOrderStore.get(
      WorkOrderService.storageKey(principal.organizationId, workOrderId)
    );
    if (!workOrder) throw new Error("Work order not found");
    this.#authorize(principal, "workOrder:read", workOrder.organizationId);
    return this.#clone(workOrder);
  }

  list({ principal, jobId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "workOrder:read", principal.organizationId);
    return [...this.workOrderStore.values()]
      .filter(workOrder => workOrder.organizationId === principal.organizationId)
      .filter(workOrder => !jobId || workOrder.jobId === jobId)
      .map(workOrder => this.#clone(workOrder));
  }

  #requireJob(organizationId, jobId) {
    if (!this.jobService || typeof this.jobService.getForOrganization !== "function") {
      throw new Error("Job service is required");
    }
    const job = this.jobService.getForOrganization({ organizationId, jobId });
    if (!job) throw new Error("Job not found");
  }

  #clone(workOrder) {
    return new WorkOrder({
      id: workOrder.id,
      organizationId: workOrder.organizationId,
      jobId: workOrder.jobId,
      number: workOrder.number,
      title: workOrder.title,
      statusCode: workOrder.statusCode,
      metadata: workOrder.metadata
    });
  }

  static storageKey(organizationId, id) {
    return JSON.stringify([organizationId, id]);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultNumberGenerator({ organizationId, workOrderStore }) {
    const prefix = "WO";
    const occupiedNumbers = new Set(
      [...workOrderStore.values()]
        .filter(order => order.organizationId === organizationId)
        .map(order => order.number)
    );
    let next = 1;
    while (occupiedNumbers.has(prefix + "-" + next)) {
      next += 1;
    }
    return prefix + "-" + next;
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { WorkOrderService };
