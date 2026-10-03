const { Qualification } = require("../models/qualification");

class QualificationService {
  constructor({
    qualificationStore = new Map(),
    qualificationRepository = null,
    transaction = null,
    authorize = QualificationService.defaultAuthorize
  } = {}) {
    if (qualificationRepository && !transaction) throw new Error("transaction is required with qualificationRepository");
    this.qualificationStore = qualificationStore;
    this.qualificationRepository = qualificationRepository;
    this.transaction = transaction;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.qualificationRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get(args = {}) {
    return this.qualificationRepository ? this.#durableGet(args) : this.#memoryGet(args);
  }

  list(args = {}) {
    return this.qualificationRepository ? this.#durableList(args) : this.#memoryList(args);
  }

  update(args = {}) {
    return this.qualificationRepository ? this.#durableUpdate(args) : this.#memoryUpdate(args);
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const qualification = new Qualification({ ...input, organizationId: principal.organizationId });
    this.#authorize(principal, "qualification:create", qualification.organizationId);
    const key = QualificationService.storageKey(qualification.organizationId, qualification.qualificationId);
    if (this.qualificationStore.has(key)) throw new Error("Qualification ID already exists");
    if ([...this.qualificationStore.values()].some(item =>
      item.organizationId === qualification.organizationId && item.code === qualification.code
    )) throw new Error("Qualification code already exists");
    this.qualificationStore.set(key, qualification);
    return qualification;
  }

  #memoryGet({ principal, qualificationId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:read", principal.organizationId);
    const qualification = this.qualificationStore.get(QualificationService.storageKey(principal.organizationId, qualificationId));
    if (!qualification) throw new Error("Qualification not found");
    return qualification;
  }

  #memoryList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:read", principal.organizationId);
    return [...this.qualificationStore.values()].filter(item => item.organizationId === principal.organizationId);
  }

  #memoryUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:update", principal.organizationId);
    const key = QualificationService.storageKey(principal.organizationId, input.qualificationId);
    if (!this.qualificationStore.has(key)) throw new Error("Qualification not found");
    const qualification = new Qualification({ ...input, organizationId: principal.organizationId });
    this.qualificationStore.set(key, qualification);
    return qualification;
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:create", principal.organizationId);
    return this.transaction(principal, "qualification.create", db =>
      this.qualificationRepository.create({ principal, qualification: input, db })
    );
  }

  async #durableGet({ principal, qualificationId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:read", principal.organizationId);
    const qualification = await this.transaction(principal, "qualification.read", db =>
      this.qualificationRepository.get({ principal, qualificationId, db })
    );
    if (!qualification) throw new Error("Qualification not found");
    return qualification;
  }

  async #durableList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:read", principal.organizationId);
    return this.transaction(principal, "qualification.list", db =>
      this.qualificationRepository.list({ principal, db })
    );
  }

  async #durableUpdate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "qualification:update", principal.organizationId);
    const qualification = await this.transaction(principal, "qualification.update", db =>
      this.qualificationRepository.update({ principal, qualification: input, db })
    );
    if (!qualification) throw new Error("Qualification not found");
    return qualification;
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

module.exports = { QualificationService };
