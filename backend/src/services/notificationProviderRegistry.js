class NotificationProviderRegistry {
  constructor(providers = {}) {
    this.providers = providers;
  }

  get(channel, provider = "default") {
    return this.providers[channel]?.[provider] || null;
  }

  register(channel, provider, implementation) {
    if (!channel || !provider || !implementation || typeof implementation.send !== "function") {
      throw new Error("channel, provider, and send implementation are required");
    }
    this.providers[channel] = this.providers[channel] || {};
    this.providers[channel][provider] = implementation;
    return implementation;
  }
}

module.exports = { NotificationProviderRegistry };
