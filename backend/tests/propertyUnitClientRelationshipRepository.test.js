const test=require("node:test"); const assert=require("node:assert/strict"); const {ClientPropertyRelationship}=require("../src/models/clientPropertyRelationship");
test("relationship model preserves historical ranges",()=>{
 const current=new ClientPropertyRelationship({id:"rel-1",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",unitId:"unit-1",relationshipType:"resident",startAt:"2026-01-01T00:00:00Z"});
 assert.equal(current.endAt,null);
 const historical=new ClientPropertyRelationship({id:"rel-2",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",unitId:"unit-1",relationshipType:"resident",startAt:"2025-01-01T00:00:00Z",endAt:"2025-12-31T00:00:00Z"});
 assert.equal(historical.endAt.toISOString(),"2025-12-31T00:00:00.000Z");
 assert.throws(()=>new ClientPropertyRelationship({id:"missing-start",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",relationshipType:"resident",startAt:null}),/startAt is required/);
 assert.throws(()=>new ClientPropertyRelationship({id:"empty-start",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",relationshipType:"resident",startAt:""}),/startAt is required/);
 assert.throws(()=>new ClientPropertyRelationship({id:"bad",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",relationshipType:"resident",startAt:"2026-02-01T00:00:00Z",endAt:"2026-01-01T00:00:00Z"}),/endAt must be after startAt/);
 assert.throws(()=>new ClientPropertyRelationship({id:"bad-null",organizationId:"org-1",clientId:"client-1",propertyId:"property-1",relationshipType:"resident",startAt:null}),/startAt is required/);
});
