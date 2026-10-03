const { ClientPropertyRelationship } = require("../models/clientPropertyRelationship");
class ClientPropertyRelationshipRepository {
  constructor({pool,clock=()=>new Date()}={}){if(!pool)throw new Error("pool is required");this.pool=pool;this.clock=clock;}
  async create({principal,relationship,db=this.pool}){
    this.#requirePrincipal(principal); const record=new ClientPropertyRelationship({...relationship,organizationId:principal.organizationId}); const now=this.clock();
    const result=await db.query(`INSERT INTO client_property_relationships
      (id,organization_id,client_id,property_id,unit_id,relationship_type,start_at,end_at,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [record.id,principal.organizationId,record.clientId,record.propertyId,record.unitId,record.relationshipType,record.startAt,record.endAt,now]);
    await this.#audit(principal,"client-property-relationship.created",record.id,null,record,db,now); return this.#map(result.rows[0]);
  }
  async get({principal,relationshipId,db=this.pool}){
    this.#requirePrincipal(principal); const result=await db.query("SELECT * FROM client_property_relationships WHERE organization_id=$1 AND id=$2",[principal.organizationId,relationshipId]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }
  async listByClient({principal,clientId,db=this.pool}={}){
    this.#requirePrincipal(principal); const result=await db.query("SELECT * FROM client_property_relationships WHERE organization_id=$1 AND client_id=$2 ORDER BY start_at DESC,id DESC",[principal.organizationId,clientId]);
    return result.rows.map(row=>this.#map(row));
  }
  async listByProperty({principal,propertyId,unitId=null,db=this.pool}={}){
    this.#requirePrincipal(principal); const values=[principal.organizationId,propertyId]; const filters=["organization_id=$1","property_id=$2"];
    if(unitId){values.push(unitId);filters.push(`unit_id=$${values.length}`);}
    const result=await db.query(`SELECT * FROM client_property_relationships WHERE ${filters.join(" AND ")} ORDER BY start_at DESC,id DESC`,values);
    return result.rows.map(row=>this.#map(row));
  }
  async close({principal,relationshipId,endAt,db=this.pool}){
    this.#requirePrincipal(principal); const end=new Date(endAt); if(Number.isNaN(end.getTime()))throw new Error("endAt must be a valid date");
    const current=await this.get({principal,relationshipId,db}); if(!current)throw new Error("Client-property relationship not found");
    if(current.endAt)throw new Error("Client-property relationship is already closed"); if(end<=current.startAt)throw new Error("endAt must be after startAt");
    const result=await db.query("UPDATE client_property_relationships SET end_at=$3 WHERE organization_id=$1 AND id=$2 AND end_at IS NULL RETURNING *",[principal.organizationId,relationshipId,end]);
    if(!result.rowCount)throw new Error("Client-property relationship is already closed");
    const saved=this.#map(result.rows[0]); await this.#audit(principal,"client-property-relationship.closed",relationshipId,current,saved,db,this.clock()); return saved;
  }
  #map(row){return new ClientPropertyRelationship({id:row.id,organizationId:row.organization_id,clientId:row.client_id,propertyId:row.property_id,unitId:row.unit_id,relationshipType:row.relationship_type,startAt:row.start_at,endAt:row.end_at,createdAt:row.created_at});}
  async #audit(principal,action,entityId,previousValue,newValue,db,createdAt){
    await db.query(`INSERT INTO audit_events (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
      VALUES (gen_random_uuid()::text,$1,$2,$3,'client_property_relationship',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId,principal.userId,action,entityId,previousValue?JSON.stringify(previousValue):null,JSON.stringify(newValue),createdAt]);
  }
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}
module.exports={ClientPropertyRelationshipRepository};
