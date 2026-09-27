const assert = require("node:assert/strict");
const { DurationService } = require("../src/services/durationService");

const services = [
  { organizationId: "org-a", id: "amp", durationMinutes: 90, active: true },
  { organizationId: "org-a", id: "wx", durationMinutes: 60, active: true },
  { organizationId: "org-a", id: "inactive", durationMinutes: 30, active: false }
];

const durationService = new DurationService({
  services,
  rules: [
    { organizationId: "org-a", serviceIds: ["amp", "wx"], durationMinutes: 120 },
    { organizationId: "org-a", serviceIds: ["amp", "wx"], funderId: "funder-b", durationMinutes: 150 },
    { organizationId: "org-a", serviceIds: ["amp"], minUnitCount: 3, durationMinutes: 110 },
    { organizationId: "org-a", serviceIds: ["amp"], funderId: "funder-b", minUnitCount: 3, durationMinutes: 125 },
    { organizationId: "org-b", serviceIds: ["amp"], durationMinutes: 999 }
  ]
});

assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["amp"] }), 90);
assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["wx", "amp"] }), 120);
assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["amp", "wx"], funderId: "funder-b" }), 150);
assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["amp"], unitCount: 3 }), 110);
assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["amp"], funderId: "funder-b", unitCount: 3 }), 125);
assert.equal(durationService.calculate({ organizationId: "org-a", serviceIds: ["amp"], funderId: "funder-c", unitCount: 3 }), 110);

assert.throws(
  () => durationService.calculate({ organizationId: "org-a", serviceIds: ["inactive"] }),
  /Service not found or inactive/
);
assert.throws(
  () => durationService.calculate({ organizationId: "org-a", serviceIds: ["unknown"] }),
  /Service not found or inactive/
);
assert.throws(
  () => durationService.calculate({ organizationId: "org-a", serviceIds: [] }),
  /serviceIds must not be empty/
);

assert.throws(
  () => durationService.calculate({ organizationId: "org-b", serviceIds: ["amp"] }),
  /Service not found or inactive/
);
