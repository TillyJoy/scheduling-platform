const assert=require("node:assert/strict");
const test=require("node:test");
const {randomUUID}=require("node:crypto");
const {createDatabasePool,runMigrations,withTransaction}=require("../src/database");
const {DomainEvent}=require("../src/models/domainEvent");
const {NotificationRule}=require("../src/models/notificationRule");
const {NotificationTemplate}=require("../src/models/notificationTemplate");
const {DomainEventRepository}=require("../src/repositories/domainEventRepository");
const {DomainEventOutboxRepository}=require("../src/repositories/domainEventOutboxRepository");
const {NotificationRepository}=require("../src/repositories/notificationRepository");
const {NotificationDeliveryAttemptRepository}=require("../src/repositories/notificationDeliveryAttemptRepository");
const {NotificationService}=require("../src/services/notificationService");
const {NotificationEventProcessor}=require("../src/services/notificationEventProcessor");
const {NotificationDeliveryWorker}=require("../src/services/notificationDeliveryWorker");
const {NotificationProviderRegistry}=require("../src/services/notificationProviderRegistry");

const shouldRun=process.env.DATABASE_URL&&process.env.RUN_POSTGRES_TESTS==="1";

test("durable notification delivery worker processes events, retries safely, and preserves tenant isolation",{skip:!shouldRun},async t=>{
  const pool=createDatabasePool();
  const suffix=randomUUID();
  const orgA="worker-a-"+suffix,orgB="worker-b-"+suffix;
  const role="worker_test_"+suffix.replace(/[^a-zA-Z0-9_]/g,"_");
  const permissions=["event:emit","event:read","event:dispatch","notification:create","notification:read","notification:acknowledge","notification:dismiss","notification:manage"];
  const principalA={userId:"worker-user-a-"+suffix,organizationId:orgA,permissions};
  const principalB={userId:"worker-user-b-"+suffix,organizationId:orgB,permissions};
  const workerPrincipal=organizationId=>({userId:"system-notification-worker",organizationId,permissions:["event:dispatch","notification:dispatch","notification:create"]});

  await runMigrations(pool);
  const tx=(principal,action,work)=>withTransaction(pool,{organizationId:principal.organizationId,userId:principal.userId,action},async db=>{
    await db.query('SET LOCAL ROLE "'+role+'"');
    return work(db);
  });

  const eventRepo=new DomainEventRepository({pool});
  const outboxRepo=new DomainEventOutboxRepository({pool});
  const notificationRepo=new NotificationRepository({pool});
  const deliveryRepo=new NotificationDeliveryAttemptRepository({pool});
  const notificationService=new NotificationService({notificationRepository:notificationRepo,transaction:tx});
  const processorRules=new Map();
  const templates=new Map();
  const processor=new NotificationEventProcessor({ruleStore:processorRules,templateStore:templates,notificationService,deliveryAttemptRepository:deliveryRepo});
  const providers=new NotificationProviderRegistry();
  providers.register("email","fake",{send:async request=>({status:"success",providerMessageId:"provider-"+request.deliveryAttemptId})});

  const fixedNow=new Date("2026-10-06T12:00:00.000Z");
  let now=fixedNow;
  const worker=new NotificationDeliveryWorker({
    transaction:tx,outboxRepository:outboxRepo,eventRepository:eventRepo,
    notificationEventProcessor:processor,notificationRepository:notificationRepo,
    deliveryAttemptRepository:deliveryRepo,providerRegistry:providers.providers,
    principalFactory:workerPrincipal,now:()=>now,batchSize:10,leaseMs:60000,maxAttempts:3,backoff:()=>1000
  });

  t.after(async()=>{
    for(const org of [orgA,orgB])await tx({userId:"cleanup",organizationId:org},"test.cleanup",async db=>{
      await db.query("DELETE FROM notification_delivery_attempts WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM notifications WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM event_outbox WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM domain_events WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM audit_events WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM organizations WHERE id=$1",[org]);
    }).catch(()=>{});
    await pool.query('DROP ROLE IF EXISTS "'+role+'"').catch(()=>{});
    await pool.end();
  });

  await pool.query("INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)",[orgA,"Worker A",orgB,"Worker B"]);
  await pool.query('CREATE ROLE "'+role+'" NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,audit_events,domain_events,event_outbox,notifications,notification_delivery_attempts TO "'+role+'"');

  const template=new NotificationTemplate({
    id:"template-worker-"+suffix,organizationId:orgA,name:"In App Status",channel:"in_app",
    subject:"{{newStatus}}",body:"Job {{entityId}} is {{newStatus}}.",variables:["entityId","newStatus"],status:"published"
  });
  const rule=new NotificationRule({
    id:"rule-worker-"+suffix,organizationId:orgA,name:"In app status",eventType:"job.status.changed",
    recipientRules:[{type:"event_payload",path:"recipientUserId"}],templateIds:[template.id],
    allowedChannels:["in_app"],status:"published",enabled:true
  });
  templates.set(template.id,template);
  processorRules.set(rule.id,rule);

  const eventId="event-worker-"+suffix;
  await tx(principalA,"event.emit",async db=>{
    const event=new DomainEvent({
      id:eventId,organizationId:orgA,eventType:"job.status.changed",entityType:"job",entityId:"job-1",
      actorUserId:principalA.userId,payload:{newStatus:"ready",recipientUserId:principalA.userId}
    });
    await eventRepo.create({principal:principalA,event,db});
    await outboxRepo.enqueue({principal:principalA,event,availableAt:fixedNow,db});
  });

  const first=await worker.processOrganization(orgA);
  assert.equal(first.length,1);
  assert.equal(first[0].status,"published");

  const notifications=await tx(principalA,"notification.read",db=>db.query(
    "SELECT id,organization_id,delivery_key FROM notifications WHERE organization_id=$1",[orgA]
  ));
  assert.equal(notifications.rows.length,1);

  const attempts=await tx(principalA,"delivery.read",db=>db.query(
    "SELECT id,status,attempt_number,available_at,locked_at,max_attempts FROM notification_delivery_attempts WHERE organization_id=$1 ORDER BY attempt_number",[orgA]
  ));
  assert.equal(attempts.rows.length,1);
  assert.equal(attempts.rows[0].status,"delivered");
  assert.equal(attempts.rows[0].attempt_number,1);

  const retryAttempt=await tx(principalA,"delivery.retry-fixture",db=>deliveryRepo.create({
    principal:principalA,
    attempt:{
      id:"retry-"+suffix,notificationId:notifications.rows[0].id,channel:"email",provider:"fake",status:"pending",
      attemptNumber:1,idempotencyKey:"retry-key-"+suffix,availableAt:now,maxAttempts:3
    },db
  }));

  const failingRegistry=new NotificationProviderRegistry();
  let providerCalls=0;
  failingRegistry.register("email","fake",{
    async send(){
      providerCalls+=1;
      if(providerCalls===1)return{status:"failure",failureClass:"retryable",errorCode:"TEMPORARY",errorMessage:"temporary provider failure"};
      return{status:"success",providerMessageId:"provider-retry"};
    }
  });
  const retryWorker=new NotificationDeliveryWorker({
    transaction:tx,outboxRepository:outboxRepo,eventRepository:eventRepo,
    notificationEventProcessor:processor,notificationRepository:notificationRepo,
    deliveryAttemptRepository:deliveryRepo,providerRegistry:failingRegistry.providers,
    principalFactory:workerPrincipal,now:()=>now,batchSize:10,leaseMs:60000,maxAttempts:3,backoff:()=>1000
  });

  const firstDelivery=await retryWorker.processDeliveryAttempts(orgA);
  assert.equal(firstDelivery.length,1);
  assert.equal(firstDelivery[0].deliveryAttemptId,retryAttempt.id);
  assert.equal(firstDelivery[0].status,"retry_scheduled");

  const afterFailure=await tx(principalA,"delivery.read",db=>db.query(
    "SELECT id,status,attempt_number,available_at,locked_at FROM notification_delivery_attempts WHERE organization_id=$1 ORDER BY attempt_number,id",[orgA]
  ));
  const failedRow=afterFailure.rows.find(r=>r.id===retryAttempt.id);
  assert.equal(failedRow.status,"failed");
  assert.equal(failedRow.attempt_number,1);
  assert.equal(failedRow.locked_at,null);
  assert.equal(new Date(failedRow.available_at).getTime(),now.getTime());

  now=new Date(fixedNow.getTime()+1000);
  const second=await retryWorker.processDeliveryAttempts(orgA);
  assert.equal(second.length,1);
  assert.equal(second[0].status,"delivered");
  assert.equal(providerCalls,2);

  const attemptsAfterSuccess=await tx(principalA,"delivery.read",db=>db.query(
    "SELECT status,attempt_number FROM notification_delivery_attempts WHERE organization_id=$1 ORDER BY attempt_number,id",[orgA]
  ));
  assert.deepEqual(attemptsAfterSuccess.rows.map(r=>[r.status,r.attempt_number]),[["delivered",1],["failed",1],["delivered",2]]);

  const activeNotification=await tx(principalA,"delivery.active-notification",db=>notificationRepo.create({
    principal:principalA,
    notification:new (require("../src/models/notification").Notification)({
      id:"active-notification-"+suffix,organizationId:orgA,recipientId:principalA.userId,severity:"information",
      title:"Active delivery",message:"Active delivery",type:"event",deliveryKey:"active-delivery-"+suffix
    }),db
  }));
  const active=await tx(principalA,"delivery.active",db=>deliveryRepo.create({
    principal:principalA,attempt:{
      id:"active-"+suffix,notificationId:activeNotification.id,channel:"email",provider:"fake",
      status:"pending",attemptNumber:1,idempotencyKey:"active-key-"+suffix,availableAt:now,maxAttempts:3
    },db
  }));
  const claimedA=await tx(principalA,"delivery.claim-a",db=>deliveryRepo.claimBatch({principal:principalA,limit:1,now,leaseMs:60000,db}));
  assert.ok(claimedA.some(a=>a.id===active.id));
  const claimedB=await tx(principalA,"delivery.claim-b",db=>deliveryRepo.claimBatch({principal:principalA,limit:10,now,leaseMs:60000,db}));
  assert.equal(claimedB.some(a=>a.id===active.id),false);

  const stale=await tx(principalA,"delivery.stale",db=>deliveryRepo.create({
    principal:principalA,attempt:{
      id:"stale-"+suffix,notificationId:activeNotification.id,channel:"email",provider:"fake",
      status:"pending",attemptNumber:1,idempotencyKey:"stale-key-"+suffix,availableAt:now,lockedAt:new Date(now.getTime()-1),maxAttempts:3
    },db
  }));
  const recovered=await tx(principalA,"delivery.recover",db=>deliveryRepo.recoverStale({principal:principalA,now:new Date(now.getTime()+1),db}));
  assert.ok(recovered.some(a=>a.id===stale.id));
  const staleRow=await tx(principalA,"delivery.stale.read",db=>deliveryRepo.get({principal:principalA,deliveryAttemptId:stale.id,db}));
  assert.equal(staleRow.lockedAt,null);

  const isolated=await tx(principalB,"isolation",db=>Promise.all([
    db.query("SELECT id FROM notifications"),
    db.query("SELECT id FROM notification_delivery_attempts"),
    db.query("SELECT id FROM event_outbox")
  ]));
  assert.deepEqual(isolated.map(r=>r.rows),[[],[],[]]);

  const crossTenant=await tx(principalB,"cross-tenant",db=>deliveryRepo.get({principal:principalB,deliveryAttemptId:active.id,db}));
  assert.equal(crossTenant,null);

  const workerWithoutDispatch=new NotificationDeliveryWorker({
    transaction:tx,outboxRepository:outboxRepo,eventRepository:eventRepo,
    notificationEventProcessor:processor,notificationRepository:notificationRepo,
    deliveryAttemptRepository:deliveryRepo,providerRegistry:providers.providers,
    principalFactory:()=>({userId:"unauthorized-worker",organizationId:orgA,permissions:[]}),
    now:()=>now
  });
  await assert.rejects(()=>workerWithoutDispatch.processOrganization(orgA),/Not authorized/);
});
