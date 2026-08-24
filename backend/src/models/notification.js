class Notification {
  constructor({
    id,
    recipientId,
    type,
    message,
    channel = "in-app",
    status = "pending",
    createdAt = new Date()
  }) {
    this.id = id;
    this.recipientId = recipientId;
    this.type = type;
    this.message = message;
    this.channel = channel;
    this.status = status;
    this.createdAt = createdAt;
  }
}

module.exports = { Notification };
