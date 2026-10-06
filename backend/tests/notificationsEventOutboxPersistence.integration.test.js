const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const shouldRun=process.env.DATABASE_URL&&process.env.RUN_POSTGRES_TESTS==="1";

test("durable Notifications / Domain Events / Outbox are tenant-safe, replay-safe, and transactional",{skip:!shouldRun},async t=>{
  const {createDatabasePool,runMigrations,withTransaction}=require("../src/database");
  const {Notification}=require("../src/models/notification");
  const {DomainEvent}=require("../src/models/domainEvent");
  const {DomainEventRepository}=require("../src/repositories/domainEventRepository");
  const {DomainEventOutboxRepository}=require("../src/repositories/domainEventOutboxRepository");
  const {NotificationRepository}=require("../src/repositories/notificationRepository");
  const {NotificationDeliveryAttemptRepository}=require("../src/repositories/notificationDeliveryAttemptRepository");
  const {NotificationService}=require("../src/services/notificationService");
  const pool=createDatabasePool();
  const suffix=randomUUID();
  const orgA="notify-a-"+suffix,orgB="notify-b-"+suffix;
  const role="notify_app_test_"+suffix.replace(/[^a-zA-Z0-9_]/g,"_");
  const permissions=["event:emit","event:read","event:dispatch","notification:create","notification:read","notification:acknowledge","notification:dismiss","notification:manage"];
  const principalA={userId:"user-a-"+suffix,organizationId:orgA,permissions};
  const principalB={userId:"user-b-"+suffix,organizationId:orgB,permissions};

  await runMigrations(pool);
  const transaction=(principal,action,work)=>withTransaction(pool,{organizationId:principal.organizationId,userId:principal.userId,action},async db=>{
    await db.query('SET LOCAL ROLE "'+role+'"');
    return work(db);
  });
  const eventRepo=new DomainEventRepository({pool});
  const outboxRepo=new DomainEventOutboxRepository({pool});
  const notificationRepo=new NotificationRepository({pool});
  const deliveryRepo=new NotificationDeliveryAttemptRepository({pool});
  const notificationService=new NotificationService({notificationRepository:notificationRepo,transaction});

  t.after(async()=>{
    for(const org of [orgA,orgB]) await transaction({userId:"cleanup",organizationId:org,permissions},"test.cleanup",async db=>{
      await db.query("DELETE FROM notification_delivery_attempts WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM notifications WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM event_outbox WHERE organization_id=$1",[org]);
      await db.query("DELETE FROM domain_events WHERE organization_id=$1",[org]);
    }).catch(()=>{});
    try{
      await pool.query("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1) THEN EXECUTE 'DROP OWNED BY ""'||$1||'""'; END IF; END $$;",[role]).catch(()=>{});
    }finally{await pool.end();}
  });

  await pool.query("INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)",[orgA,"Notify A",orgB,"Notify B"]);
  await pool.query('CREATE ROLE "'+role+'" NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON domain_events,event_outbox,notifications,notification_delivery_attempts TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT ON audit_events TO "'+role+'"');

  const event=new DomainEvent({id:"event-1-"+suffix,organizationId:orgA,eventType:"job.status.changed",entityType:"job",entityId:"job-1",actorUserId:principalA.userId,
    payload:{previousStatus:"new",newStatus:"ready"},source:"application",correlationId:"corr-"+suffix,causationId:"cause-"+suffix});
  await transaction(principalA,"event.emit",db=>eventRepo.create({principal:principalA,event,db}));
  await transaction(principalA,"outbox.enqueue",db=>outboxRepo.enqueue({principal:principalA,event,db}));

  const freshEventRepo=new DomainEventRepository({pool});
  const freshOutboxRepo=new DomainEventOutboxRepository({pool});
  const readEvent=await transaction(principalA,"event.read",db=>freshEventRepo.get({principal:principalA,eventId:event.id,db}));
  const pending=await transaction(principalA,"outbox.list",db=>freshOutboxRepo.listPending({principal:principalA,db}));
  assert.equal(readEvent.id,event.id);
  assert.equal(readEvent.correlationId,event.correlationId);
  assert.equal(pending.length,1);
  assert.equal(pending[0].eventId,event.id);

  const claimed=await transaction(principalA,"outbox.claim",db=>freshOutboxRepo.claimBatch({principal:principalA,limit:1,now:new Date(Date.now()+1000),db}));
  assert.equal(claimed[0].status,"processing");
  assert.equal(claimed[0].attempts,1);
  await transaction(principalA,"outbox.publish",db=>freshOutboxRepo.markPublished({principal:principalA,outboxId:claimed[0].id,db}));

  const notification=new Notification({id:"notification-1-"+suffix,organizationId:orgA,recipientId:principalA.userId,severity:"important",title:"Status changed",
    message:"Job is ready.",type:"event",sourceEventId:event.id,sourceEventType:event.eventType,deliveryKey:"delivery-"+suffix,
    templateId:"template-1",templateVersion:2,metadata:{source:"test"}});
  await transaction(principalA,"notification.create",db=>notificationService.create({principal:principalA,...notification}));
  const freshNotificationService=new NotificationService({notificationRepository:new NotificationRepository({pool}),transaction});
  const persisted=await freshNotificationService.listForRecipient({principal:principalA});
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].templateVersion,2);
  await freshNotificationService.markRead({principal:principalA,notificationId:notification.id});
  assert.equal((await freshNotificationService.listForRecipient({principal:principalA,status:"read"})).length,1);

  const attempt={id:"attempt-1-"+suffix,notificationId:notification.id,channel:"email",status:"pending",attemptNumber:1,idempotencyKey:"attempt-key-"+suffix};
  await transaction(principalA,"delivery.create",db=>deliveryRepo.create({principal:principalA,attempt,db}));
  const freshDeliveryRepo=new NotificationDeliveryAttemptRepository({pool});
  assert.equal((await transaction(principalA,"delivery.list",db=>freshDeliveryRepo.listForNotification({principal:principalA,notificationId:notification.id,db}))).length,1);
  assert.equal((await transaction(principalA,"delivery.sent",db=>freshDeliveryRepo.updateStatus({principal:principalA,deliveryAttemptId:attempt.id,status:"sent",db}))).status,"sent");
  assert.equal((await transaction(principalA,"delivery.delivered",db=>freshDeliveryRepo.updateStatus({principal:principalA,deliveryAttemptId:attempt.id,status:"delivered",db}))).status,"delivered");

  const isolated=await transaction(principalB,"isolation",db=>Promise.all([
    db.query("SELECT id FROM domain_events"),
    db.query("SELECT event_id FROM event_outbox"),
    db.query("SELECT id FROM notifications"),
    db.query("SELECT id FROM notification_delivery_attempts")
  ]));
  assert.deepEqual(isolated.map(x=>x.rows),[[],[],[],[]]);

  await assert.rejects(
    ()=>transaction(principalA,"notification.cross-tenant",db=>notificationRepo.create({principal:principalA,notification:new Notification({id:"cross-"+suffix,organizationId:orgB,recipientId:principalB.userId,title:"Cross",message:"x"}),db})),
    /organization mismatch|violates row-level security/i
  );

  await assert.rejects(
    ()=>transaction(principalA,"notification.rollback",async db=>{
      await notificationRepo.create({principal:principalA,notification:new Notification({id:"rollback-"+suffix,organizationId:orgA,recipientId:principalA.userId,title:"Rollback",message:"rollback"}),db});
      throw new Error("force rollback");
    }),/force rollback/
  );
  const rollbackCheck=await transaction(principalA,"rollback.check",db=>db.query("SELECT count(*)::int AS count FROM notifications WHERE organization_id=$1 AND id=$2",[orgA,"rollback-"+suffix]));
  assert.equal(rollbackCheck.rows[0].count,0);

  await assert.rejects(
    ()=>transaction(principalA,"notification.duplicate",db=>notificationRepo.create({principal:principalA,notification:new Notification({id:"notification-duplicate-"+suffix,organizationId:orgA,recipientId:principalA.userId,title:"Duplicate",message:"x",deliveryKey:"delivery-"+suffix}),db})),
    /duplicate|unique/i
  );
  const audits=await transaction(principalA,"audit.read",db=>db.query("SELECT action,entity_type FROM audit_events WHERE organization_id=$1",[orgA]));
  assert.ok(audits.rows.some(row=>row.action==="notification.created"&&row.entity_type==="notification"));
});
