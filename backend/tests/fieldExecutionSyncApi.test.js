const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createAppState, createHandler } = require("../src/app");
const { AuthenticationService } = require("../src/services/authenticationService");
const { WorkOrder } = require("../src/models/workOrder");

const AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";

function request(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      method,
      path,
      headers: {"Content-Type": "application/json", ...headers}
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("authenticated synchronization applies field execution and safely replays duplicates", async () => {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const token = authenticationService.issueToken({
    userId: "worker-1",
    organizationId: "demo-org",
    permissions: [
      "fieldVisit:create", "fieldVisit:read", "fieldVisit:update",
      "actualWork:create", "actualWork:read", "fieldExecution:sync", "event:emit"
    ]
  });
  const workOrder = new WorkOrder({
    id: "wo-sync-1",
    organizationId: "demo-org",
    jobId: "job-1",
    number: "WO-SYNC-1",
    title: "Offline synchronization"
  });
  const appointment = {
    id: "appointment-sync-1",
    organizationId: "demo-org",
    workOrderId: workOrder.id,
    memberIds: ["auditor-1"]
  };
  const state = createAppState({ authenticationService, workOrders: [workOrder], appointments: [appointment] });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  const auth = { Authorization: "Bearer " + token };

  const createOperation = {
    operationId: "offline-create-1",
    operationType: "fieldVisit.create",
    organizationId: "demo-org",
    actorUserId: "worker-1",
    deviceId: "device-1",
    capturedAt: "2026-10-01T10:00:05Z",
    occurredAt: "2026-10-01T10:00:00Z",
    expectedVersion: null,
    payload: {
      id: "visit-sync-1",
      appointmentId: appointment.id,
      workOrderId: workOrder.id,
      statusCode: "scheduled"
    }
  };

  try {
    const unauthorized = await request(server, "POST", "/api/field-execution/sync", { operations: [createOperation] });
    assert.equal(unauthorized.status, 401);

    const applied = await request(server, "POST", "/api/field-execution/sync", { operations: [createOperation] }, auth);
    assert.equal(applied.status, 200);
    assert.equal(applied.body.results[0].status, "applied");
    assert.equal(applied.body.results[0].result.version, 1);

    const duplicate = await request(server, "POST", "/api/field-execution/sync", { operations: [createOperation] }, auth);
    assert.equal(duplicate.body.results[0].status, "duplicate");

    const arrived = await request(server, "POST", "/api/field-execution/sync", {
      operations: [{
        operationId: "offline-arrive-1",
        operationType: "fieldVisit.arrive",
        organizationId: "demo-org",
        actorUserId: "worker-1",
        deviceId: "device-1",
        capturedAt: "2026-10-01T10:05:05Z",
        occurredAt: "2026-10-01T10:05:00Z",
        expectedVersion: 1,
        fieldVisitId: "visit-sync-1",
        payload: { statusCode: "arrived" }
      }]
    }, auth);
    assert.equal(arrived.body.results[0].status, "applied");

    const visit = await request(server, "GET", "/api/field-visits/visit-sync-1", null, auth);
    assert.equal(visit.body.version, 2);
    assert.equal(visit.body.arrivedAt, "2026-10-01T10:05:00.000Z");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("synchronization enforces sync permission and tenant/actor boundaries", async () => {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const state = createAppState({ authenticationService });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));

  const noSyncToken = authenticationService.issueToken({
    userId: "worker-1",
    organizationId: "demo-org",
    permissions: ["fieldVisit:create"]
  });
  const otherToken = authenticationService.issueToken({
    userId: "worker-2",
    organizationId: "other-org",
    permissions: ["fieldExecution:sync"]
  });
  const operation = {
    operationId: "cross-tenant-1",
    operationType: "fieldVisit.create",
    organizationId: "demo-org",
    actorUserId: "worker-1",
    deviceId: "device-1",
    capturedAt: "2026-10-01T10:00:05Z",
    occurredAt: "2026-10-01T10:00:00Z",
    expectedVersion: null,
    payload: {}
  };

  try {
    const forbidden = await request(server, "POST", "/api/field-execution/sync", { operations: [operation] }, {
      Authorization: "Bearer " + noSyncToken
    });
    assert.equal(forbidden.status, 403);

    const crossTenant = await request(server, "POST", "/api/field-execution/sync", { operations: [operation] }, {
      Authorization: "Bearer " + otherToken
    });
    assert.equal(crossTenant.status, 200);
    assert.equal(crossTenant.body.results[0].status, "rejected");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
