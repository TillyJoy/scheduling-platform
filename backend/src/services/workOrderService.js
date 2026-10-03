const { WorkOrder } = require("../models/workOrder");

class WorkOrderService {
  constructor({
    workOrderStore = new Map(),
    workOrderRepository = null,
    transaction = null,
    authorize = WorkOrderService.defaultAuthorize,
    numberGenerator = WorkOrderService.defaultNumberGenerator,
    jobService
  } = {}) {
    if (!jobService) throw new Error("jobService is required");
    if (workOrderRepository && !transaction) throw new Error("transaction is required with workOrderRepository");
    this.workOrderStore = workOrderStore;
    this.workOrderRepository = workOrderRepository;
    this.transaction = transaction;
    this.authorize = authorize;
    this.numberGenerator = numberGenerator;
    this.jobService = jobService;
  }

  create(args = {}) {
    return this.workOrderRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  getForOrganization({ organizationId, workOrderId = null, jobId = null, db = null }) {
    const id = workOrderId ?? jobId;
    if (!id) return null;
    if (!this.workOrderRepository) {
      return this.workOrderStore.get(WorkOrderService.storageKey(organizationId, id)) ?? null;
    }
    const principal = { userId: "system", organizationId };
    const read = database => this.workOrderRepository.get({ principal, workOrderId: id, db: database });
    return db ? read(db) : this.transaction(principal, "work-order.internal-read", read);
  }

  get({ principal, workOrderId }) {
    return this.workOrderRepository ? this.#durableGet({ principal, workOrderId }) : this.#memoryGet({ principal, workOrderId });
  }

  list({ principal, jobId = null } = {}) {
    return this.workOrderRepository
      ? this.#durableList({ principal, jobId })
      : this.#memoryList({ principal, jobId });
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const organizationId = input.organizationId;
    this.#authorize(principal, "workOrder:create", organizationId);
    this.#requireMemoryJob(organizationId, input.jobId);
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
    )) throw new Error("Work order number already exists");
    this.workOrderStore.set(key, workOrder);
    return this.#clone(workOrder);
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const organizationId = principal.organizationId;
    this.#authorize(principal, "workOrder:create", organizationId);
    return this.transaction(principal, "work-order.create", async db => {
      const job = await this.jobService.getForOrganization({
        organizationId,
        jobId: input.jobId,
        db
      });
      if (!job) throw new Error("Job not found");

      const number = input.number ?? await this.numberGenerator({
        organizationId,
        jobId: input.jobId,
        workOrderRepository: this.workOrderRepository,
        db,
        workOrderStore: this.workOrderStore
      });

      try {
        return await this.workOrderRepository.create({
          principal,
          workOrder: { ...input, organizationId, number },
          db
        });
      } catch (error) {
        if (error.code === "23505" && error.constraint === "work_orders_organization_id_number_key") {
          throw new Error("Work order number already exists");
        }
        if (error.code === "23505") throw new Error("Work order ID already exists");
        throw error;
      }
    });
  }

  #memoryGet({ principal, workOrderId }) {
    this.#requirePrincipal(principal);
    const workOrder = this.workOrderStore.get(
      WorkOrderService.storageKey(principal.organizationId, workOrderId)
    );
    if (!workOrder) throw new Error("Work order not found");
    this.#authorize(principal, "workOrder:read", workOrder.organizationId);
    return this.#clone(workOrder);
  }

  #memoryList({ principal, jobId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "workOrder:read", principal.organizationId);
    return [...this.workOrderStore.values()]
      .filter(workOrder => workOrder.organizationId === principal.organizationId)
      .filter(workOrder => !jobId || workOrder.jobId === jobId)
      .map(workOrder => this.#clone(workOrder));
  }

  async #durableGet({ principal, workOrderId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "workOrder:read", principal.organizationId);
    const workOrder = await this.transaction(
      principal,
      "work-order.read",
      db => this.workOrderRepository.get({ principal, workOrderId, db })
    );
    if (!workOrder) throw new Error("Work order not found");
    return this.#clone(workOrder);
  }

  async #durableList({ principal, jobId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "workOrder:read", principal.organizationId);
    const workOrders = await this.transaction(
      principal,
      "work-order.list",
      db => this.workOrderRepository.list({ principal, jobId, db })
    );
    return workOrders.map(workOrder => this.#clone(workOrder));
  }

  #requireMemoryJob(organizationId, jobId) {
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

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static storageKey(organizationId, id) {
    return JSON.stringify([organizationId, id]);
  }

  static async defaultNumberGenerator({ organizationId, workOrderRepository, db, workOrderStore }) {
    if (workOrderRepository) {
      const principal = { userId: "system", organizationId };
      return workOrderRepository.nextAutomaticNumber({ principal, db });
    }
    const prefix = "WO";
    const occupiedNumbers = new Set(
      [...workOrderStore.values()]
        .filter(order => order.organizationId === organizationId)
        .map(order => order.number)
    );
    let next = 1;
    while (occupiedNumbers.has(prefix + "-" + next)) next += 1;
    return prefix + "-" + next;
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { WorkOrderService };
