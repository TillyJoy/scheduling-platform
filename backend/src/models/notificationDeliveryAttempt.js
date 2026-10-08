const STATUSES=Object.freeze(["pending","sent","delivered","failed","suppressed","expired"]);
class NotificationDeliveryAttempt {
  constructor({id,organizationId,notificationId,channel,provider=null,status="pending",attemptNumber=1,idempotencyKey=null,
    errorCode=null,errorMessage=null,providerMessageId=null,requestedAt=new Date(),sentAt=null,deliveredAt=null,failedAt=null,
    suppressedAt=null,expiredAt=null,metadata={},availableAt=requestedAt,lockedAt=null,maxAttempts=3}) {
    if(!id||!organizationId||!notificationId||!channel) throw new Error("id, organizationId, notificationId, and channel are required");
    if(!["in_app","email","sms"].includes(channel)) throw new Error("Invalid delivery attempt channel");
    if(!STATUSES.includes(status)) throw new Error("Invalid delivery attempt status");
    if(!Number.isInteger(attemptNumber)||attemptNumber<1) throw new Error("attemptNumber must be a positive integer");
    if(!Number.isInteger(maxAttempts)||maxAttempts<1) throw new Error("maxAttempts must be a positive integer");
    if(attemptNumber>maxAttempts) throw new Error("attemptNumber cannot exceed maxAttempts");
    if(!metadata||typeof metadata!=="object"||Array.isArray(metadata)) throw new Error("metadata must be an object");
    this.id=id;this.organizationId=organizationId;this.notificationId=notificationId;this.channel=channel;this.provider=provider;this.status=status;
    this.attemptNumber=attemptNumber;this.idempotencyKey=idempotencyKey;this.errorCode=errorCode;this.errorMessage=errorMessage;this.providerMessageId=providerMessageId;
    this.requestedAt=requestedAt;this.sentAt=sentAt;this.deliveredAt=deliveredAt;this.failedAt=failedAt;this.suppressedAt=suppressedAt;this.expiredAt=expiredAt;
    this.metadata=structuredClone(metadata);this.availableAt=availableAt;this.lockedAt=lockedAt;this.maxAttempts=maxAttempts;
  }
}
module.exports={NotificationDeliveryAttempt,STATUSES};
