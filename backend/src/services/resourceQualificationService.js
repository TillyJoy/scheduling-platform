const { ResourceQualification } = require("../models/resourceQualification");

class ResourceQualificationService {
  constructor({
    resourceQualificationStore = new Map(),
    resourceQualificationRepository = null,
    resourceRepository = null,
    qualificationRepository = null,
    transaction = null,
    authorize = ResourceQualificationService.defaultAuthorize
  } = {}) {
    if (resourceQualificationRepository && !transaction) throw new Error("transaction is required with resourceQualificationRepository");
    this.resourceQualificationStore = resourceQualificationStore;
    this.resourceQualificationRepository = resourceQualificationRepository;
    this.resourceRepository = resourceRepository;
    this.qualificationRepository = qualificationRepository;
    this.transaction = transaction;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.resourceQualificationRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get(args = {}) {
    return this.resourceQualificationRepository ? this.#durableGet(args) : this.#memoryGet(args);
  }

  list(args = {}) {
    return this.resourceQualificationRepository ? this.#durableList(args) : this.#memoryList(args);
  }

  update(args = {}) {
    return this.resourceQualificationRepository ? this.#durableUpdate(args) : this.#memoryUpdate(args);
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const record = new ResourceQualification({ ...input, organizationId: principal.organizationId });
    this.#authorize(principal, "resourceQualification:create", record.organizationId);
    const key = ResourceQualificationService.storageKey(record.organizationId, record.resourceQualificationId);
    if (this.resourceQualificationStore.has(key)) throw new Error("Resource qualification ID already exists");
    this.resourceQualificationStore.set(key, record);
    return record;
  }

  #memoryGet({ principal, resourceQualificationId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:read", principal.organizationId);
    const record = this.resourceQualificationStore.get(ResourceQualificationService.storageKey(principal.organizationId, resourceQualificationId));
    if (!record) throw new Error("Resource qualification not found");
    return record;
  }

  #memoryList({ principal, resourceId = null, qualificationId = null, serviceRef = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:read", principal.organizationId);
    return [...this.resourceQualificationStore.values()]
      .filter(item => item.organizationId === principal.organizationId)
      .filter(item => !resourceId || item.resourceId === resourceId)
      .filter(item => !qualificationId || item.qualificationId === qualificationId)
      .filter(item => serviceRef === null || item.serviceRef === serviceRef);
  }

  #memoryUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:update", principal.organizationId);
    const key = ResourceQualificationService.storageKey(principal.organizationId, input.resourceQualificationId);
    if (!this.resourceQualificationStore.has(key)) throw new Error("Resource qualification not found");
    const record = new ResourceQualification({ ...input, organizationId: principal.organizationId });
    this.resourceQualificationStore.set(key, record);
    return record;
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:create", principal.organizationId);
    return this.transaction(principal, "resource-qualification.create", async db => {
      const resource = await this.resourceRepository.get({ principal, resourceId: input.resourceId, db });
      if (!resource) throw new Error("Resource not found");
      const qualification = await this.qualificationRepository.get({ principal, qualificationId: input.qualificationId, db });
      if (!qualification) throw new Error("Qualification not found");
      return this.resourceQualificationRepository.create({
        principal, resourceQualification: input, db
      });
    });
  }

  async #durableGet({ principal, resourceQualificationId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:read", principal.organizationId);
    const record = await this.transaction(principal, "resource-qualification.read", db =>
      this.resourceQualificationRepository.get({ principal, resourceQualificationId, db })
    );
    if (!record) throw new Error("Resource qualification not found");
    return record;
  }

  async #durableList({ principal, resourceId = null, qualificationId = null, serviceRef = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:read", principal.organizationId);
    return this.transaction(principal, "resource-qualification.list", db =>
      this.resourceQualificationRepository.list({ principal, resourceId, qualificationId, serviceRef, db })
    );
  }

  async #durableUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resourceQualification:update", principal.organizationId);
    return this.transaction(principal, "resource-qualification.update", async db => {
      const resource = await this.resourceRepository.get({ principal, resourceId: input.resourceId, db });
      if (!resource) throw new Error("Resource not found");
      const qualification = await this.qualificationRepository.get({ principal, qualificationId: input.qualificationId, db });
      if (!qualification) throw new Error("Qualification not found");
      const record = await this.resourceQualificationRepository.update({
        principal, resourceQualification: input, db
      });
      if (!record) throw new Error("Resource qualification not found");
      return record;
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

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}

module.exports = { ResourceQualificationService };
