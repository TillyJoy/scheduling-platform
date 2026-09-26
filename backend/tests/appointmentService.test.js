const assert = require("node:assert/strict");
const { AppointmentService } = require("../src/services/appointmentService");
const { SchedulingService } = require("../src/services/schedulingService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["appointment:create", "appointment:confirm", "appointment:cancel", "appointment:read"]
};
const otherOrg = {
  userId: "user-b",
  organizationId: "org-b",
  permissions: ["appointment:create", "appointment:confirm", "appointment:cancel", "appointment:read"]
};

const schedulingHolds = [];
const appointmentStore = new Map();
const schedulingService = new SchedulingService({
  resources: [{ id: "resource-1", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "resource-1",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T12:00:00Z"
  }],
  assignments: [],
  holds: schedulingHolds,
  appointments: appointmentStore
});

const service = new AppointmentService({
  appointmentStore,
  schedulingService,
  schedulingHolds,
  clock: () => new Date("2026-10-01T08:00:00Z")
});

const hold = service.createHold({
  principal,
  id: "hold-1",
  organizationId: "org-a",
  clientId: "client-1",
  propertyId: "property-1",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
});

assert.equal(hold.status, "active");

assert.throws(() => service.createHold({
  principal,
  id: "hold-invalid",
  organizationId: "org-a",
  clientId: "client-invalid",
  propertyId: "property-invalid",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "not-a-date",
  endTime: "2026-10-01T10:30:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
}), /endTime must be after startTime/);

assert.throws(() => service.createHold({
  principal,
  id: "hold-2",
  organizationId: "org-a",
  clientId: "client-2",
  propertyId: "property-2",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:30:00Z",
  endTime: "2026-10-01T10:30:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
}), /no longer available/);

const appointment = service.confirmHold({ principal, holdId: "hold-1" });
assert.equal(appointment.status, "scheduled");
assert.equal(appointment.id, "hold-1");
assert.equal(service.get({ principal, appointmentId: "hold-1" }).id, "hold-1");

assert.throws(() => service.createHold({
  principal,
  id: "hold-overlap",
  organizationId: "org-a",
  clientId: "client-overlap",
  propertyId: "property-overlap",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:30:00Z",
  endTime: "2026-10-01T10:30:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
}), /no longer available/);

assert.throws(() => service.get({ principal: otherOrg, appointmentId: "hold-1" }), /Appointment not found/);

service.createHold({
  principal,
  id: "hold-3",
  organizationId: "org-a",
  clientId: "client-3",
  propertyId: "property-3",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T11:00:00Z",
  endTime: "2026-10-01T12:00:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
});
assert.equal(service.cancelHold({ principal, holdId: "hold-3" }).status, "cancelled");

let now = new Date("2026-10-01T08:00:00Z");
const expiringService = new AppointmentService({
  schedulingService: new SchedulingService({
    resources: [{ id: "resource-1", qualifications: ["service-a"], active: true }],
    availabilities: [{ resourceId: "resource-1", startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T10:00:00Z" }]
  }),
  clock: () => now
});
expiringService.createHold({
  principal,
  id: "hold-4",
  organizationId: "org-a",
  clientId: "client-4",
  propertyId: "property-4",
  memberIds: ["resource-1"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  expiresAt: "2026-10-01T08:15:00Z"
});
now = new Date("2026-10-01T08:30:00Z");
assert.throws(() => expiringService.confirmHold({ principal, holdId: "hold-4" }), /no longer active/);
