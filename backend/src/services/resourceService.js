const { Resource } = require("../models/resource");

class ResourceService {
  constructor({
    resourceStore = new Map(),
    resourceRepository = null,
    transaction = null,
    authorize = ResourceService.defaultAuthorize
  } = {}) {
    if (resourceRepository && !transaction) throw new Error("transaction is required with resourceRepository");
    this.resourceStore = resourceStore;
    this.resourceRepository = resourceRepository;
    this.transaction = transaction;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.resourceRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get(args = {}) {
    return this.resourceRepository ? this.#durableGet(args) : this.#memoryGet(args);
  }

  list(args = {}) {
    return this.resourceRepository ? this.#durableList(args) : this.#memoryList(args);
  }

  update(args = {}) {
    return this.resourceRepository ? this.#durableUpdate(args) : this.#memoryUpdate(args);
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const resource = new Resource({ ...input, organizationId: principal.organizationId });
    this.#authorize(principal, "resource:create", resource.organizationId);
    const key = ResourceService.storageKey(resource.organizationId, resource.id);
    if (this.resourceStore.has(key)) throw new Error("Resource ID already exists");
    this.resourceStore.set(key, resource);
    return resource;
  }

  #memoryGet({ principal, resourceId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:read", principal.organizationId);
    const resource = this.resourceStore.get(ResourceService.storageKey(principal.organizationId, resourceId));
    if (!resource) throw new Error("Resource not found");
    return resource;
  }

  #memoryList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:read", principal.organizationId);
    return [...this.resourceStore.values()].filter(resource => resource.organizationId === principal.organizationId);
  }

  #memoryUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:update", principal.organizationId);
    const key = ResourceService.storageKey(principal.organizationId, input.id);
    if (!this.resourceStore.has(key)) throw new Error("Resource not found");
    const resource = new Resource({ ...input, organizationId: principal.organizationId });
    this.resourceStore.set(key, resource);
    return resource;
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:create", principal.organizationId);
    return this.transaction(principal, "resource.create", db =>
      this.resourceRepository.create({ principal, resource: input, db })
    );
  }

  async #durableGet({ principal, resourceId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:read", principal.organizationId);
    const resource = await this.transaction(principal, "resource.read", db =>
      this.resourceRepository.get({ principal, resourceId, db })
    );
    if (!resource) throw new Error("Resource not found");
    return resource;
  }

  async #durableList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:read", principal.organizationId);
    return this.transaction(principal, "resource.list", db =>
      this.resourceRepository.list({ principal, db })
    );
  }

  async #durableUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "resource:update", principal.organizationId);
    const resource = await this.transaction(principal, "resource.update", db =>
      this.resourceRepository.update({ principal, resource: input, db })
    );
    if (!resource) throw new Error("Resource not found");
    return resource;
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

module.exports = { ResourceService };
