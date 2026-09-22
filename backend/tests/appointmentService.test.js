const assert = require("node:assert/strict");
const { AppointmentService } = require("../src/services/appointmentService");

const principal = { userId: "user-a", organizationId: "org-a", permissions: ["appointment:create", "appointment:read"] };
const otherOrg = { userId: "user-b", organizationId: "org-b", permissions: ["appointment:create", "appointment:read"] };
const service = new AppointmentService();

service.create({
  principal,
  id: "a1",
  organizationId: "org-a",
  clientId: "client-1",
  propertyId: "property-1",
  memberIds: ["resource-1"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z"
});

assert.throws(() => service.create({
  principal,
  id: "a2",
  organizationId: "org-a",
  clientId: "client-2",
  propertyId: "property-2",
  memberIds: ["resource-1"],
  startTime: "2026-10-01T09:30:00Z",
  endTime: "2026-10-01T10:30:00Z"
}), /overlapping appointment/);

service.create({
  principal,
  id: "a3",
  organizationId: "org-a",
  clientId: "client-3",
  propertyId: "property-3",
  memberIds: ["resource-1"],
  startTime: "2026-10-01T10:00:00Z",
  endTime: "2026-10-01T11:00:00Z"
});

assert.equal(service.list({ principal }).length, 2);
assert.throws(() => service.get({ principal: otherOrg, appointmentId: "a1" }), /Not authorized/);
assert.throws(() => service.create({
  principal,
  id: "a4",
  organizationId: "org-b",
  clientId: "client-4",
  propertyId: "property-4",
  startTime: "2026-10-01T12:00:00Z",
  endTime: "2026-10-01T13:00:00Z"
}), /Not authorized/);

console.log("Appointment service tests passed.");
