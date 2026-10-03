const { Job } = require("../models/job");

class JobService {
  constructor({
    jobStore = new Map(),
    jobRepository = null,
    transaction = null,
    authorize = JobService.defaultAuthorize
  } = {}) {
    if (jobRepository && !transaction) throw new Error("transaction is required with jobRepository");
    this.jobStore = jobStore;
    this.jobRepository = jobRepository;
    this.transaction = transaction;
    this.authorize = authorize;
  }

  create(args = {}) {
    return this.jobRepository ? this.#durableCreate(args) : this.#memoryCreate(args);
  }

  get({ principal, jobId } = {}) {
    return this.jobRepository ? this.#durableGet({ principal, jobId }) : this.#memoryGet({ principal, jobId });
  }

  getForOrganization({ organizationId, jobId, db = null } = {}) {
    if (!this.jobRepository) {
      return this.jobStore.get(JobService.storageKey(organizationId, jobId)) ?? null;
    }
    const principal = { userId: "system", organizationId };
    const read = database => this.jobRepository.get({ principal, jobId, db: database });
    return db
      ? read(db)
      : this.transaction(principal, "job.internal-read", read);
  }

  list({ principal } = {}) {
    return this.jobRepository ? this.#durableList({ principal }) : this.#memoryList({ principal });
  }

  #memoryCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const job = new Job(input);
    this.#authorize(principal, "job:create", job.organizationId);
    const key = JobService.storageKey(job.organizationId, job.id);
    if (this.jobStore.has(key)) throw new Error("Job ID already exists");
    this.jobStore.set(key, job);
    return job;
  }

  #memoryGet({ principal, jobId }) {
    this.#requirePrincipal(principal);
    const job = this.jobStore.get(JobService.storageKey(principal.organizationId, jobId));
    if (!job) throw new Error("Job not found");
    this.#authorize(principal, "job:read", job.organizationId);
    return job;
  }

  #memoryList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "job:read", principal.organizationId);
    return [...this.jobStore.values()].filter(job => job.organizationId === principal.organizationId);
  }

  async #durableCreate({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const organizationId = principal.organizationId;
    this.#authorize(principal, "job:create", organizationId);
    return this.transaction(principal, "job.create", async db => {
      const existing = await this.jobRepository.get({ principal, jobId: input.id, db });
      if (existing) throw new Error("Job ID already exists");
      return this.jobRepository.create({
        principal,
        job: { ...input, organizationId },
        db
      });
    });
  }

  async #durableGet({ principal, jobId }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "job:read", principal.organizationId);
    const load = db => this.jobRepository.get({ principal, jobId, db });
    const job = await this.transaction(principal, "job.read", load);
    if (!job) throw new Error("Job not found");
    return job;
  }

  async #durableList({ principal }) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "job:read", principal.organizationId);
    return this.transaction(principal, "job.list", db => this.jobRepository.list({ principal, db }));
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
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { JobService };
