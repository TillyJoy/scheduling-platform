const test = require("node:test");
const assert = require("node:assert/strict");
const { Job } = require("../src/models/job");
const { WorkOrder } = require("../src/models/workOrder");
const { JobService } = require("../src/services/jobService");
const { WorkOrderService } = require("../src/services/workOrderService");

test("durable WorkOrderService uses durable Job and Work Order repositories", async () => {
  const principal = { userId: "user-a", organizationId: "org-a", permissions: ["workOrder:create", "workOrder:read"] };
  const job = new Job({ id: "job-1", organizationId: "org-a", title: "Persisted job" });
  const persisted = new WorkOrder({ id: "wo-1", organizationId: "org-a", jobId: "job-1", number: "WO-9", title: "Persisted work" });
  const calls = [];
  const jobRepository = {
    async get() { calls.push(["job-get"]); return job; }
  };
  const workOrderRepository = {
    async nextAutomaticNumber() { calls.push(["next-number"]); return "WO-9"; },
    async create({ workOrder }) { calls.push(["create", workOrder.number]); return persisted; },
    async get() { calls.push(["get"]); return persisted; },
    async list() { calls.push(["list"]); return [persisted]; }
  };
  const transaction = async (_principal, action, work) => {
    calls.push(["transaction", action]);
    return work({});
  };
  const jobService = new JobService({ jobRepository, transaction, authorize: () => true });
  const service = new WorkOrderService({
    workOrderStore: new Map([['["org-a","wo-1"]', new WorkOrder({ id: "wo-1", organizationId: "org-a", jobId: "job-1", number: "MEMORY-1" })]]),
    workOrderRepository,
    transaction,
    jobService
  });

  const created = await service.create({ principal, id: "wo-1", jobId: "job-1", title: "Requested" });
  assert.equal(created.number, "WO-9");
  assert.equal((await service.get({ principal, workOrderId: "wo-1" })).number, "WO-9");
  assert.deepEqual(await service.list({ principal, jobId: "job-1" }), [persisted]);
  assert.ok(calls.some(call => call[0] === "next-number"));
  assert.ok(calls.some(call => call[0] === "create"));
});

test("durable WorkOrderService does not fall back to memory when the Job is missing", async () => {
  const principal = { userId: "user-a", organizationId: "org-a", permissions: ["workOrder:create"] };
  const jobRepository = { async get() { return null; } };
  const workOrderRepository = { async create() { throw new Error("must not be called"); } };
  const transaction = async (_principal, _action, work) => work({});
  const jobService = new JobService({ jobRepository, transaction, authorize: () => true });
  const service = new WorkOrderService({ workOrderRepository, transaction, jobService });
  await assert.rejects(
    () => service.create({ principal, id: "wo-1", jobId: "missing" }),
    /Job not found/
  );
});
