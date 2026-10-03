const test = require("node:test");
const assert = require("node:assert/strict");
const { Job } = require("../src/models/job");
const { JobService } = require("../src/services/jobService");

test("durable JobService uses the repository instead of its in-memory store", async () => {
  const principal = { userId: "user-a", organizationId: "org-a", permissions: ["job:create", "job:read"] };
  const persisted = new Job({ id: "job-1", organizationId: "org-a", title: "Persisted job" });
  const calls = [];
  let persistedExists = false;
  const repository = {
    async get({ jobId }) {
      calls.push(["get", jobId]);
      return jobId === "job-1" && persistedExists ? persisted : null;
    },
    async create({ job }) {
      calls.push(["create", job.id]);
      persistedExists = true;
      return persisted;
    },
    async list() {
      calls.push(["list"]);
      return [persisted];
    }
  };
  const transaction = async (_principal, action, work) => {
    calls.push(["transaction", action]);
    return work({ query: async () => {} });
  };

  const service = new JobService({
    jobStore: new Map([['["org-a","job-1"]', new Job({ id: "job-1", organizationId: "org-a", title: "Memory copy" })]]),
    jobRepository: repository,
    transaction
  });

  const created = await service.create({ principal, id: "job-1", title: "Requested job" });
  assert.equal(created.title, "Persisted job");
  assert.deepEqual(await service.get({ principal, jobId: "job-1" }), persisted);
  assert.deepEqual(await service.list({ principal }), [persisted]);
  assert.ok(calls.some(call => call[0] === "create"));
  assert.ok(calls.some(call => call[0] === "list"));
});

test("durable JobService rejects missing trusted principal", async () => {
  const service = new JobService({
    jobRepository: {},
    transaction: async (_principal, _action, work) => work({})
  });
  await assert.rejects(
    () => service.create({ principal: { organizationId: "org-a" }, id: "job-1", title: "Invalid" }),
    /Trusted principal is required/
  );
});
