const test = require("node:test");
const assert = require("node:assert/strict");
const { AuthenticationService } = require("../src/services/authenticationService");

const SECRET = "test-secret-that-is-at-least-32-bytes-long";

test("authentication service issues and verifies a tenant-scoped bearer token", () => {
  const now = new Date("2026-09-30T21:00:00.000Z");
  const service = new AuthenticationService({ secret: SECRET, clock: () => now });
  const token = service.issueToken({
    userId: "user-1",
    organizationId: "org-1",
    permissions: ["appointment:read", "appointment:read"]
  });

  const principal = service.authenticateAuthorizationHeader(`Bearer ${token}`);

  assert.equal(principal.userId, "user-1");
  assert.equal(principal.organizationId, "org-1");
  assert.deepEqual(principal.permissions, ["appointment:read"]);
  assert.equal(principal.authMethod, "bearer");
  assert.ok(principal.sessionId);
});

test("authentication service rejects missing, malformed, and tampered tokens", () => {
  const service = new AuthenticationService({ secret: SECRET });

  assert.throws(() => service.authenticateAuthorizationHeader(), /Authentication required/);
  assert.throws(() => service.authenticateAuthorizationHeader("Basic abc"), /Authentication required/);

  const token = service.issueToken({
    userId: "user-1",
    organizationId: "org-1",
    permissions: []
  });
  const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

  assert.throws(() => service.verifyToken(tampered), /Authentication required/);
});

test("authentication service rejects expired tokens", () => {
  let now = new Date("2026-09-30T21:00:00.000Z");
  const service = new AuthenticationService({ secret: SECRET, clock: () => now });
  const token = service.issueToken({
    userId: "user-1",
    organizationId: "org-1",
    permissions: [],
    expiresInSeconds: 60
  });

  now = new Date("2026-09-30T21:01:01.000Z");
  assert.throws(() => service.verifyToken(token), /Authentication required/);
});

test("authentication service requires a sufficiently strong signing secret", () => {
  assert.throws(
    () => new AuthenticationService({ secret: "too-short" }),
    /AUTH_SECRET must contain at least 32 bytes/
  );
});
