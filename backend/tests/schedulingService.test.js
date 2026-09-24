const assert = require("node:assert/strict");
const { SchedulingService } = require("../src/services/schedulingService");

const service = new SchedulingService({
  resources: [
    { id: "r1", name: "Auditor 1", qualifications: ["service-a"], active: true },
    { id: "r2", name: "Auditor 2", qualifications: ["service-b"], active: true }
  ],
  availabilities: [
    { id: "av1", resourceId: "r1", startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T12:00:00Z", available: true },
    { id: "av2", resourceId: "r2", startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T12:00:00Z", available: true }
  ],
  assignments: [
    { id: "a1", resourceId: "r1", startTime: "2026-10-01T10:00:00Z", endTime: "2026-10-01T11:00:00Z" }
  ]
});

const slots = service.findAvailableSlots({
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T12:00:00Z",
  durationMinutes: 60,
  slotMinutes: 60
});

assert.deepEqual(slots.map(slot => slot.resourceId), ["r1", "r1"]);
assert.deepEqual(slots.map(slot => slot.startTime.toISOString()), [
  "2026-10-01T09:00:00.000Z",
  "2026-10-01T11:00:00.000Z"
]);
assert.equal(slots[0].endTime.toISOString(), "2026-10-01T10:00:00.000Z");

const qualifiedSlots = service.findAvailableSlots({
  serviceIds: ["service-b"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60,
  slotMinutes: 30
});
assert.equal(qualifiedSlots.length, 1);
assert.equal(qualifiedSlots[0].resourceId, "r2");

const unavailable = new SchedulingService({
  resources: [{ id: "r3", qualifications: ["service-a"], active: true }],
  availabilities: [{ resourceId: "r3", startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T10:00:00Z", available: false }]
});
assert.equal(unavailable.findAvailableSlots({
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 30
}).length, 0);

assert.throws(() => service.findAvailableSlots({
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 0
}), /durationMinutes must be a positive integer/);
