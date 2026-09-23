const { WorkOrder } = require("../models/workOrder");

class WorkOrderService {
  constructor({
    workOrderStore = new Map(),
    authorize = WorkOrderService.defaultAuthorize,
    numberGenerator = WorkOrderService.defaultNumberGenerator
  } = {}) {
    this.workOrderStore = workOrderStore;
    this.authorize = authorize;
    this.numberGenerator = numberGenerator;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const workOrder = new WorkOrder({
      ...input,
      number: input.number ?? this.numberGenerator({
        organizationId: input.organizationId,
        jobId: input.jobId,
        workOrderStore: this.workOrderStore
      })
    });
    this.#authorize(principal, "workOrder:create", workOrder.organizationId);
    if (this.workOrderStore.has(workOrder.id)) throw new Error("Work order ID already exists");
    if ([...this.workOrderStore.values()].some(existing =>
      existing.organizationId === workOrder.organizationId && existing.number === workOrder.number
    )) {
      throw new Error("Work order number already exists");
    }
    this.workOrderStore.set(workOrder.id, workOrder);
    return workOrder;
  }

  get({ principal, workOrderId }) {
    this.#requirePrincipal(principal);
    const workOrder = this.workOrderStore.get(workOrderId);
    if (!workOrder) throw new Error("Work order not found");
    this.#authorize(principal, "workOrder:read", workOrder.organizationId);
    return workOrder;
  }

  list({ principal, jobId = null } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "workOrder:read", principal.organizationId);
    return [...this.workOrderStore.values()]
      .filter(workOrder => workOrder.organizationId === principal.organizationId)
      .filter(workOrder => !jobId || workOrder.jobId === jobId);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultNumberGenerator({ organizationId, workOrderStore }) {
    const prefix = "WO";
    let next = 1;
    while ([...workOrderStore.values()].some(order =>
      order.organizationId === organizationId && order.number === `${prefix}-${next}`
    )) {
      next += 1;
    }
    return `${prefix}-${next}`;
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { WorkOrderService };
