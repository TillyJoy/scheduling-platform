const assert=require("node:assert/strict");
const test=require("node:test");
const {randomUUID}=require("node:crypto");
const {createDatabasePool,runMigrations,withTransaction}=require("../src/database");
const {NotificationTemplateRepository}=require("../src/repositories/notificationTemplateRepository");
const {NotificationRuleRepository}=require("../src/repositories/notificationRuleRepository");
const {NotificationRepository}=require("../src/repositories/notificationRepository");
const {AuditEventRepository}=require("../src/repositories/auditEventRepository");
const {NotificationService}=require("../src/services/notificationService");
const {NotificationConfigurationService}=require("../src/services/notificationConfigurationService");
const {NotificationEventProcessor}=require("../src/services/notificationEventProcessor");
const {DomainEvent}=require("../src/models/domainEvent");

const shouldRun=Boolean(process.env.DATABASE_URL&&process.env.RUN_POSTGRES_TESTS==="1");
const permissions=[
  "notification-configuration:read","notification-template:create","notification-template:publish","notification-template:archive",
  "notification-rule:create","notification-rule:publish","notification-rule:archive","notification:dispatch","notification:create",
  "notification:read","notification:manage","audit:read"
];

test("durable notification configuration pins versions, survives fresh instances, audits mutations, and isolates tenants",{skip:!shouldRun},async t=>{
  const pool=createDatabasePool();
  const suffix=randomUUID();
  const orgA="notif-config-a-"+suffix,orgB="notif-config-b-"+suffix;
  const role="notif_config_"+suffix.replace(/[^a-zA-Z0-9_]/g,"_");
  const principalA={userId:"config-user-a-"+suffix,organizationId:orgA,permissions};
  const principalB={userId:"config-user-b-"+suffix,organizationId:orgB,permissions};
  await runMigrations(pool);
  const transaction=(principal,action,work)=>withTransaction(pool,{organizationId:principal.organizationId,userId:principal.userId,action},async db=>{
    await db.query('SET LOCAL ROLE "'+role+'"');
    return work(db);
  });
  const freshServices=()=>{
    const templateRepository=new NotificationTemplateRepository({pool});
    const ruleRepository=new NotificationRuleRepository({pool,templateRepository});
    const notificationRepository=new NotificationRepository({pool});
    const auditRepository=new AuditEventRepository({pool});
    const configurationService=new NotificationConfigurationService({
      templateRepository,ruleRepository,auditRepository,transaction,
      authorize:NotificationConfigurationService.defaultAuthorize
    });
    const notificationService=new NotificationService({notificationRepository,auditRepository,transaction});
    return {templateRepository,ruleRepository,notificationRepository,auditRepository,configurationService,notificationService};
  };
  await pool.query("INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)",[orgA,"Config A",orgB,"Config B"]);
  await pool.query('CREATE ROLE "'+role+'" NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,notifications,notification_templates,notification_rules TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT ON audit_events TO "'+role+'"');

  // Data and audit rows intentionally use a unique organization per test run.
  // The CI PostgreSQL service is ephemeral; the test role is dropped after removing its grants.
  t.after(async()=>{
    await pool.query('DROP OWNED BY "'+role+'"').catch(()=>{});
    await pool.query('DROP ROLE IF EXISTS "'+role+'"').catch(()=>{});
    await pool.end();
  });

  let services=freshServices();
  const templateV1=await services.configurationService.createTemplate({
    principal:principalA,id:"status-template-"+suffix,name:"Status update",channel:"in_app",
    subject:"Status {{newStatus}}",body:"Version one says {{newStatus}}.",variables:["newStatus"]
  });
  assert.equal(templateV1.version,1);
  assert.equal(templateV1.status,"draft");
  const publishedV1=await services.configurationService.publishTemplate({principal:principalA,templateId:templateV1.id,version:1});
  assert.equal(publishedV1.status,"published");

  // Fresh service/repository instances must load the same persisted records.
  services=freshServices();
  const reloadedV1=await services.configurationService.getTemplate({principal:principalA,templateId:templateV1.id,version:1});
  assert.equal(reloadedV1.body,"Version one says {{newStatus}}.");
  assert.equal((await services.configurationService.listTemplates({principal:principalA})).length,1);

  // Missing and unpublished references may not be published, and cross-tenant writes are denied.
  await assert.rejects(()=>services.configurationService.createTemplate({
    principal:principalA,id:"cross-template-"+suffix,organizationId:orgB,name:"Cross tenant",body:"Must not save"
  }),/not authorized/i);
  const pending=await services.configurationService.createTemplate({
    principal:principalA,id:"pending-template-"+suffix,name:"Pending template",channel:"in_app",body:"Pending",variables:[]
  });
  const pendingRule=await services.configurationService.createRule({
    principal:principalA,id:"pending-rule-"+suffix,name:"Pending reference",eventType:"job.status.changed",
    recipientRules:[{type:"event_payload",path:"recipientUserId"}],
    templateRefs:[{templateId:pending.id,version:pending.version}],allowedChannels:["in_app"]
  });
  await assert.rejects(()=>services.configurationService.publishRule({principal:principalA,ruleId:pendingRule.id}),/published template/i);
  assert.equal((await services.configurationService.getRule({principal:principalA,ruleId:pendingRule.id})).status,"draft");
  const missingRuleDraft=await services.configurationService.createRule({
    principal:principalA,id:"missing-rule-"+suffix,name:"Missing reference",eventType:"job.status.changed",
    recipientRules:[{type:"event_payload",path:"recipientUserId"}],
    templateRefs:[{templateId:"no-such-template-"+suffix,version:99}],allowedChannels:["in_app"]
  }).catch(error=>({error}));
  if(missingRuleDraft.error) assert.match(missingRuleDraft.error.message,/invalid notification template/i);
  else await assert.rejects(()=>services.configurationService.publishRule({principal:principalA,ruleId:missingRuleDraft.id}),/published template/i);

  const rule=await services.configurationService.createRule({
    principal:principalA,id:"status-rule-"+suffix,name:"Status changed",eventType:"job.status.changed",
    conditions:{newStatus:"ready"},
    recipientRules:[{type:"event_payload",path:"recipientUserId"}],
    templateRefs:[{templateId:templateV1.id,version:1}],
    allowedChannels:["in_app"],timing:{mode:"immediate"},priority:"normal",enabled:true
  });
  assert.deepEqual(rule.templateRefs,[{templateId:templateV1.id,version:1}]);
  const publishedRule=await services.configurationService.publishRule({principal:principalA,ruleId:rule.id});
  assert.equal(publishedRule.status,"published");

  // Published version content is immutable. A new version is separate; the rule remains pinned to v1.
  await assert.rejects(()=>transaction(principalA,"template.illegal-edit",db=>db.query(
    "UPDATE notification_templates SET body=$4 WHERE organization_id=$1 AND template_id=$2 AND version=$3",
    [orgA,templateV1.id,1,"Illegal mutation"]
  )),/immutable/i);
  const templateV2=await services.configurationService.createTemplateVersion({
    principal:principalA,templateId:templateV1.id,sourceVersion:1,
    input:{body:"Version two says {{newStatus}}.",subject:"New status {{newStatus}}"}
  });
  assert.equal(templateV2.version,2);
  const publishedV2=await services.configurationService.publishTemplate({principal:principalA,templateId:templateV1.id,version:2});
  assert.equal(publishedV2.status,"published");
  services=freshServices();
  const persistedRule=await services.configurationService.getRule({principal:principalA,ruleId:rule.id});
  assert.equal(persistedRule.templateRefs[0].version,1);
  assert.equal((await services.configurationService.getTemplate({principal:principalA,templateId:templateV1.id,version:1})).body,"Version one says {{newStatus}}.");
  assert.equal((await services.configurationService.getTemplate({principal:principalA,templateId:templateV1.id,version:2})).body,"Version two says {{newStatus}}.");

  const processor=new NotificationEventProcessor({
    ruleStore:new Map(),templateStore:new Map(),notificationService:services.notificationService,
    configurationService:services.configurationService,transaction,durableConfiguration:true
  });
  const event=new DomainEvent({
    id:"status-event-"+suffix,organizationId:orgA,eventType:"job.status.changed",entityType:"job",entityId:"job-"+suffix,
    actorUserId:principalA.userId,payload:{newStatus:"ready",recipientUserId:"recipient-"+suffix}
  });
  const processed=await processor.process({principal:principalA,event});
  assert.equal(processed.length,1);
  assert.equal(processed[0].status,"created");
  assert.equal(processed[0].templateId,templateV1.id);
  assert.equal(processed[0].templateVersion,1);

  const freshNotificationService=new NotificationService({
    notificationRepository:new NotificationRepository({pool}),auditRepository:new AuditEventRepository({pool}),transaction
  });
  const recipientPrincipal={...principalA,userId:"recipient-"+suffix};
  const notifications=await freshNotificationService.listForRecipient({principal:recipientPrincipal});
  assert.equal(notifications.length,1);
  assert.equal(notifications[0].templateId,templateV1.id);
  assert.equal(notifications[0].templateVersion,1);
  assert.equal(notifications[0].message,"Version one says ready.");
  assert.equal(notifications[0].sourceEventId,event.id);

  const replay=await processor.process({principal:principalA,event});
  assert.equal(replay.length,1);
  assert.equal(replay[0].status,"deduplicated");
  assert.equal((await freshNotificationService.listForRecipient({principal:principalA})).length,1);

  // Explicit tenant scoping prevents reading or mutating the other organization's records.
  const otherServices=freshServices();
  assert.equal((await otherServices.configurationService.listTemplates({principal:principalB})).length,0);
  assert.equal((await otherServices.configurationService.listRules({principal:principalB})).length,0);
  await assert.rejects(()=>otherServices.configurationService.publishTemplate({principal:principalB,templateId:templateV1.id,version:1}),/not found|not authorized/i);
  await assert.rejects(()=>otherServices.configurationService.publishRule({principal:principalB,ruleId:rule.id}),/not found|not authorized/i);
  await assert.rejects(()=>otherServices.configurationService.createRule({
    principal:principalA,id:"cross-reference-"+suffix,name:"Cross reference",eventType:"job.status.changed",
    recipientRules:[{type:"static_user",userId:"recipient"}],
    templateRefs:[{templateId:"other-tenant-template",version:1}],allowedChannels:["in_app"]
  }),/invalid notification template/i);

  // Lifecycle archival is auditable, and it cannot rewrite the frozen content.
  const draftArchive=await services.configurationService.createTemplate({
    principal:principalA,id:"archive-template-"+suffix,name:"Archive me",body:"Still historical"
  });
  const archived=await services.configurationService.archiveTemplate({principal:principalA,templateId:draftArchive.id,version:draftArchive.version});
  assert.equal(archived.status,"archived");

  const audits=await services.auditRepository.list({principal:principalA});
  const actions=new Set(audits.map(a=>a.action));
  for(const action of ["notification_template.created","notification_template.published","notification_template.version_created","notification_rule.created","notification_rule.published","notification_template.archived","notification.created"]) {
    assert.ok(actions.has(action),"missing audit action "+action);
  }

  // Audit and configuration are one transaction: a failed audit aborts its template mutation.
  const failingService=new NotificationConfigurationService({
    templateRepository:services.templateRepository,ruleRepository:services.ruleRepository,transaction,
    auditRepository:{create:async()=>{throw new Error("forced audit failure");}}
  });
  const rollbackId="rollback-template-"+suffix;
  await assert.rejects(()=>failingService.createTemplate({principal:principalA,id:rollbackId,name:"Rollback",body:"Rollback"}),/forced audit failure/);
  assert.equal(await services.templateRepository.getLatest({principal:principalA,templateId:rollbackId}),null);
});
