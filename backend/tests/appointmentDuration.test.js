const assert = require("node:assert/strict");
const { AppointmentService } = require("../src/services/appointmentService");
const { DurationService } = require("../src/services/durationService");

const principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["appointment:create"]
};

const durationService = new DurationService({
  services: [
    { organizationId: "org-a", id: "amp", durationMinutes: 90, active: true },
    { organizationId: "org-a", id: "wx", durationMinutes: 60, active: true }
  ],
  rules: [
    { organizationId: "org-a", serviceIds: ["amp", "wx"], durationMinutes: 120 },
    { organizationId: "org-a", serviceIds: ["amp", "wx"], funderId: "funder-b", durationMinutes: 150 }
  ]
});

const service = new AppointmentService({ durationService });

const appointment = service.create({
  principal,
  id: "appointment-1",
  organizationId: "org-a",
  clientId: "client-1",
  propertyId: "property-1",
  serviceIds: ["amp", "wx"],
  memberIds: ["resource-1"],
  startTime: "2026-10-01T09:00:00Z"
});

assert.equal(appointment.startTime.toISOString(), "2026-10-01T09:00:00.000Z");
assert.equal(appointment.endTime.toISOString(), "2026-10-01T11:00:00.000Z");

const funderAppointment = service.create({
  principal,
  id: "appointment-2",
  organizationId: "org-a",
  clientId: "client-2",
  propertyId: "property-2",
  serviceIds: ["amp", "wx"],
  memberIds: ["resource-2"],
  startTime: "2026-10-01T09:00:00Z",
  funderId: "funder-b"
});

assert.equal(funderAppointment.endTime.toISOString(), "2026-10-01T11:30:00.000Z");

assert.throws(
  () => service.create({
    principal,
    id: "appointment-3",
    organizationId: "org-a",
    clientId: "client-3",
    propertyId: "property-3",
    serviceIds: ["unknown"],
    memberIds: ["resource-3"],
    startTime: "2026-10-01T09:00:00Z"
  }),
  /Service not found or inactive/
);

const explicitEndService = new AppointmentService({
  durationService: new DurationService({
    services: [{ organizationId: "org-a", id: "amp", durationMinutes: 90, active: true }]
  })
});

const explicit = explicitEndService.create({
  principal,
  id: "appointment-4",
  organizationId: "org-a",
  clientId: "client-4",
  propertyId: "property-4",
  serviceIds: ["amp"],
  memberIds: ["resource-4"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T09:30:00Z"
});

assert.equal(explicit.endTime.toISOString(), "2026-10-01T09:30:00.000Z");

assert.throws(
  () => explicitEndService.create({
    principal,
    id: "appointment-5",
    organizationId: "org-a",
    clientId: "client-5",
    propertyId: "property-5",
    serviceIds: ["amp", "amp"],
    memberIds: ["resource-5"],
    startTime: "2026-10-01T10:00:00Z",
    endTime: "2026-10-01T10:30:00Z"
  }),
  /serviceIds must not contain duplicates/
);
