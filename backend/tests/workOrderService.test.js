const assert = require("node:assert/strict");
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

const service = new WorkOrderService();

const first = service.create({
  principal,
  id: "wo-1",
  organizationId: "org-a",
  jobId: "job-1",
  title: "First work order"
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

assert.throws(() => service.create({
  principal,
  id: "wo-3",
  organizationId: "org-a",
  jobId: "job-1",
  number: "A-2026-0002"
}), /Work order number already exists/);

assert.throws(() => service.get({ principal: otherOrg, workOrderId: "wo-1" }), /Not authorized/);
