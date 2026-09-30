const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createAppState, createHandler } = require("../src/app");

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ hostname: "127.0.0.1", port: address.port, method, path, headers: {"Content-Type": "application/json"} }, res => {
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

test("application exposes jobs, availability, and appointment conflict protection", async () => {
  const server = http.createServer(createHandler(createAppState()));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const jobs = await request(server, "GET", "/api/jobs");
    assert.equal(jobs.status, 200);
    assert.equal(jobs.body.length, 1);

    const slots = await request(server, "GET", "/api/availability?durationMinutes=90&start=2026-10-01T08:00:00Z&end=2026-10-01T17:00:00Z");
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
    });
    assert.equal(unavailableSlot.status, 409);
    assert.equal(unavailableSlot.body.error, "Requested appointment slot is not available");

    const created = await request(server, "POST", "/api/appointments", {...input, id: "appointment-1"});
    assert.equal(created.status, 201);

    const list = await request(server, "GET", "/api/appointments");
    assert.equal(list.body.length, 1);

    const updatedSlots = await request(server, "GET", `/api/availability?durationMinutes=90&start=${encodeURIComponent(slot.startTime)}&end=${encodeURIComponent(slot.endTime)}`);
    assert.equal(updatedSlots.status, 200);
    assert.equal(updatedSlots.body.length, 0);

    const fractionalDuration = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-fractional-duration",
      startTime: "2026-10-01T11:00:00Z",
      endTime: "2026-10-01T12:00:30Z"
    });
    assert.equal(fractionalDuration.status, 400);
    assert.equal(fractionalDuration.body.error, "Appointment duration must be a positive whole number of minutes");

    const crossOrg = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-2",
      organizationId: "other-org"
    });
    assert.equal(crossOrg.status, 403);

    const conflict = await request(server, "POST", "/api/appointments", {...input, id: "appointment-2", clientId: "client-2"});
    assert.equal(conflict.status, 409);

    const oversized = await request(server, "POST", "/api/appointments", {
      ...input,
      id: "appointment-3",
      notes: "x".repeat(1024 * 1024)
    });
    assert.equal(oversized.status, 413);

    const malformedJson = await request(server, "POST", "/api/appointments", "{\"organizationId\":");
    assert.equal(malformedJson.status, 400);
    assert.equal(malformedJson.body.error, "Request body must be valid JSON");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
