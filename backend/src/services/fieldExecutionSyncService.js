const crypto = require("node:crypto");

class FieldExecutionSyncService {
  constructor({ fieldVisitService, actualWorkService, operationStore = new Map(), authorize = FieldExecutionSyncService.defaultAuthorize } = {}) {
    if (!fieldVisitService) throw new Error("fieldVisitService is required");
    if (!actualWorkService) throw new Error("actualWorkService is required");
    this.fieldVisitService = fieldVisitService;
    this.actualWorkService = actualWorkService;
    this.operationStore = operationStore;
    this.authorize = authorize;
  }

  sync({ principal, operations = [] } = {}) {
    this.#requirePrincipal(principal);
    this.#authorize(principal, "fieldExecution:sync", principal.organizationId);
    if (!Array.isArray(operations)) throw new Error("operations must be an array");
    return operations.map(operation => this.#applyOne(principal, operation));
  }

  #applyOne(principal, operation) {
    let normalized;
    try {
      normalized = this.#validateOperation(principal, operation);
    } catch (error) {
      return { operationId: operation?.operationId ?? null, status: error.statusCode === 403 ? "rejected" : "rejected", error: error.message };
    }

    const key = FieldExecutionSyncService.storageKey(principal.organizationId, normalized.operationId);
    const fingerprint = FieldExecutionSyncService.fingerprint(normalized);
    const previous = this.operationStore.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return { operationId: normalized.operationId, status: "conflict", conflictType: "operation_payload_mismatch", error: "Operation ID has already been used with different data" };
      }
      return { operationId: normalized.operationId, status: "duplicate", result: previous.result };
    }

    try {
      const result = this.#dispatch(principal, normalized);
      const stored = { fingerprint, result: this.#summarizeResult(result) };
      this.operationStore.set(key, stored);
      return { operationId: normalized.operationId, status: "applied", result: stored.result };
    } catch (error) {
      return {
        operationId: normalized.operationId,
        status: error.statusCode === 409 ? "conflict" : "rejected",
        conflictType: error.statusCode === 409 ? "state_version" : undefined,
        error: error.message
      };
    }
  }

  #dispatch(principal, operation) {
    const common = { principal, ...(operation.payload || {}) };
    switch (operation.operationType) {
      case "fieldVisit.create":
        if (operation.expectedVersion !== null) throw FieldExecutionSyncService.conflict("Create operations cannot have an expected version");
        return this.fieldVisitService.create({ ...common, organizationId: principal.organizationId });
      case "fieldVisit.arrive":
        this.#assertVersion(principal, operation);
        return this.fieldVisitService.arrive({ ...common, fieldVisitId: operation.fieldVisitId, arrivedAt: operation.occurredAt });
      case "fieldVisit.start":
        this.#assertVersion(principal, operation);
        return this.fieldVisitService.start({ ...common, fieldVisitId: operation.fieldVisitId, actualStartTime: operation.occurredAt });
      case "fieldVisit.stop":
        this.#assertVersion(principal, operation);
        return this.fieldVisitService.stop({ ...common, fieldVisitId: operation.fieldVisitId, actualEndTime: operation.occurredAt });
      case "fieldVisit.complete":
        this.#assertVersion(principal, operation);
        return this.fieldVisitService.complete({ ...common, fieldVisitId: operation.fieldVisitId, completedAt: operation.occurredAt });
      case "fieldVisit.closeIncomplete":
        this.#assertVersion(principal, operation);
        return this.fieldVisitService.closeIncomplete({ ...common, fieldVisitId: operation.fieldVisitId, closedAt: operation.occurredAt });
      case "actualWork.create":
        if (operation.expectedVersion !== null) throw FieldExecutionSyncService.conflict("Actual work creation does not use a version precondition");
        return this.actualWorkService.create({ ...common, organizationId: principal.organizationId });
      default:
        throw new Error("Unsupported field execution operation type");
    }
  }

  #assertVersion(principal, operation) {
    if (!Number.isInteger(operation.expectedVersion) || operation.expectedVersion < 1) {
      throw FieldExecutionSyncService.conflict("A valid expectedVersion is required for field visit changes");
    }
    const visit = this.fieldVisitService.get({ principal, fieldVisitId: operation.fieldVisitId });
    if (visit.version !== operation.expectedVersion) {
      throw FieldExecutionSyncService.conflict(`Field visit version conflict: expected ${operation.expectedVersion}, current ${visit.version}`);
    }
  }

  #validateOperation(principal, operation) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new Error("Operation must be an object");
    for (const field of ["operationId", "operationType", "actorUserId", "deviceId", "capturedAt", "occurredAt"]) {
      if (!operation[field]) throw new Error(`${field} is required`);
    }
    if (operation.actorUserId !== principal.userId) {
      const error = new Error("Operation actor does not match the authenticated principal");
      error.statusCode = 403;
      throw error;
    }
    if (operation.organizationId && operation.organizationId !== principal.organizationId) {
      const error = new Error("Operation organization does not match the authenticated principal");
      error.statusCode = 403;
      throw error;
    }
    const capturedAt = new Date(operation.capturedAt);
    const occurredAt = new Date(operation.occurredAt);
    if (Number.isNaN(capturedAt.getTime())) throw new Error("capturedAt must be a valid date");
    if (Number.isNaN(occurredAt.getTime())) throw new Error("occurredAt must be a valid date");
    if (!operation.payload || typeof operation.payload !== "object" || Array.isArray(operation.payload)) throw new Error("payload must be an object");
    if (operation.expectedVersion !== null && operation.expectedVersion !== undefined && (!Number.isInteger(operation.expectedVersion) || operation.expectedVersion < 1)) {
      throw new Error("expectedVersion must be a positive integer or null");
    }
    return {
      operationId: operation.operationId,
      operationType: operation.operationType,
      actorUserId: operation.actorUserId,
      deviceId: operation.deviceId,
      capturedAt: capturedAt.toISOString(),
      occurredAt: occurredAt.toISOString(),
      expectedVersion: operation.expectedVersion ?? null,
      fieldVisitId: operation.fieldVisitId ?? operation.payload.fieldVisitId ?? null,
      organizationId: principal.organizationId,
      payload: structuredClone(operation.payload)
    };
  }

  #summarizeResult(result) {
    return {
      id: result.id,
      version: result.version ?? null,
      statusCode: result.statusCode ?? null,
      fieldVisitId: result.fieldVisitId ?? result.id ?? null,
      actualEndTime: result.actualEndTime?.toISOString?.() ?? result.actualEndTime ?? null,
      completedAt: result.completedAt?.toISOString?.() ?? result.completedAt ?? null,
      closedAt: result.closedAt?.toISOString?.() ?? result.closedAt ?? null
    };
  }

  #authorize(principal, action, organizationId) {
    if (!this.authorize(principal, action, organizationId)) {
      const error = new Error("Not authorized");
      error.statusCode = 403;
      throw error;
    }
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }

  static storageKey(organizationId, id) { return JSON.stringify([organizationId, id]); }

  static fingerprint(operation) {
    return crypto.createHash("sha256").update(JSON.stringify({
      operationType: operation.operationType,
      actorUserId: operation.actorUserId,
      deviceId: operation.deviceId,
      capturedAt: operation.capturedAt,
      occurredAt: operation.occurredAt,
      expectedVersion: operation.expectedVersion,
      fieldVisitId: operation.fieldVisitId,
      organizationId: operation.organizationId,
      payload: operation.payload
    })).digest("hex");
  }

  static conflict(message) {
    const error = new Error(message);
    error.statusCode = 409;
    return error;
  }

  static defaultAuthorize(principal, action, organizationId) {
    return principal.organizationId === organizationId && Array.isArray(principal.permissions) && principal.permissions.includes(action);
  }
}

module.exports = { FieldExecutionSyncService };
