const test=require("node:test"); const assert=require("node:assert/strict"); const {randomUUID}=require("node:crypto");
const {createDatabasePool,runMigrations,withTransaction}=require("../src/database");
const {ClientPropertyRelationshipRepository}=require("../src/repositories/clientPropertyRelationshipRepository"); const {PropertyRepository}=require("../src/repositories/propertyRepository"); const {UnitRepository}=require("../src/repositories/unitRepository"); const {ClientRepository}=require("../src/repositories/clientRepository"); const {ClientPropertyRelationshipService}=require("../src/services/clientPropertyRelationshipService");
const shouldRun=process.env.DATABASE_URL&&process.env.RUN_POSTGRES_TESTS==="1";
test("durable property/unit/client relationships preserve history, auditability, and tenant isolation",{skip:!shouldRun},async()=>{
 const pool=createDatabasePool(); await runMigrations(pool); const runId=randomUUID(); const organizationId=`relationship-test-org-${runId}`; const otherOrganizationId=`other-org-${runId}`;
 const ids={client:`client-r1-${runId}`,otherClient:`client-r2-${runId}`,property:`property-r1-${runId}`,unit:`unit-r1-${runId}`,first:`rel-r1-${runId}`,current:`rel-r2-${runId}`};
 const principal={userId:`relationship-test-user-${runId}`,organizationId,permissions:["property:create","unit:create","clientPropertyRelationship:create","clientPropertyRelationship:update","clientPropertyRelationship:read"]};
 const other={...principal,userId:`other-user-${runId}`,organizationId:otherOrganizationId}; const now=new Date("2026-10-03T12:00:00Z"); const transaction=(p,a,w)=>withTransaction(pool,{organizationId:p.organizationId,userId:p.userId,action:a},w);
 const propertyRepository=new PropertyRepository({pool,clock:()=>now}); const unitRepository=new UnitRepository({pool,clock:()=>now}); const clientRepository=new ClientRepository({pool,clock:()=>now}); const relationshipRepository=new ClientPropertyRelationshipRepository({pool,clock:()=>now}); const service=new ClientPropertyRelationshipService({clientRepository,propertyRepository,unitRepository,relationshipRepository,transaction});
 const clean=async organizationId=>withTransaction(pool,{organizationId,userId:`cleanup-${runId}`,action:"test.cleanup"},async db=>{await db.query("DELETE FROM client_property_relationships WHERE organization_id=$1",[organizationId]);await db.query("DELETE FROM units WHERE organization_id=$1",[organizationId]);await db.query("DELETE FROM properties WHERE organization_id=$1",[organizationId]);await db.query("DELETE FROM clients WHERE organization_id=$1",[organizationId]);});
 try{
  await pool.query("INSERT INTO organizations (id,name) VALUES ($1,$2),($3,$4)",[organizationId,"Relationship Test",otherOrganizationId,"Other"]);
  await pool.query("INSERT INTO clients (id,organization_id,first_name,last_name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)",[ids.client,organizationId,"Test","One",ids.otherClient,otherOrganizationId,"Test","Two"]);
  const property=await service.createProperty({principal,id:ids.property,address:"1 Main St",city:"Example",state:"MA"}); const unit=await service.createUnit({principal,id:ids.unit,propertyId:property.id,unitIdentifier:"1"});
  const first=await service.createRelationship({principal,id:ids.first,clientId:ids.client,propertyId:property.id,unitId:unit.id,relationshipType:"resident",startAt:"2026-01-01T00:00:00Z"});
  const closed=await service.closeRelationship({principal,relationshipId:first.id,endAt:"2026-06-30T00:00:00Z"}); assert.equal(closed.endAt.toISOString(),"2026-06-30T00:00:00.000Z");
  const current=await service.createRelationship({principal,id:ids.current,clientId:ids.client,propertyId:property.id,unitId:unit.id,relationshipType:"resident",startAt:"2026-07-01T00:00:00Z"});
  assert.equal((await service.listClientRelationships({principal,clientId:ids.client})).length,2); assert.equal((await service.listPropertyRelationships({principal,propertyId:property.id,unitId:unit.id})).length,2);
  await assert.rejects(service.createRelationship({principal,id:`rel-r3-${runId}`,clientId:ids.client,propertyId:property.id,unitId:unit.id,relationshipType:"resident",startAt:"2026-08-01T00:00:00Z"}),/duplicate key/);
  assert.equal((await service.listClientRelationships({principal:other,clientId:ids.client})).length,0);
  const audit=await pool.query("SELECT action FROM audit_events WHERE organization_id=$1 ORDER BY created_at,id",[principal.organizationId]); assert.deepEqual(audit.rows.map(r=>r.action).sort(),["client-property-relationship.closed","client-property-relationship.created","client-property-relationship.created","property.created","unit.created"].sort());
  assert.equal((await relationshipRepository.get({principal,relationshipId:current.id})).id,current.id);
 } finally {await clean(organizationId);await clean(otherOrganizationId);await pool.end();}
});
