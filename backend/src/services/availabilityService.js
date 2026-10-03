const { Availability } = require("../models/availability");

class AvailabilityService {
  constructor({
    availabilityStore = new Map(),
    availabilityRepository = null,
    resourceRepository = null,
    transaction = null,
    authorize = AvailabilityService.defaultAuthorize
  } = {}) {
    if (availabilityRepository && !transaction) throw new Error("transaction is required with availabilityRepository");
    this.availabilityStore = availabilityStore;
    this.availabilityRepository = availabilityRepository;
    this.resourceRepository = resourceRepository;
    this.transaction = transaction;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.availabilityRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get(args = {}) {
    return this.availabilityRepository ? this.#durableGet(args) : this.#memoryGet(args);
  }

  list(args = {}) {
    return this.availabilityRepository ? this.#durableList(args) : this.#memoryList(args);
  }

  update(args = {}) {
    return this.availabilityRepository ? this.#durableUpdate(args) : this.#memoryUpdate(args);
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const availability = new Availability({ ...input, organizationId: principal.organizationId });
    this.#authorize(principal, "availability:create", availability.organizationId);
    const key = AvailabilityService.storageKey(availability.organizationId, availability.id);
    if (this.availabilityStore.has(key)) throw new Error("Availability ID already exists");
    this.availabilityStore.set(key, availability);
    return availability;
  }

  #memoryGet({ principal, availabilityId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:read", principal.organizationId);
    const availability = this.availabilityStore.get(AvailabilityService.storageKey(principal.organizationId, availabilityId));
    if (!availability) throw new Error("Availability not found");
    return availability;
  }

  #memoryList({ principal, resourceId = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:read", principal.organizationId);
    return [...this.availabilityStore.values()]
      .filter(item => item.organizationId === principal.organizationId)
      .filter(item => !resourceId || item.resourceId === resourceId);
  }

  #memoryUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:update", principal.organizationId);
    const key = AvailabilityService.storageKey(principal.organizationId, input.id);
    if (!this.availabilityStore.has(key)) throw new Error("Availability not found");
    const availability = new Availability({ ...input, organizationId: principal.organizationId });
    this.availabilityStore.set(key, availability);
    return availability;
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:create", principal.organizationId);
    return this.transaction(principal, "availability.create", async db => {
      const resource = await this.resourceRepository.get({ principal, resourceId: input.resourceId, db });
      if (!resource) throw new Error("Resource not found");
      return this.availabilityRepository.create({ principal, availability: input, db });
    });
  }

  async #durableGet({ principal, availabilityId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:read", principal.organizationId);
    const availability = await this.transaction(principal, "availability.read", db =>
      this.availabilityRepository.get({ principal, availabilityId, db })
    );
    if (!availability) throw new Error("Availability not found");
    return availability;
  }

  async #durableList({ principal, resourceId = null, startTime = null, endTime = null }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:read", principal.organizationId);
    return this.transaction(principal, "availability.list", db =>
      this.availabilityRepository.list({ principal, resourceId, startTime, endTime, db })
    );
  }

  async #durableUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "availability:update", principal.organizationId);
    return this.transaction(principal, "availability.update", async db => {
      const resource = await this.resourceRepository.get({ principal, resourceId: input.resourceId, db });
      if (!resource) throw new Error("Resource not found");
      const availability = await this.availabilityRepository.update({ principal, availability: input, db });
      if (!availability) throw new Error("Availability not found");
      return availability;
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

module.exports = { AvailabilityService };
