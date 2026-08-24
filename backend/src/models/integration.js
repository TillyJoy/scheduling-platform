class Integration {
  constructor({
    id,
    organizationId,
    provider,
    active = false,
    syncIntervalSeconds = 30,
    lastSyncAt = null,
    status = "disconnected"
  }) {
    this.id = id;
    this.organizationId = organizationId;
    this.provider = provider;
    this.active = active;
    this.syncIntervalSeconds = syncIntervalSeconds;
    this.lastSyncAt = lastSyncAt;
    this.status = status;
  }
}

module.exports = { Integration };
