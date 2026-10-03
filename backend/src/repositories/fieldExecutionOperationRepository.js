class FieldExecutionOperationRepository {
  constructor({ pool } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
  }

  async get({ principal, operationId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT organization_id, operation_id, operation_type, actor_user_id, device_id,
              captured_at, occurred_at, field_visit_id, expected_version, payload,
              fingerprint, status, result, created_at
       FROM field_execution_operations
       WHERE organization_id = $1 AND operation_id = $2`,
      [principal.organizationId, operationId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async create({ principal, operation, fingerprint, status = "applied", result = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (operation.organizationId !== principal.organizationId) {
      throw new Error("Operation organization mismatch");
    }
    const inserted = await db.query(
      `INSERT INTO field_execution_operations
        (organization_id, operation_id, operation_type, actor_user_id, device_id,
         captured_at, occurred_at, field_visit_id, expected_version, payload,
         fingerprint, status, result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb)
       RETURNING organization_id, operation_id, operation_type, actor_user_id, device_id,
                 captured_at, occurred_at, field_visit_id, expected_version, payload,
                 fingerprint, status, result, created_at`,
      [
        principal.organizationId,
        operation.operationId,
        operation.operationType,
        operation.actorUserId,
        operation.deviceId,
        operation.capturedAt,
        operation.occurredAt,
        operation.fieldVisitId,
        operation.expectedVersion,
        JSON.stringify(operation.payload),
        fingerprint,
        status,
        result === null ? null : JSON.stringify(result)
      ]
    );
    return this.#map(inserted.rows[0]);
  }

  #map(row) {
    return {
      organizationId: row.organization_id,
      operationId: row.operation_id,
      operationType: row.operation_type,
      actorUserId: row.actor_user_id,
      deviceId: row.device_id,
      capturedAt: row.captured_at,
      occurredAt: row.occurred_at,
      fieldVisitId: row.field_visit_id,
      expectedVersion: row.expected_version,
      payload: row.payload,
      fingerprint: row.fingerprint,
      status: row.status,
      result: row.result,
      createdAt: row.created_at
    };
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }
}

module.exports = { FieldExecutionOperationRepository };
