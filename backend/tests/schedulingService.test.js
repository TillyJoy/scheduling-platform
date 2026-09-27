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


const teamConflictService = new SchedulingService({
  resources: [{ id: "r4", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r4",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T12:00:00Z"
  }],
  appointments: [{
    id: "appointment-1",
    organizationId: "org-a",
    teamId: "team-1",
    memberIds: ["other-resource"],
    startTime: "2026-10-01T10:00:00Z",
    endTime: "2026-10-01T11:00:00Z",
    status: "scheduled"
  }]
});

assert.deepEqual(teamConflictService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r4"],
  serviceIds: ["service-a"],
  teamId: "team-1",
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T12:00:00Z",
  durationMinutes: 60,
  slotMinutes: 60
}).map(slot => slot.startTime.toISOString()), [
  "2026-10-01T09:00:00.000Z",
  "2026-10-01T11:00:00.000Z"
]);

const crossOrganizationTeamService = new SchedulingService({
  resources: [{ id: "r6", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r6",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z"
  }],
  appointments: [{
    id: "appointment-other-org",
    organizationId: "org-b",
    teamId: "team-1",
    memberIds: ["other-resource"],
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    status: "scheduled"
  }]
});

assert.equal(crossOrganizationTeamService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r6"],
  serviceIds: ["service-a"],
  teamId: "team-1",
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60
}).length, 1);

const unknownHoldStatusService = new SchedulingService({
  resources: [{ id: "r5", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r5",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z"
  }],
  holds: [{
    id: "hold-unknown",
    organizationId: "org-a",
    resourceIds: ["r5"],
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    status: "renamed-active",
    expiresAt: "2026-10-01T09:30:00Z"
  }],
  statusResolver: () => null,
  clock: () => new Date("2026-10-01T09:00:00Z")
});

assert.equal(unknownHoldStatusService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r5"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60
}).length, 0);

const cancelledHoldService = new SchedulingService({
  resources: [{ id: "r7", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r7",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z"
  }],
  holds: [{
    id: "hold-cancelled",
    organizationId: "org-a",
    resourceIds: ["r7"],
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    status: "cancelled",
    expiresAt: "2026-10-01T09:30:00Z"
  }],
  statusResolver: () => null,
  clock: () => new Date("2026-10-01T09:00:00Z")
});

assert.equal(cancelledHoldService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r7"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60
}).length, 1);

const pendingHoldStatusService = new SchedulingService({
  resources: [{ id: "r8", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r8",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z"
  }],
  holds: [{
    id: "hold-pending",
    organizationId: "org-a",
    resourceIds: ["r8"],
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    status: "pending",
    expiresAt: "2026-10-01T09:30:00Z"
  }],
  statusResolver: () => ({ category: "pending" }),
  clock: () => new Date("2026-10-01T09:00:00Z")
});

assert.equal(pendingHoldStatusService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r8"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60
}).length, 0);

const pendingHoldWithoutResolverService = new SchedulingService({
  resources: [{ id: "r9", qualifications: ["service-a"], active: true }],
  availabilities: [{
    resourceId: "r9",
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z"
  }],
  holds: [{
    id: "hold-pending-no-resolver",
    organizationId: "org-a",
    resourceIds: ["r9"],
    startTime: "2026-10-01T09:00:00Z",
    endTime: "2026-10-01T10:00:00Z",
    status: "pending",
    expiresAt: "2026-10-01T09:30:00Z"
  }],
  clock: () => new Date("2026-10-01T09:00:00Z")
});

assert.equal(pendingHoldWithoutResolverService.findAvailableSlots({
  organizationId: "org-a",
  resourceIds: ["r9"],
  serviceIds: ["service-a"],
  startTime: "2026-10-01T09:00:00Z",
  endTime: "2026-10-01T10:00:00Z",
  durationMinutes: 60
}).length, 0);
