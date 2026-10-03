const { Unit } = require("../models/unit");
class UnitRepository {
  constructor({ pool, clock = () => new Date() } = {}) { if (!pool) throw new Error("pool is required"); this.pool=pool; this.clock=clock; }
  async create({ principal, unit, db=this.pool }) {
    this.#requirePrincipal(principal); const record=new Unit({...unit,organizationId:principal.organizationId}); const now=this.clock();
    const result=await db.query(`INSERT INTO units (id,organization_id,property_id,unit_identifier,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,[record.id,principal.organizationId,record.propertyId,record.unitIdentifier,now]);
    await this.#audit(principal,"unit.created",record.id,null,record,db,now); return this.#map(result.rows[0]);
  }
  async get({principal,unitId,db=this.pool}) {
    this.#requirePrincipal(principal); const result=await db.query("SELECT * FROM units WHERE organization_id=$1 AND id=$2",[principal.organizationId,unitId]);
    return result.rows[0]?this.#map(result.rows[0]):null;
  }
  async listByProperty({principal,propertyId,db=this.pool}={}) {
    this.#requirePrincipal(principal); const result=await db.query("SELECT * FROM units WHERE organization_id=$1 AND property_id=$2 ORDER BY created_at ASC,id ASC",[principal.organizationId,propertyId]);
    return result.rows.map(row=>this.#map(row));
  }
  #map(row){return new Unit({id:row.id,organizationId:row.organization_id,propertyId:row.property_id,unitIdentifier:row.unit_identifier});}
  async #audit(principal,action,entityId,previousValue,newValue,db,createdAt){
    await db.query(`INSERT INTO audit_events (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
      VALUES (gen_random_uuid()::text,$1,$2,$3,'unit',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId,principal.userId,action,entityId,previousValue?JSON.stringify(previousValue):null,JSON.stringify(newValue),createdAt]);
  }
  #requirePrincipal(principal){if(!principal?.userId||!principal?.organizationId)throw new Error("Trusted principal is required");}
}
module.exports={UnitRepository};
