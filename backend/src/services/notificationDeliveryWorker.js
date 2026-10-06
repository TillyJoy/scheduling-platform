const { randomUUID } = require("node:crypto");

const FAILURE_CLASSES = Object.freeze({
  RETRYABLE: "retryable",
  PERMANENT: "permanent",
  SUPPRESSED: "suppressed"
});

class NotificationDeliveryWorker {
  constructor({
    transaction,
    outboxRepository,
    eventRepository,
    notificationEventProcessor,
    notificationRepository,
    deliveryAttemptRepository,
    providerRegistry = {},
    principalFactory = organizationId => ({
      userId: "notification-worker",
      organizationId,
      permissions: ["event:dispatch", "notification:dispatch", "notification:create"]
    }),
    now = () => new Date(),
    logger = console,
    batchSize = 10,
    leaseMs = 30000,
    pollIntervalMs = 1000,
    maxAttempts = 3,
    backoff = attemptNumber => Math.min(30000, 1000 * (2 ** Math.max(0, attemptNumber - 1)))
  } = {}) {
    if (!transaction || !outboxRepository || !eventRepository || !notificationEventProcessor || !notificationRepository || !deliveryAttemptRepository) {
      throw new Error("worker persistence services are required");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be a positive integer");
    if (!Number.isInteger(leaseMs) || leaseMs < 1) throw new Error("leaseMs must be a positive integer");
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error("pollIntervalMs must be a positive integer");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("maxAttempts must be a positive integer");
    if (typeof backoff !== "function") throw new Error("backoff must be a function");

    this.transaction = transaction;
    this.outboxRepository = outboxRepository;
    this.eventRepository = eventRepository;
    this.notificationEventProcessor = notificationEventProcessor;
    this.notificationRepository = notificationRepository;
    this.deliveryAttemptRepository = deliveryAttemptRepository;
    this.providerRegistry = providerRegistry;
    this.principalFactory = principalFactory;
    this.now = now;
    this.logger = logger;
    this.batchSize = batchSize;
    this.leaseMs = leaseMs;
    this.pollIntervalMs = pollIntervalMs;
    this.maxAttempts = maxAttempts;
    this.backoff = backoff;
    this.running = false;
    this.timer = null;
  }

  async processOrganization(organizationId) {
    if (!organizationId) throw new Error("organizationId is required");
    const principal = this.principalFactory(organizationId);
    const now = this.now();

    await this.transaction(principal, "notification.worker.claim-events", async db => {
      const stale = await this.outboxRepository.recoverStale({ principal, now, leaseMs: this.leaseMs, db });
      if (stale.length) this.logger.warn?.("Recovered stale notification event leases", { organizationId, count: stale.length });
    }).catch(async error => {
      // Older outbox repositories do not implement stale recovery; event claiming remains safe
      // because no stale-lease recovery is needed until the outbox migration provides it.
      if (!/recoverStale/.test(error.message || "")) throw error;
    });

    const claimed = await this.transaction(principal, "notification.worker.claim-events", db =>
      this.outboxRepository.claimBatch({ principal, limit: this.batchSize, now, leaseMs: this.leaseMs, db })
    );

    const results = [];
    for (const entry of claimed) {
      try {
        const event = await this.transaction(principal, "notification.worker.event-read", db =>
          this.eventRepository.get({ principal, eventId: entry.eventId, db })
        );
        if (!event) throw this.#classifiedError(FAILURE_CLASSES.PERMANENT, "Domain event not found");

        const processed = await this.notificationEventProcessor.process({ principal, event });

        await this.transaction(principal, "notification.worker.publish-event", db =>
          this.outboxRepository.markPublished({
            principal,
            outboxId: entry.id,
            publishedAt: this.now(),
            db
          })
        );

        results.push({ outboxId: entry.id, status: "published", processed });
      } catch (error) {
        results.push({
          outboxId: entry.id,
          status: await this.#handleEventFailure(principal, entry, error)
        });
      }
    }
    return results;
  }

  async processDeliveryAttempts(organizationId) {
    if (!organizationId) throw new Error("organizationId is required");
    const principal = this.principalFactory(organizationId);
    const now = this.now();

    const stale = await this.transaction(principal, "notification.worker.recover-delivery", db =>
      this.deliveryAttemptRepository.recoverStale({ principal, now, db })
    );
    if (stale.length) this.logger.warn?.("Recovered stale notification delivery leases", { organizationId, count: stale.length });

    const claimed = await this.transaction(principal, "notification.worker.claim-delivery", db =>
      this.deliveryAttemptRepository.claimBatch({
        principal,
        limit: this.batchSize,
        now,
        leaseMs: this.leaseMs,
        db
      })
    );

    const results = [];
    for (const attempt of claimed) {
      results.push(await this.#deliverAttempt(principal, attempt));
    }
    return results;
  }

  async tick(organizationIds = []) {
    const ids = Array.from(new Set(organizationIds.filter(Boolean)));
    const output = [];
    for (const organizationId of ids) {
      output.push({
        organizationId,
        events: await this.processOrganization(organizationId),
        deliveries: await this.processDeliveryAttempts(organizationId)
      });
    }
    return output;
  }

  start(organizationIds = []) {
    if (this.running) return;
    this.running = true;
    const run = async () => {
      if (!this.running) return;
      try {
        await this.tick(organizationIds);
      } catch (error) {
        this.logger.error?.("Notification worker tick failed", error);
      } finally {
        if (this.running) this.timer = setTimeout(run, this.pollIntervalMs);
      }
    };
    this.timer = setTimeout(run, 0);
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async #deliverAttempt(principal, attempt) {
    const provider = this.providerRegistry[attempt.channel]?.[attempt.provider || "default"];
    if (!provider || typeof provider.send !== "function") {
      return this.#failDelivery(principal, attempt, FAILURE_CLASSES.PERMANENT, "DELIVERY_PROVIDER_UNAVAILABLE", "No configured delivery provider");
    }

    const notification = await this.transaction(principal, "notification.worker.notification-read", db =>
      this.notificationRepository.get({ principal, notificationId: attempt.notificationId, db })
    );
    if (!notification) {
      return this.#failDelivery(principal, attempt, FAILURE_CLASSES.PERMANENT, "NOTIFICATION_NOT_FOUND", "Notification not found");
    }

    try {
      const result = await provider.send({
        id: randomUUID(),
        organizationId: notification.organizationId,
        notificationId: notification.id,
        deliveryAttemptId: attempt.id,
        channel: attempt.channel,
        provider: attempt.provider,
        recipientId: notification.recipientId,
        subject: notification.title,
        body: notification.message,
        idempotencyKey: attempt.idempotencyKey
      });

      if (result?.status === "suppressed") {
        await this.transaction(principal, "notification.delivery.suppressed", db =>
          this.deliveryAttemptRepository.updateStatus({
            principal,
            deliveryAttemptId: attempt.id,
            status: "suppressed",
            fields: {
              errorCode: result.errorCode || "SUPPRESSED",
              errorMessage: result.errorMessage || null,
              metadata: result.metadata || {}
            },
            db
          })
        );
        return { deliveryAttemptId: attempt.id, status: "suppressed" };
      }

      if (result?.status !== "success") {
        return this.#failDelivery(
          principal,
          attempt,
          result?.failureClass || FAILURE_CLASSES.PERMANENT,
          result?.errorCode || "PROVIDER_REJECTED",
          result?.errorMessage || "Provider rejected delivery",
          result?.metadata || {}
        );
      }

      await this.transaction(principal, "notification.delivery.delivered", db =>
        this.deliveryAttemptRepository.updateStatus({
          principal,
          deliveryAttemptId: attempt.id,
          status: "delivered",
          fields: {
            providerMessageId: result.providerMessageId || null,
            metadata: result.metadata || {}
          },
          db
        })
      );

      return { deliveryAttemptId: attempt.id, status: "delivered" };
    } catch (error) {
      return this.#failDelivery(
        principal,
        attempt,
        FAILURE_CLASSES.RETRYABLE,
        "PROVIDER_ERROR",
        error.message || "Provider error"
      );
    }
  }

  async #failDelivery(principal, attempt, failureClass, errorCode, errorMessage, metadata = {}) {
    await this.transaction(principal, "notification.delivery.failed", db =>
      this.deliveryAttemptRepository.updateStatus({
        principal,
        deliveryAttemptId: attempt.id,
        status: "failed",
        fields: { errorCode, errorMessage, metadata: { ...metadata, failureClass } },
        db
      })
    );

    if (failureClass !== FAILURE_CLASSES.RETRYABLE || attempt.attemptNumber >= attempt.maxAttempts) {
      return {
        deliveryAttemptId: attempt.id,
        status: "failed",
        terminal: true,
        failureClass
      };
    }

    const delayMs = Math.max(0, Number(this.backoff(attempt.attemptNumber)) || 0);
    const availableAt = new Date(this.now().getTime() + delayMs);
    await this.transaction(principal, "notification.delivery.retry", db =>
      this.deliveryAttemptRepository.scheduleRetry({
        principal,
        deliveryAttemptId: attempt.id,
        availableAt,
        errorCode,
        errorMessage,
        db
      })
    );

    return {
      deliveryAttemptId: attempt.id,
      status: "retry_scheduled",
      availableAt
    };
  }

  async #handleEventFailure(principal, entry, error) {
    const attemptNumber = entry.attempts || 1;
    const failureClass = error.failureClass || FAILURE_CLASSES.RETRYABLE;
    const errorMessage = error.message || "Notification processing failed";

    const availableAt = failureClass === FAILURE_CLASSES.RETRYABLE && attemptNumber < this.maxAttempts
      ? new Date(this.now().getTime() + Math.max(0, Number(this.backoff(attemptNumber)) || 0))
      : this.now();

    await this.transaction(principal, "notification.worker.event-failed", db =>
      this.outboxRepository.markFailed({
        principal,
        outboxId: entry.id,
        error: errorMessage,
        availableAt,
        db
      })
    );

    return failureClass === FAILURE_CLASSES.RETRYABLE && attemptNumber < this.maxAttempts
      ? "retry_scheduled"
      : "failed";
  }

  #classifiedError(failureClass, message) {
    const error = new Error(message);
    error.failureClass = failureClass;
    return error;
  }
}

module.exports = { NotificationDeliveryWorker, FAILURE_CLASSES };
