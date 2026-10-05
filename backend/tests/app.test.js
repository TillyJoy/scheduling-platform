const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createAppState, createHandler } = require("../src/app");
const { AuthenticationService } = require("../src/services/authenticationService");
const { WorkOrder } = require("../src/models/workOrder");

const AUTH_SECRET = "test-secret-that-is-at-least-32-bytes-long";

function requestText(server, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ hostname: "127.0.0.1", port: address.port, method, path, headers }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

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
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function authenticatedServer(permissions = ["job:read", "appointment:create", "appointment:read"]) {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const token = authenticationService.issueToken({
    userId: "demo-user",
    organizationId: "demo-org",
    permissions
  });
  const state = createAppState({ authenticationService });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  return { server, token };
}

test("authenticated principal context is trusted and client organization headers cannot override it", async () => {
  const { server, token } = authenticatedServer();
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const context = await request(server, "GET", "/api/auth/me", null, {
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": "attacker-org"
    });
    assert.equal(context.status, 200);
    assert.equal(context.body.userId, "demo-user");
    assert.equal(context.body.organizationId, "demo-org");
    assert.deepEqual(context.body.permissions, ["job:read", "appointment:create", "appointment:read"]);

    const jobs = await request(server, "GET", "/api/jobs", null, {
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": "attacker-org"
    });
    assert.equal(jobs.status, 200);
    assert.equal(jobs.body[0].organizationId, "demo-org");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("resource API uses trusted organization and resource permission boundaries", async () => {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const state = createAppState({
    resources: [
      { id: "resource-demo", organizationId: "demo-org", active: true },
      { id: "resource-other", organizationId: "other-org", active: true }
    ],
    authenticationService
  });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const token = authenticationService.issueToken({
      userId: "resource-reader",
      organizationId: "demo-org",
      permissions: ["resource:read"]
    });
    const response = await request(server, "GET", "/api/resources", null, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map(resource => resource.id), ["resource-demo"]);

    const forbiddenToken = authenticationService.issueToken({
      userId: "job-reader",
      organizationId: "demo-org",
      permissions: ["job:read"]
    });
    const forbidden = await request(server, "GET", "/api/resources", null, {
      Authorization: `Bearer ${forbiddenToken}`
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("protected API routes require authentication", async () => {
  const { server, token } = authenticatedServer();
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const unauthorized = await request(server, "GET", "/api/jobs");
    assert.equal(unauthorized.status, 401);

    const authorized = await request(server, "GET", "/api/jobs", null, {
      Authorization: `Bearer ${token}`
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("application composition wires organization-specific appointment status configuration", () => {
  const state = createAppState();
  const permissions = ["appointment:create", "appointment:read", "status:create", "status:read", "status:update"];

  state.statusConfigurationService.createStatus({
    principal: { userId: "status-admin-a", organizationId: "org-a", permissions },
    id: "appointment-cancelled-a",
    organizationId: "org-a",
    entityType: "appointment",
    code: "closed",
    label: "Closed",
    category: "cancelled"
  });
  state.statusConfigurationService.createStatus({
    principal: { userId: "status-admin-b", organizationId: "org-b", permissions },
    id: "appointment-closed-b",
    organizationId: "org-b",
    entityType: "appointment",
    code: "closed",
    label: "Closed",
    category: "completed"
  });

  const appointmentStatus = state.appointmentStatusResolver({
    organizationId: "org-a",
    entityType: "appointment",
    statusCode: "closed"
  });
  assert.equal(appointmentStatus.organizationId, "org-a");
  assert.equal(appointmentStatus.category, "cancelled");

  const otherOrganizationStatus = state.appointmentStatusResolver({
    organizationId: "org-b",
    entityType: "appointment",
    statusCode: "closed"
  });
  assert.equal(otherOrganizationStatus.organizationId, "org-b");
  assert.equal(otherOrganizationStatus.category, "completed");
});

test("appointment conflict behavior uses organization-specific configured status semantics", () => {
  const state = createAppState({
    resources: [{ id: "shared-resource", qualifications: ["service-a"], active: true }]
  });
  const permissions = ["appointment:create", "appointment:read"];

  state.statusConfigurationService.createStatus({
    principal: {
      userId: "status-admin-a",
      organizationId: "org-a",
      permissions: ["status:create", "status:read", "status:update"]
    },
    id: "appointment-cancelled-a",
    organizationId: "org-a",
    entityType: "appointment",
    code: "closed",
    label: "Closed",
    category: "cancelled"
  });
  state.statusConfigurationService.createStatus({
    principal: {
      userId: "status-admin-b",
      organizationId: "org-b",
      permissions: ["status:create", "status:read", "status:update"]
    },
    id: "appointment-closed-b",
    organizationId: "org-b",
    entityType: "appointment",
    code: "closed",
    label: "Closed",
    category: "completed"
  });

  const principalA = { userId: "user-a", organizationId: "org-a", permissions };
  const principalB = { userId: "user-b", organizationId: "org-b", permissions };

  state.appointmentService.create({
    principal: principalA,
    id: "appointment-a-1",
    organizationId: "org-a",
    clientId: "client-a",
    propertyId: "property-a",
    serviceIds: ["service-a"],
    memberIds: ["shared-resource"],
    startTime: "2026-10-01T10:00:00Z",
    endTime: "2026-10-01T11:00:00Z",
    status: "closed"
  });

  const orgASecond = state.appointmentService.create({
    principal: principalA,
    id: "appointment-a-2",
    organizationId: "org-a",
    clientId: "client-a-2",
    propertyId: "property-a-2",
    serviceIds: ["service-a"],
    memberIds: ["shared-resource"],
    startTime: "2026-10-01T10:30:00Z",
    endTime: "2026-10-01T11:30:00Z",
    status: "scheduled"
  });
  assert.equal(orgASecond.id, "appointment-a-2");

  state.appointmentService.create({
    principal: principalB,
    id: "appointment-b-1",
    organizationId: "org-b",
    clientId: "client-b",
    propertyId: "property-b",
    serviceIds: ["service-a"],
    memberIds: ["shared-resource"],
    startTime: "2026-10-01T10:00:00Z",
    endTime: "2026-10-01T11:00:00Z",
    status: "closed"
  });

  assert.throws(() => state.appointmentService.create({
    principal: principalB,
    id: "appointment-b-2",
    organizationId: "org-b",
    clientId: "client-b-2",
    propertyId: "property-b-2",
    serviceIds: ["service-a"],
    memberIds: ["shared-resource"],
    startTime: "2026-10-01T10:30:00Z",
    endTime: "2026-10-01T11:30:00Z",
    status: "scheduled"
  }), /Resource is already assigned to an overlapping appointment/);
});

test("appointment status configuration preserves default behavior when status is not configured", () => {
  const state = createAppState({
    resources: [{ id: "default-resource", qualifications: ["service-a"], active: true }]
  });
  const principal = { userId: "user-default", organizationId: "org-default", permissions: ["appointment:create", "appointment:read"] };

  state.appointmentService.create({
    principal,
    id: "appointment-default-1",
    organizationId: "org-default",
    clientId: "client-default",
    propertyId: "property-default",
    serviceIds: ["service-a"],
    memberIds: ["default-resource"],
    startTime: "2026-10-01T12:00:00Z",
    endTime: "2026-10-01T13:00:00Z",
    status: "cancelled"
  });

  assert.throws(() => state.appointmentService.create({
    principal,
    id: "appointment-default-2",
    organizationId: "org-default",
    clientId: "client-default-2",
    propertyId: "property-default-2",
    serviceIds: ["service-a"],
    memberIds: ["default-resource"],
    startTime: "2026-10-01T12:30:00Z",
    endTime: "2026-10-01T13:30:00Z",
    status: "scheduled"
  }), /Resource is already assigned to an overlapping appointment/);
});

test("application exposes jobs, availability, and appointment conflict protection", async () => {
  const { server, token } = authenticatedServer();
  await new Promise(resolve => server.listen(0, resolve));
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const jobs = await request(server, "GET", "/api/jobs", null, auth);
    assert.equal(jobs.status, 200);
    assert.equal(jobs.body.length, 1);

    const slots = await request(server, "GET", "/api/availability?durationMinutes=90&start=2026-10-01T08:00:00Z&end=2026-10-01T17:00:00Z", null, auth);
    assert.equal(slots.status, 200);
    assert.ok(slots.body.length > 0);

    const slot = slots.body[0];
    const input = {
      organizationId: "demo-org",
      clientId: "client-1",
      propertyId: "property-1",
      serviceIds: ["AMP"],
      memberIds: [slot.resourceId],
      startTime: slot.startTime,
      endTime: slot.endTime
    };

    const unavailableSlot = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-unavailable",
      startTime: "2026-10-02T08:30:00Z",
      endTime: "2026-10-02T10:00:00Z"
    }, auth);
    assert.equal(unavailableSlot.status, 409);
    assert.equal(unavailableSlot.body.error, "Requested appointment slot is not available");

    const created = await request(server, "POST", "/api/appointments", {...input, id: "appointment-1"}, auth);
    assert.equal(created.status, 201);

    const list = await request(server, "GET", "/api/appointments", null, auth);
    assert.equal(list.body.length, 1);

    const updatedSlots = await request(server, "GET", `/api/availability?durationMinutes=90&start=${encodeURIComponent(slot.startTime)}&end=${encodeURIComponent(slot.endTime)}`, null, auth);
    assert.equal(updatedSlots.status, 200);
    assert.equal(updatedSlots.body.length, 0);

    const fractionalDuration = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-fractional-duration",
      startTime: "2026-10-01T11:00:00Z",
      endTime: "2026-10-01T12:00:30Z"
    }, auth);
    assert.equal(fractionalDuration.status, 400);
    assert.equal(fractionalDuration.body.error, "Appointment duration must be a positive whole number of minutes");

    const crossOrg = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-2",
      organizationId: "other-org"
    }, auth);
    assert.equal(crossOrg.status, 403);

    const conflict = await request(server, "POST", "/api/appointments", {...input, id: "appointment-2", clientId: "client-2"}, auth);
    assert.equal(conflict.status, 409);

    const oversized = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-3",
      notes: "x".repeat(1024 * 1024)
    }, auth);
    assert.equal(oversized.status, 413);

    const malformedJson = await request(server, "POST", "/api/appointments", "{\"organizationId\":", auth);
    assert.equal(malformedJson.status, 400);
    assert.equal(malformedJson.body.error, "Request body must be valid JSON");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("authenticated scheduler can list and create work orders for the selected job", async () => {
  const { server, token } = authenticatedServer([
    "job:read",
    "workOrder:create",
    "workOrder:read"
  ]);
  await new Promise(resolve => server.listen(0, resolve));
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const jobs = await request(server, "GET", "/api/jobs", null, auth);
    assert.equal(jobs.status, 200);
    assert.equal(jobs.body[0].id, "job-1");
    assert.equal(jobs.body[0].clientId, "client-1");
    assert.equal(jobs.body[0].metadata.propertyId, "property-1");

    const initial = await request(server, "GET", "/api/work-orders?jobId=job-1", null, auth);
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, []);

    const created = await request(server, "POST", "/api/work-orders", {
      id: "wo-browser-1",
      jobId: "job-1",
      title: "Browser scheduling work order"
    }, auth);
    assert.equal(created.status, 201);
    assert.equal(created.body.jobId, "job-1");
    assert.equal(created.body.number, "WO-1");

    const listed = await request(server, "GET", "/api/work-orders?jobId=job-1", null, auth);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].id, "wo-browser-1");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("application serves the scheduler shell and frontend asset", async () => {
  const server = http.createServer(createHandler(createAppState(), { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const page = await requestText(server, "GET", "/");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /^text\/html/);
    assert.match(page.body, /<title>Scheduling Platform<\/title>/);
    assert.match(page.body, /<script src="\.\/app\.js"><\/script>/);

    const script = await requestText(server, "GET", "/app.js");
    assert.equal(script.status, 200);
    assert.match(script.headers["content-type"], /^text\/javascript/);
    assert.match(script.body, /\/api\/availability/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});


test("authenticated field execution API records a visit and actual work", async () => {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const token = authenticationService.issueToken({
    userId: "field-worker-1",
    organizationId: "demo-org",
    permissions: [
      "fieldVisit:create",
      "fieldVisit:read",
      "fieldVisit:update",
      "actualWork:create",
      "actualWork:read",
      "event:emit"
    ]
  });
  const workOrder = new WorkOrder({
    id: "wo-field-1",
    organizationId: "demo-org",
    jobId: "job-1",
    number: "WO-1",
    title: "Field execution test"
  });
  const appointment = {
    id: "appointment-field-1",
    organizationId: "demo-org",
    workOrderId: workOrder.id,
    memberIds: ["auditor-1"]
  };
  const state = createAppState({
    authenticationService,
    workOrders: [workOrder],
    appointments: [appointment]
  });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const unauthorized = await request(server, "GET", "/api/field-visits");
    assert.equal(unauthorized.status, 401);

    const created = await request(server, "POST", "/api/field-visits", {
      id: "visit-api-1",
      appointmentId: appointment.id,
      workOrderId: workOrder.id,
      notes: "Arrival notes",
      observations: [{ code: "condition", value: "normal" }]
    }, auth);
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.resourceIds, ["auditor-1"]);

    const arrived = await request(server, "POST", "/api/field-visits/visit-api-1/arrive", {
      arrivedAt: "2026-10-01T09:55:00Z",
      statusCode: "arrived"
    }, auth);
    assert.equal(arrived.status, 200);

    const started = await request(server, "POST", "/api/field-visits/visit-api-1/start", {
      actualStartTime: "2026-10-01T10:00:00Z",
      statusCode: "in_progress"
    }, auth);
    assert.equal(started.status, 200);

    const work = await request(server, "POST", "/api/actual-work", {
      id: "actual-api-1",
      fieldVisitId: "visit-api-1",
      workOrderId: workOrder.id,
      resourceId: "auditor-1",
      description: "Performed configured work",
      actualStartTime: "2026-10-01T10:05:00Z",
      actualEndTime: "2026-10-01T11:00:00Z",
      quantity: 1,
      unit: "unit"
    }, auth);
    assert.equal(work.status, 201);

    const completed = await request(server, "POST", "/api/field-visits/visit-api-1/complete", {
      actualEndTime: "2026-10-01T11:00:00Z",
      completionData: { requiredField: true },
      statusCode: "completed"
    }, auth);
    assert.equal(completed.status, 200);
    assert.equal(completed.body.completedByUserId, "field-worker-1");
    assert.equal(completed.body.completionData.requiredField, true);

    const events = state.domainEvents.filter(event => event.entityId === "visit-api-1");
    assert.ok(events.some(event => event.eventType === "field_visit.created"));
    assert.ok(events.some(event => event.eventType === "field_visit.arrived"));
    assert.ok(events.some(event => event.eventType === "field_visit.started"));
    assert.ok(events.some(event => event.eventType === "field_visit.completed"));

    const audit = state.auditEvents.filter(event => event.entityId === "visit-api-1");
    assert.ok(audit.length >= 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("field execution API enforces tenant and permission boundaries", async () => {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const state = createAppState({ authenticationService });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const noPermissionToken = authenticationService.issueToken({
      userId: "reader",
      organizationId: "demo-org",
      permissions: ["fieldVisit:read"]
    });
    const forbidden = await request(server, "POST", "/api/field-visits", {
      id: "forbidden-visit",
      appointmentId: "missing",
      workOrderId: "missing"
    }, { Authorization: `Bearer ${noPermissionToken}` });
    assert.equal(forbidden.status, 403);

    const otherTenantToken = authenticationService.issueToken({
      userId: "other-user",
      organizationId: "other-org",
      permissions: ["fieldVisit:read"]
    });
    const otherTenant = await request(server, "GET", "/api/field-visits", null, {
      Authorization: `Bearer ${otherTenantToken}`
    });
    assert.equal(otherTenant.status, 200);
    assert.deepEqual(otherTenant.body, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
