const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createAppState, createHandler } = require("../src/app");
const { AuthenticationService } = require("../src/services/authenticationService");

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

function authenticatedServer() {
  const authenticationService = new AuthenticationService({ secret: AUTH_SECRET });
  const token = authenticationService.issueToken({
    userId: "demo-user",
    organizationId: "demo-org",
    permissions: ["appointment:create", "appointment:read"]
  });
  const state = createAppState({ authenticationService });
  const server = http.createServer(createHandler(state, { allowDevelopmentBypass: false }));
  return { server, token };
}

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
