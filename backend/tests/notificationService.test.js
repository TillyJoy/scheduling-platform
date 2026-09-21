const assert = require("node:assert/strict");
const { NotificationService } = require("../src/services/notificationService");

const principalA={userId:"user-a",organizationId:"org-a",permissions:["notification:create","notification:read","notification:acknowledge","notification:dismiss"]};
const principalB={userId:"user-b",organizationId:"org-b",permissions:["notification:create","notification:read","notification:acknowledge","notification:dismiss"]};
const service=new NotificationService();

service.create({principal:principalA,id:"n1",organizationId:"org-a",recipientId:"user-a",severity:"critical",title:"Appointment changed",message:"The assigned resource can no longer attend.",sourceEventType:"appointment.resource_unavailable",requiresAcknowledgement:true});
service.create({principal:principalB,id:"n2",organizationId:"org-b",recipientId:"user-b",severity:"critical",title:"Other organization",message:"This must remain isolated."});

assert.equal(service.listForRecipient({principal:principalA}).length,1);
assert.throws(()=>service.listForRecipient({principal:principalB}),/Not authorized/);
assert.throws(()=>service.markRead({principal:principalB,notificationId:"n1"}),/Not authorized/);
service.markRead({principal:principalA,notificationId:"n1"});
assert.equal(service.listForRecipient({principal:principalA,status:"read"}).length,1);
service.acknowledge({principal:principalA,notificationId:"n1"});
assert.equal(service.listForRecipient({principal:principalA,status:"acknowledged"}).length,1);
assert.equal(service.auditStore.length,4);
assert.throws(()=>service.create({principal:principalA,id:"n1",organizationId:"org-a",recipientId:"user-a",title:"Duplicate",message:"This must not overwrite the existing notification."}),/Notification ID already exists/);
assert.throws(()=>service.create({principal:principalA,id:"n3",organizationId:"org-b",recipientId:"user-b",title:"Cross tenant",message:"This must not be created."}),/Not authorized/);
assert.throws(()=>service.markRead({principal:{userId:"user-a",organizationId:"org-a"},notificationId:"n1"}),/Not authorized/);
assert.throws(()=>service.markRead({notificationId:"n1"}),/Trusted principal is required/);
console.log("Notification service tests passed.");