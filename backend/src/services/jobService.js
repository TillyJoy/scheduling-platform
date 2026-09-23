const { Job } = require("../models/job");

class JobService {
  constructor({ jobStore = new Map(), authorize = JobService.defaultAuthorize } = {}) {
    this.jobStore = jobStore;
    this.authorize = authorize;
  }

  create({ principal, ...input }) {
    this.#requirePrincipal(principal);
    const job = new Job(input);
    this.#authorize(principal, "job:create", job.organizationId);
    if (this.jobStore.has(job.id)) throw new Error("Job ID already exists");
    this.jobStore.set(job.id, job);
    return job;
  }

  get({ principal, jobId }) {
    this.#requirePrincipal(principal);
    const job = this.jobStore.get(jobId);
    if (!job) throw new Error("Job not found");
    this.#authorize(principal, "job:read", job.organizationId);
    return job;
  }

  list({ principal } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "job:read", principal.organizationId);
    return [...this.jobStore.values()]
      .filter(job => job.organizationId === principal.organizationId);
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) throw new Error("Not authorized");
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId &&
      Array.isArray(principal.permissions) &&
      principal.permissions.includes(action);
  }
}

module.exports = { JobService };
