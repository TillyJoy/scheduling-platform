const crypto = require("node:crypto");

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

class AuthenticationService {
  constructor({
    secret = process.env.AUTH_SECRET,
    clock = () => new Date(),
    ttlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || DEFAULT_TTL_SECONDS)
  } = {}) {
    if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
      throw new Error("AUTH_SECRET must contain at least 32 bytes");
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
      throw new Error("AUTH_TOKEN_TTL_SECONDS must be at least 60 seconds");
    }

    this.secret = secret;
    this.clock = clock;
    this.ttlSeconds = ttlSeconds;
  }

  issueToken({ userId, organizationId, permissions = [], expiresInSeconds = this.ttlSeconds } = {}) {
    if (!userId || !organizationId) throw new Error("userId and organizationId are required");
    if (!Array.isArray(permissions)) throw new Error("permissions must be an array");
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60) {
      throw new Error("expiresInSeconds must be at least 60 seconds");
    }

    const issuedAt = Math.floor(this.clock().getTime() / 1000);
    const payload = {
      userId,
      organizationId,
      permissions: [...new Set(permissions)],
      iat: issuedAt,
      exp: issuedAt + expiresInSeconds,
      jti: crypto.randomUUID()
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    return encodedPayload + "." + this.#sign(encodedPayload);
  }

  authenticateAuthorizationHeader(header) {
    if (typeof header !== "string") throw this.#unauthorized();
    const [scheme, token, extra] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token || extra) throw this.#unauthorized();

    return this.verifyToken(token);
  }

  verifyToken(token) {
    if (typeof token !== "string") throw this.#unauthorized();

    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw this.#unauthorized();

    const expectedSignature = this.#sign(parts[0]);
    const suppliedSignature = Buffer.from(parts[1]);
    const expected = Buffer.from(expectedSignature);
    if (suppliedSignature.length !== expected.length || !crypto.timingSafeEqual(suppliedSignature, expected)) {
      throw this.#unauthorized();
    }

    let payload;
    try {
      payload = JSON.parse(base64UrlDecode(parts[0]));
    } catch {
      throw this.#unauthorized();
    }

    const now = Math.floor(this.clock().getTime() / 1000);
    if (
      !payload ||
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      !Array.isArray(payload.permissions) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      !payload.jti ||
      payload.exp <= now ||
      payload.iat > now + 60
    ) {
      throw this.#unauthorized();
    }

    return Object.freeze({
      userId: payload.userId,
      organizationId: payload.organizationId,
      permissions: [...new Set(payload.permissions)],
      authenticatedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
      sessionId: payload.jti,
      authMethod: "bearer"
    });
  }

  #sign(value) {
    return crypto.createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  #unauthorized() {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    return error;
  }
}

module.exports = { AuthenticationService, DEFAULT_TTL_SECONDS };
