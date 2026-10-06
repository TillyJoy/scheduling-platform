const { NotificationDeliveryAttempt, STATUSES } = require("../models/notificationDeliveryAttempt");

class NotificationDeliveryAttemptRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, attempt, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new NotificationDeliveryAttempt({
      ...attempt,
      organizationId: principal.organizationId
    });
    const result = await db.query(
      `INSERT INTO notification_delivery_attempts
       (id,organization_id,notification_id,channel,provider,status,attempt_number,idempotency_key,
        error_code,error_message,provider_message_id,requested_at,sent_at,delivered_at,failed_at,
        suppressed_at,expired_at,metadata,available_at,locked_at,max_attempts,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$22)
       RETURNING *`,
      [
        record.id, principal.organizationId, record.notificationId, record.channel, record.provider,
        record.status, record.attemptNumber, record.idempotencyKey, record.errorCode, record.errorMessage,
        record.providerMessageId, record.requestedAt, record.sentAt, record.deliveredAt, record.failedAt,
        record.suppressedAt, record.expiredAt, JSON.stringify(record.metadata), attempt.availableAt ?? record.requestedAt,
        attempt.lockedAt ?? null, attempt.maxAttempts ?? 3, this.clock()
      ]
    );
    return this.#map(result.rows[0]);
  }

  async get({ principal, deliveryAttemptId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM notification_delivery_attempts WHERE organization_id=$1 AND id=$2",
      [principal.organizationId, deliveryAttemptId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async listForNotification({ principal, notificationId, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM notification_delivery_attempts WHERE organization_id=$1 AND notification_id=$2 ORDER BY attempt_number,id",
      [principal.organizationId, notificationId]
    );
    return result.rows.map(row => this.#map(row));
  }

  async claimBatch({ principal, limit = 10, now = this.clock(), leaseMs = 30000, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
    if (!Number.isInteger(leaseMs) || leaseMs < 1) throw new Error("leaseMs must be a positive integer");

    const lockUntil = new Date(now.getTime() + leaseMs);
    const result = await db.query(
      `WITH candidates AS (
        SELECT id
        FROM notification_delivery_attempts
        WHERE organization_id=$1
          AND (
            (status='pending' AND available_at <= $2 AND (locked_at IS NULL OR locked_at <= $2))
            OR
            (status='pending' AND locked_at <= $2)
          )
        ORDER BY available_at,id
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE notification_delivery_attempts d
      SET locked_at=$4, updated_at=$2
      FROM candidates
      WHERE d.organization_id=$1 AND d.id=candidates.id
      RETURNING d.*`,
      [principal.organizationId, now, limit, lockUntil]
    );
    return result.rows.map(row => this.#map(row));
  }

  async recoverStale({ principal, now = this.clock(), db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `UPDATE notification_delivery_attempts
       SET locked_at=NULL, updated_at=$2
       WHERE organization_id=$1
         AND status='pending'
         AND locked_at IS NOT NULL
         AND locked_at <= $2
       RETURNING *`,
      [principal.organizationId, now]
    );
    return result.rows.map(row => this.#map(row));
  }

  async scheduleRetry({ principal, deliveryAttemptId, availableAt, errorCode = null, errorMessage = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (!(availableAt instanceof Date) || Number.isNaN(availableAt.getTime())) throw new Error("availableAt must be a valid Date");
    const current = await this.get({ principal, deliveryAttemptId, db });
    if (!current) throw new Error("Delivery attempt not found");
    if (current.status !== "failed") throw new Error("Only failed delivery attempts can be retried");
    if (current.attemptNumber >= current.maxAttempts) throw new Error("Delivery attempt retries are exhausted");

    const result = await db.query(
      `UPDATE notification_delivery_attempts
       SET status='pending', available_at=$3, locked_at=NULL,
           error_code=$4, error_message=$5, failed_at=NULL, updated_at=$6
       WHERE organization_id=$1 AND id=$2 AND status='failed'
       RETURNING *`,
      [principal.organizationId, deliveryAttemptId, availableAt, errorCode, errorMessage, this.clock()]
    );
    if (!result.rows[0]) throw new Error("Delivery attempt is no longer retryable");
    return this.#map(result.rows[0]);
  }

  async createNextAttempt({ principal, attempt, db = this.pool }) {
    return this.create({
      principal,
      attempt: {
        ...attempt,
        attemptNumber: attempt.attemptNumber ?? 1,
        maxAttempts: attempt.maxAttempts ?? 3,
        availableAt: attempt.availableAt ?? this.clock()
      },
      db
    });
  }

  async updateStatus({ principal, deliveryAttemptId, status, fields = {}, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (!STATUSES.includes(status)) throw new Error("Invalid delivery attempt status");
    const current = await this.get({ principal, deliveryAttemptId, db });
    if (!current) throw new Error("Delivery attempt not found");

    const transitions = {
      pending: new Set(["sent", "delivered", "failed", "suppressed", "expired"]),
      sent: new Set(["delivered", "failed", "expired"]),
      delivered: new Set(),
      failed: new Set(),
      suppressed: new Set(),
      expired: new Set()
    };
    if (status !== current.status && !transitions[current.status]?.has(status)) {
      throw new Error("Invalid delivery attempt transition");
    }

    const now = this.clock();
    const result = await db.query(
      `UPDATE notification_delivery_attempts
       SET status=$3,error_code=$4,error_message=$5,provider_message_id=$6,
           sent_at=$7,delivered_at=$8,failed_at=$9,suppressed_at=$10,expired_at=$11,
           metadata=$12::jsonb,available_at=$13,locked_at=$14,updated_at=$15
       WHERE organization_id=$1 AND id=$2 RETURNING *`,
      [
        principal.organizationId, deliveryAttemptId, status,
        fields.errorCode ?? current.errorCode,
        fields.errorMessage ?? current.errorMessage,
        fields.providerMessageId ?? current.providerMessageId,
        fields.sentAt ?? (status === "sent" ? now : current.sentAt),
        fields.deliveredAt ?? (status === "delivered" ? now : current.deliveredAt),
        fields.failedAt ?? (status === "failed" ? now : current.failedAt),
        fields.suppressedAt ?? (status === "suppressed" ? now : current.suppressedAt),
        fields.expiredAt ?? (status === "expired" ? now : current.expiredAt),
        JSON.stringify(fields.metadata ?? current.metadata),
        fields.availableAt ?? current.availableAt,
        fields.lockedAt ?? (["sent", "delivered", "failed", "suppressed", "expired"].includes(status) ? null : current.lockedAt),
        now
      ]
    );
    return this.#map(result.rows[0]);
  }

  #map(row) {
    return new NotificationDeliveryAttempt({
      id: row.id,
      organizationId: row.organization_id,
      notificationId: row.notification_id,
      channel: row.channel,
      provider: row.provider,
      status: row.status,
      attemptNumber: row.attempt_number,
      idempotencyKey: row.idempotency_key,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      providerMessageId: row.provider_message_id,
      requestedAt: row.requested_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      suppressedAt: row.suppressed_at,
      expiredAt: row.expired_at,
      metadata: row.metadata
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { NotificationDeliveryAttemptRepository };
