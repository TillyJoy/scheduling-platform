const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");

const shouldRun=process.env.DATABASE_URL&&process.env.RUN_POSTGRES_TESTS==="1";

test("Field Visit and Actual Work domain events/outbox share the originating PostgreSQL transaction",{skip:!shouldRun},async t=>{
  const {createDatabasePool,runMigrations,withTransaction}=require("../src/database");
  const {JobService}=require("../src/services/jobService");
  const {WorkOrderService}=require("../src/services/workOrderService");
  const {FieldVisitService}=require("../src/services/fieldVisitService");
  const {ActualWorkService}=require("../src/services/actualWorkService");
  const {DomainEventService}=require("../src/services/domainEventService");
  const {DomainEventRepository}=require("../src/repositories/domainEventRepository");
  const {DomainEventOutboxRepository}=require("../src/repositories/domainEventOutboxRepository");
  const {FieldVisitRepository}=require("../src/repositories/fieldVisitRepository");
  const {ActualWorkRepository}=require("../src/repositories/actualWorkRepository");

  const pool=createDatabasePool();
  const suffix=randomUUID();
  const organizationId="tx-fixture-"+suffix;
  const role="tx_app_test_"+suffix.replace(/[^a-zA-Z0-9_]/g,"_");
  const principal={
    userId:"worker-"+suffix,
    organizationId,
    permissions:[
      "fieldVisit:create","fieldVisit:read","fieldVisit:update",
      "actualWork:create","actualWork:read","fieldExecution:sync",
      "workOrder:create","event:emit","event:read"
    ]
  };

  await runMigrations(pool);
  const transaction=(p,action,work)=>withTransaction(pool,{
    organizationId:p.organizationId,userId:p.userId,action
  },async db=>{
    await db.query('SET LOCAL ROLE "'+role+'"');
    return work(db);
  });

  await pool.query("INSERT INTO organizations(id,name) VALUES($1,$2)",[organizationId,"Transaction Integrity Test"]);
  await pool.query('CREATE ROLE "'+role+'" NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO "'+role+'"');
  await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,field_visits,actual_work,domain_events,event_outbox,audit_events TO "'+role+'"');

  const jobService=new JobService({authorize:()=>true});
  const workOrderService=new WorkOrderService({jobService});
  jobService.create({principal,id:"job-"+suffix,organizationId,title:"Transaction test job"});
  workOrderService.create({principal,id:"wo-"+suffix,organizationId,jobId:"job-"+suffix});

  const appointmentStore=new Map([[
    JSON.stringify([organizationId,"appointment-"+suffix]),
    {id:"appointment-"+suffix,organizationId,workOrderId:"wo-"+suffix,memberIds:["resource-"+suffix]}
  ]]);

  const fieldVisitRepository=new FieldVisitRepository({pool});
  const actualWorkRepository=new ActualWorkRepository({pool});
  const eventRepository=new DomainEventRepository({pool});
  const outboxRepository=new DomainEventOutboxRepository({pool});
  const domainEventService=new DomainEventService({eventRepository,outboxRepository,transaction});

  const makeServices=(eventService=domainEventService)=>({
    fieldVisitService:new FieldVisitService({
      appointmentStore,workOrderService,fieldVisitRepository,transaction,domainEventService:eventService
    }),
    actualWorkService:new ActualWorkService({
      fieldVisitRepository,actualWorkRepository,transaction,domainEventService:eventService
    })
  });

  async function counts(){
    return transaction(principal,"test.counts",async db=>{
      const fieldVisits=await db.query("SELECT count(*)::int AS count FROM field_visits WHERE organization_id=$1",[organizationId]);
      const actualWork=await db.query("SELECT count(*)::int AS count FROM actual_work WHERE organization_id=$1",[organizationId]);
      const events=await db.query("SELECT count(*)::int AS count FROM domain_events WHERE organization_id=$1",[organizationId]);
      const outbox=await db.query("SELECT count(*)::int AS count FROM event_outbox WHERE organization_id=$1",[organizationId]);
      return {
        fieldVisits:fieldVisits.rows[0].count,
        actualWork:actualWork.rows[0].count,
        events:events.rows[0].count,
        outbox:outbox.rows[0].count
      };
    });
  }

  t.after(async()=>{
    try{
      await pool.query("DELETE FROM event_outbox WHERE organization_id=$1",[organizationId]);
      await pool.query("DELETE FROM domain_events WHERE organization_id=$1",[organizationId]);
      await pool.query("DELETE FROM actual_work WHERE organization_id=$1",[organizationId]);
      await pool.query("DELETE FROM field_visits WHERE organization_id=$1",[organizationId]);
      await pool.query("DELETE FROM audit_events WHERE organization_id=$1",[organizationId]);
    }catch{}
    try{await pool.query('DROP ROLE IF EXISTS "'+role+'"');}catch{}
    await pool.end();
  });

  await t.test("successful Field Visit mutation persists business row, Domain Event, and Outbox atomically",async()=>{
    const {fieldVisitService}=makeServices();
    const visitId="visit-success-"+suffix;
    const before=await counts();

    const visit=await fieldVisitService.create({
      principal,id:visitId,appointmentId:"appointment-"+suffix,workOrderId:"wo-"+suffix,
      resourceIds:["resource-"+suffix],statusCode:"scheduled",occurredAt:new Date("2026-10-06T10:00:00Z")
    });
    assert.equal(visit.id,visitId);

    const after=await counts();
    assert.equal(after.fieldVisits,before.fieldVisits+1);
    assert.equal(after.events,before.events+1);
    assert.equal(after.outbox,before.outbox+1);

    const event=await transaction(principal,"test.field-event",db=>eventRepository.list({principal,entityType:"field_visit",entityId:visitId,db}));
    const outbox=await transaction(principal,"test.field-outbox",db=>outboxRepository.listPending({principal,db}));
    assert.equal(event.length,1);
    assert.equal(outbox.filter(entry=>entry.entityId===visitId).length,1);
    assert.equal(outbox.find(entry=>entry.entityId===visitId).eventId,event[0].id);
  });

  await t.test("successful Actual Work mutation persists business row, Domain Event, and Outbox atomically",async()=>{
    const {actualWorkService}=makeServices();
    const workId="work-success-"+suffix;

    const work=await actualWorkService.create({
      principal,id:workId,fieldVisitId:"visit-success-"+suffix,workOrderId:"wo-"+suffix,
      resourceId:"resource-"+suffix,description:"Atomic actual work",
      actualStartTime:"2026-10-06T10:10:00Z",actualEndTime:"2026-10-06T10:45:00Z",
      quantity:1,unit:"unit",occurredAt:new Date("2026-10-06T10:45:00Z")
    });
    assert.equal(work.id,workId);

    const event=await transaction(principal,"test.work-event",db=>eventRepository.list({principal,entityType:"actual_work",entityId:workId,db}));
    const outbox=await transaction(principal,"test.work-outbox",db=>outboxRepository.listPending({principal,db}));
    assert.equal(event.length,1);
    assert.equal(outbox.filter(entry=>entry.entityId===workId).length,1);
    assert.equal(outbox.find(entry=>entry.entityId===workId).eventId,event[0].id);
  });

  await t.test("Field Visit rollback removes business row, Domain Event, and Outbox together",async()=>{
    const {fieldVisitService}=makeServices();
    const visitId="visit-rollback-"+suffix;
    await assert.rejects(
      ()=>transaction(principal,"test.field-rollback",async db=>{
        await fieldVisitService.create({
          principal,id:visitId,appointmentId:"appointment-"+suffix,workOrderId:"wo-"+suffix,
          resourceIds:["resource-"+suffix],statusCode:"scheduled",db,occurredAt:new Date("2026-10-06T11:00:00Z")
        });
        throw new Error("force originating transaction rollback");
      }),
      /force originating transaction rollback/
    );

    const row=await transaction(principal,"test.field-rollback-check",db=>db.query(
      "SELECT (SELECT count(*) FROM field_visits WHERE organization_id=$1 AND id=$2) AS field_visits, (SELECT count(*) FROM domain_events WHERE organization_id=$1 AND entity_id=$2) AS events, (SELECT count(*) FROM event_outbox WHERE organization_id=$1 AND entity_id=$2) AS outbox",
      [organizationId,visitId]
    ));
    assert.deepEqual(row.rows[0],{field_visits:"0",events:"0",outbox:"0"});
  });

  await t.test("Actual Work rollback removes business row, Domain Event, and Outbox together",async()=>{
    const {actualWorkService}=makeServices();
    const workId="work-rollback-"+suffix;
    await assert.rejects(
      ()=>transaction(principal,"test.work-rollback",async db=>{
        await actualWorkService.create({
          principal,id:workId,fieldVisitId:"visit-success-"+suffix,workOrderId:"wo-"+suffix,
          resourceId:"resource-"+suffix,description:"Rollback actual work",
          actualStartTime:"2026-10-06T11:10:00Z",actualEndTime:"2026-10-06T11:45:00Z",
          quantity:1,unit:"unit",db,occurredAt:new Date("2026-10-06T11:45:00Z")
        });
        throw new Error("force originating transaction rollback");
      }),
      /force originating transaction rollback/
    );

    const row=await transaction(principal,"test.work-rollback-check",db=>db.query(
      "SELECT (SELECT count(*) FROM actual_work WHERE organization_id=$1 AND id=$2) AS actual_work, (SELECT count(*) FROM domain_events WHERE organization_id=$1 AND entity_id=$2) AS events, (SELECT count(*) FROM event_outbox WHERE organization_id=$1 AND entity_id=$2) AS outbox",
      [organizationId,workId]
    ));
    assert.deepEqual(row.rows[0],{actual_work:"0",events:"0",outbox:"0"});
  });

  await t.test("Outbox persistence failure rolls back the originating Actual Work and Domain Event",async()=>{
    const workId="work-event-failure-"+suffix;
    const failingOutbox={
      enqueue:async()=>{throw new Error("forced outbox persistence failure");}
    };
    const failingEventService=new DomainEventService({eventRepository,outboxRepository:failingOutbox,transaction});
    const {actualWorkService}=makeServices(failingEventService);

    await assert.rejects(
      ()=>actualWorkService.create({
        principal,id:workId,fieldVisitId:"visit-success-"+suffix,workOrderId:"wo-"+suffix,
        resourceId:"resource-"+suffix,description:"Event failure rollback",
        actualStartTime:"2026-10-06T12:10:00Z",actualEndTime:"2026-10-06T12:45:00Z",
        quantity:1,unit:"unit",occurredAt:new Date("2026-10-06T12:45:00Z")
      }),
      /forced outbox persistence failure/
    );

    const row=await transaction(principal,"test.event-failure-check",db=>db.query(
      "SELECT (SELECT count(*) FROM actual_work WHERE organization_id=$1 AND id=$2) AS actual_work, (SELECT count(*) FROM domain_events WHERE organization_id=$1 AND entity_id=$2) AS events, (SELECT count(*) FROM event_outbox WHERE organization_id=$1 AND entity_id=$2) AS outbox",
      [organizationId,workId]
    ));
    assert.deepEqual(row.rows[0],{actual_work:"0",events:"0",outbox:"0"});
  });
});
