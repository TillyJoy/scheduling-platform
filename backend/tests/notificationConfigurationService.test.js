const assert=require("node:assert/strict");
const {NotificationConfigurationService}=require("../src/services/notificationConfigurationService");
const permissions=["notification-configuration:read","notification-template:create","notification-template:publish","notification-template:archive","notification-rule:create","notification-rule:publish","notification-rule:archive"];
const admin={userId:"admin-a",organizationId:"org-a",permissions};
const other={userId:"admin-b",organizationId:"org-b",permissions};
const service=new NotificationConfigurationService();

service.createTemplate({principal:admin,id:"template-1",organizationId:"org-a",name:"Appointment Rescheduled",channel:"email",subject:"Your appointment changed",body:"Hello {{recipient.first_name}}, your appointment is now {{appointment.start_time}}.",variables:["recipient.first_name","appointment.start_time"]});
assert.throws(()=>service.publishRule({principal:admin,ruleId:"rule-1"}),/Notification rule not found/);
const template=service.publishTemplate({principal:admin,templateId:"template-1"});
assert.equal(template.status,"published");
assert.ok(template.publishedAt);

service.createRule({principal:admin,id:"rule-1",organizationId:"org-a",name:"Notify when appointment changes",eventType:"appointment.rescheduled",conditions:{appointmentStatus:"scheduled"},recipientRules:["appointment.participant"],templateIds:["template-1"],allowedChannels:["email"],timing:{mode:"immediate"},required:true});
const rule=service.publishRule({principal:admin,ruleId:"rule-1"});
assert.equal(rule.status,"published");
assert.equal(service.listTemplates({principal:admin}).length,1);
assert.equal(service.listRules({principal:admin}).length,1);
assert.equal(service.listTemplates({principal:other}).length,0);
assert.equal(service.listRules({principal:other}).length,0);

assert.throws(()=>service.createRule({principal:admin,id:"rule-cross",organizationId:"org-a",name:"Cross tenant template",eventType:"appointment.updated",recipientRules:["appointment.participant"],templateIds:["missing-template"]}),/invalid notification template/);
assert.throws(()=>service.publishRule({principal:other,ruleId:"rule-1"}),/Not authorized/);
assert.throws(()=>service.createTemplate({principal:admin,id:"template-1",organizationId:"org-a",name:"Duplicate",body:"Duplicate"}),/Configuration ID already exists/);
assert.throws(()=>service.createTemplate({principal:admin,id:"template-cross",organizationId:"org-b",name:"Cross tenant",body:"No"}),/Not authorized/);
console.log("Notification configuration tests passed.");
