const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function workflow() {
  const context = { window: { crypto: { randomUUID: () => "assignment-test-id" } } };
  vm.runInNewContext(fs.readFileSync("src/assignmentWorkflow.js", "utf8"), context);
  return context.window.SchedulingAssignmentWorkflow;
}

test("assignment browser workflow source parses", () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync("src/assignmentWorkflow.js", "utf8")));
});

test("assignment list and details require read permission and use scoped API routes", async () => {
  const calls = [];
  const ui = workflow();
  const controller = ui.createController(async (...args) => {
    calls.push(args);
    return args[0] === "/api/assignments" ? [{ id: "assignment-a" }] : { id: "assignment-a" };
  });
  const session = { permissions: ["assignment:read"] };

  assert.deepEqual(await controller.list(session), [{ id: "assignment-a" }]);
  assert.deepEqual(await controller.get(session, "assignment-a"), { id: "assignment-a" });
  assert.deepEqual(calls.map(([path]) => path), ["/api/assignments", "/api/assignments/assignment-a"]);
  assert.throws(() => controller.list({ permissions: [] }), error => error.status === 403);
  assert.equal(calls.length, 2);
});

test("assignment creation uses authorized references and omits client supplied organization", async () => {
  const calls = [];
  const ui = workflow();
  const controller = ui.createController(async (...args) => {
    calls.push(args);
    if (args[0] === "/api/jobs") return [{ id: "job-a", title: "Job A" }];
    if (args[0] === "/api/resources") return [{ id: "resource-a", name: "Resource A" }];
    if (args[0].startsWith("/api/work-orders")) return [{ id: "work-a", number: "WO-1" }];
    return { id: "assignment-test-id", organizationId: "org-a" };
  });
  const session = {
    organizationId: "org-a",
    permissions: ["assignment:create", "assignment:read", "job:read", "resource:read", "workOrder:read"]
  };

  const references = await controller.references(session);
  assert.equal(references.available, true);
  assert.equal(references.canReadWorkOrders, true);
  assert.equal(references.jobs[0].id, "job-a");
  assert.equal(references.resources[0].id, "resource-a");
  assert.deepEqual(await controller.workOrders(session, "job-a"), [{ id: "work-a", number: "WO-1" }]);
  const created = await controller.create(session, {
    resourceId: "resource-a",
    jobId: "job-a",
    workOrderId: "work-a",
    startTime: "2035-04-05T09:00:00.000Z",
    endTime: "2035-04-05T10:00:00.000Z"
  });

  const [path, options] = calls.at(-1);
  const body = JSON.parse(options.body);
  assert.equal(path, "/api/assignments");
  assert.equal(options.method, "POST");
  assert.deepEqual(body, {
    id: "assignment-test-id",
    resourceId: "resource-a",
    jobId: null,
    workOrderId: "work-a",
    startTime: "2035-04-05T09:00:00.000Z",
    endTime: "2035-04-05T10:00:00.000Z"
  });
  assert.equal("organizationId" in body, false);
  assert.equal(created.id, "assignment-test-id");
});

test("job-only assignment creation preserves the optional work-order relationship", async () => {
  let posted;
  const controller = workflow().createController(async (path, options) => {
    if (options?.method === "POST") posted = JSON.parse(options.body);
    return { id: "assignment-test-id" };
  });
  const result = await controller.create({
    permissions: ["assignment:create", "job:read", "resource:read"]
  }, {
    resourceId: "resource-a",
    jobId: "job-a",
    workOrderId: "",
    startTime: "2035-04-05T09:00:00.000Z",
    endTime: "2035-04-05T10:00:00.000Z"
  });
  assert.equal(posted.jobId, "job-a");
  assert.equal(posted.workOrderId, null);
  assert.equal(result.id, "assignment-test-id");
});

test("assignment creation validates time order and does not call the API for invalid values", async () => {
  let calls = 0;
  const controller = workflow().createController(async () => { calls += 1; });
  const session = {
    permissions: ["assignment:create", "job:read", "resource:read", "workOrder:read"]
  };
  await assert.rejects(() => controller.create(session, {
    resourceId: "resource-a", jobId: "job-a", startTime: "2035-04-05T10:00:00Z", endTime: "2035-04-05T09:00:00Z"
  }), /End time must be after start time/);
  assert.equal(calls, 0);
});

test("assignment errors explain permissions, reference loss, and scheduling conflicts", () => {
  const ui = workflow();
  assert.match(ui.errorMessage({ status: 403 }), /does not have permission/);
  assert.match(ui.errorMessage({ status: 404 }), /no longer available in your organization/);
  assert.match(ui.errorMessage({ status: 409 }), /conflicts with existing data/);
  assert.match(ui.errorMessage({ message: "Resource is already assigned to an overlapping assignment" }), /already assigned during that time/);
});

test("assignment workspace exposes detail, read-only status, and escaped user data", () => {
  const ui = workflow();
  const markup = ui.renderWorkspace({
    canRead: true,
    assignments: [{
      id: "assignment-a",
      resourceId: "resource-a",
      jobId: "job-a",
      startTime: "2035-04-05T09:00:00Z",
      endTime: "2035-04-05T10:00:00Z",
      statusCode: "<active>"
    }],
    canCreate: true,
    jobs: [{ id: "job-a", title: "Job <A>" }],
    resources: [{ id: "resource-a", name: "Resource A" }],
    selectedAssignment: { id: "assignment-a", resourceId: "resource-a", jobId: "job-a", startTime: "2035-04-05T09:00:00Z", endTime: "2035-04-05T10:00:00Z", statusCode: "<active>" }
  });
  assert.match(markup, /Current assignments/);
  assert.match(markup, /Assignment details/);
  assert.match(markup, /Status is read-only/);
  assert.match(markup, /&lt;active&gt;/);
  assert.doesNotMatch(markup, /<active>/);
});
