const assert = require("node:assert/strict");
const { JobService } = require("../src/services/jobService");
const { WorkOrderService } = require("../src/services/workOrderService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["workOrder:create", "workOrder:read"]
};
const otherOrg = {
  userId: "user-b",
  organizationId: "org-b",
  permissions: ["workOrder:create", "workOrder:read"]
};

const jobService = new JobService({
  authorize: () => true
});
jobService.create({
  principal,
  id: "job-1",
  organizationId: "org-a",
  title: "Job A"
});
jobService.create({
  principal: otherOrg,
  id: "job-1",
  organizationId: "org-b",
  title: "Job B"
});

const service = new WorkOrderService({ jobService });

const first = service.create({
  principal,
  id: "wo-1",
  organizationId: "org-a",
  jobId: "job-1",
  title: "First work order",
  metadata: { nested: { value: 1 } }
});

assert.equal(first.number, "WO-1");

const second = service.create({
  principal,
  id: "wo-2",
  organizationId: "org-a",
  jobId: "job-1",
  number: "A-2026-0002"
});

assert.equal(second.number, "A-2026-0002");
assert.equal(service.list({ principal, jobId: "job-1" }).length, 2);
assert.equal(service.get({ principal, workOrderId: "wo-2" }).number, "A-2026-0002");

const sameIdOtherOrg = service.create({
  principal: otherOrg,
  id: "wo-1",
  organizationId: "org-b",
  jobId: "job-1",
  title: "Same ID in another organization"
});
assert.equal(sameIdOtherOrg.id, "wo-1");
assert.equal(service.get({ principal: otherOrg, workOrderId: "wo-1" }).title, "Same ID in another organization");

const callerMetadata = { nested: { value: 2 } };
const isolated = service.create({
  principal,
  id: "wo-3",
  organizationId: "org-a",
  jobId: "job-1",
  metadata: callerMetadata
});
callerMetadata.nested.value = 99;
isolated.metadata.nested.value = 88;
assert.equal(service.get({ principal, workOrderId: "wo-3" }).metadata.nested.value, 2);

const listed = service.list({ principal, jobId: "job-1" });
listed[0].metadata.nested.value = 77;
assert.equal(service.get({ principal, workOrderId: "wo-1" }).metadata.nested.value, 1);

assert.throws(() => service.create({
  principal,
  id: "wo-4",
  organizationId: "org-a",
  jobId: "missing-job",
  number: "A-2026-0004"
}), /Job not found/);

assert.throws(() => service.create({
  principal,
  id: "wo-5",
  organizationId: "org-a",
  jobId: "job-1",
  number: "A-2026-0002"
}), /Work order number already exists/);
