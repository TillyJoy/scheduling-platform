const assert = require("node:assert/strict");
const { JobService } = require("../src/services/jobService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["job:create", "job:read"]
};
const otherOrg = {
  userId: "user-b",
  organizationId: "org-b",
  permissions: ["job:create", "job:read"]
};

const service = new JobService();

const job = service.create({
  principal,
  id: "job-1",
  organizationId: "org-a",
  title: "Initial service job",
  serviceIds: ["service-1"]
});

assert.equal(job.id, "job-1");
assert.equal(service.get({ principal, jobId: "job-1" }).title, "Initial service job");
assert.equal(service.list({ principal }).length, 1);
assert.throws(() => service.get({ principal: otherOrg, jobId: "job-1" }), /Job not found/);

const otherJob = service.create({
  principal: otherOrg,
  id: "job-1",
  organizationId: "org-b",
  title: "Same ID in another organization"
});
assert.equal(otherJob.id, "job-1");
assert.equal(service.get({ principal: otherOrg, jobId: "job-1" }).title, "Same ID in another organization");

assert.throws(() => service.create({
  principal,
  id: "job-1",
  organizationId: "org-a",
  title: "Duplicate"
}), /Job ID already exists/);
