const assert = require("node:assert/strict");
const { DurationService } = require("../src/services/durationService");

const services = [
  { id: "amp", durationMinutes: 90, active: true },
  { id: "wx", durationMinutes: 60, active: true },
  { id: "inactive", durationMinutes: 30, active: false }
];

const durationService = new DurationService({
  services,
  rules: [
    { serviceIds: ["amp", "wx"], durationMinutes: 120 },
    { serviceIds: ["amp", "wx"], funderId: "funder-b", durationMinutes: 150 },
    { serviceIds: ["amp"], minUnitCount: 3, durationMinutes: 110 },
    { serviceIds: ["amp"], funderId: "funder-b", minUnitCount: 3, durationMinutes: 125 }
  ]
});

assert.equal(durationService.calculate({ serviceIds: ["amp"] }), 90);
assert.equal(durationService.calculate({ serviceIds: ["wx", "amp"] }), 120);
assert.equal(durationService.calculate({ serviceIds: ["amp", "wx"], funderId: "funder-b" }), 150);
assert.equal(durationService.calculate({ serviceIds: ["amp"], unitCount: 3 }), 110);
assert.equal(durationService.calculate({ serviceIds: ["amp"], funderId: "funder-b", unitCount: 3 }), 125);
assert.equal(durationService.calculate({ serviceIds: ["amp"], funderId: "funder-c", unitCount: 3 }), 110);

assert.throws(
  () => durationService.calculate({ serviceIds: ["inactive"] }),
  /Service not found or inactive/
);
assert.throws(
  () => durationService.calculate({ serviceIds: ["unknown"] }),
  /Service not found or inactive/
);
assert.throws(
  () => durationService.calculate({ serviceIds: [] }),
  /serviceIds must not be empty/
);
