const { SchedulingHold } = require("../models/schedulingHold");

class SchedulingHoldRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, hold, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new SchedulingHold({ ...hold, organizationId: principal.organizationId });
    const now = this.clock();
    if (record.expiresAt <= now) throw new Error("expiresAt must be in the future");
    const result = await db.query(
      `INSERT INTO scheduling_holds
        (id,organization_id,scheduler_id,client_id,property_id,work_order_id,department_id,zone_id,
         start_time,end_time,expires_at,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING *`,
      [record.id,principal.organizationId,record.schedulerId,record.clientId,record.propertyId,record.workOrderId,
       record.departmentId,record.zoneId,record.startTime,record.endTime,record.expiresAt,record.status,now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#replaceResources({ principal, hold: saved, db });
    await this.#audit(principal, "scheduling-hold.created", saved.id, null, saved, db, now);
    return saved;
  }

  async get({ principal, holdId, db = this.pool, forUpdate = false }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      `SELECT * FROM scheduling_holds
       WHERE organization_id=$1 AND id=$2
       ${forUpdate ? "FOR UPDATE" : ""}`,
      [principal.organizationId, holdId]
    );
    if (!result.rows[0]) return null;
    return this.#map(result.rows[0], await this.#resources(principal, holdId, db));
  }

  async update({ principal, hold, previous = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new SchedulingHold({ ...hold, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `UPDATE scheduling_holds
       SET scheduler_id=$3,client_id=$4,property_id=$5,work_order_id=$6,department_id=$7,zone_id=$8,
           start_time=$9,end_time=$10,expires_at=$11,status=$12,updated_at=$13
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [principal.organizationId,record.id,record.schedulerId,record.clientId,record.propertyId,record.workOrderId,
       record.departmentId,record.zoneId,record.startTime,record.endTime,record.expiresAt,record.status,now]
    );
    if (!result.rows[0]) return null;
    const saved = this.#map(result.rows[0], record.memberIds);
    await this.#replaceResources({ principal, hold: saved, db });
    await this.#audit(principal, `scheduling-hold.${saved.status}`, saved.id, previous, saved, db, now);
    return saved;
  }

  async list({ principal, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM scheduling_holds WHERE organization_id=$1 ORDER BY start_time, id",
      [principal.organizationId]
    );
    return Promise.all(result.rows.map(async row => this.#map(row, await this.#resources(principal, row.id, db))));
  }

  async findConflicts({ principal, startTime, endTime, resourceIds, excludeHoldId = null, db = this.pool }) {
    this.#requirePrincipal(principal);
    if (!resourceIds.length) return [];
    const result = await db.query(
      `SELECT DISTINCT h.*
       FROM scheduling_holds h
       JOIN scheduling_hold_resources hr
         ON hr.organization_id=h.organization_id AND hr.hold_id=h.id
       WHERE h.organization_id=$1
         AND hr.resource_id=ANY($2::text[])
         AND h.start_time < $4
         AND h.end_time > $3
         AND h.id <> COALESCE($5,'')
         AND h.status='active'
         AND h.expires_at > $6
       ORDER BY h.start_time,h.id`,
      [principal.organizationId,resourceIds,startTime,endTime,excludeHoldId,this.clock()]
    );
    return Promise.all(result.rows.map(async row => this.#map(row, await this.#resources(principal, row.id, db))));
  }

  async #resources(principal, holdId, db) {
    const result = await db.query(
      "SELECT resource_id, role FROM scheduling_hold_resources WHERE organization_id=$1 AND hold_id=$2 ORDER BY scheduling_hold_resource_id",
      [principal.organizationId, holdId]
    );
    return result.rows.map(row => row.resource_id);
  }

  async #replaceResources({ principal, hold, db }) {
    await db.query("DELETE FROM scheduling_hold_resources WHERE organization_id=$1 AND hold_id=$2", [principal.organizationId, hold.id]);
    for (const [index, resourceId] of hold.memberIds.entries()) {
      await db.query(
        `INSERT INTO scheduling_hold_resources
          (scheduling_hold_resource_id,organization_id,hold_id,resource_id,role)
         VALUES ($1,$2,$3,$4,$5)`,
        [`${hold.id}:resource:${index}`,principal.organizationId,hold.id,resourceId,null]
      );
    }
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'scheduling_hold',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId,principal.userId,action,entityId,
       previousValue ? JSON.stringify(previousValue) : null,JSON.stringify(newValue),createdAt]
    );
  }

  #map(row, resourceIds = []) {
    if (!row) return null;
    return new SchedulingHold({
      id: row.id,
      organizationId: row.organization_id,
      schedulerId: row.scheduler_id,
      clientId: row.client_id,
      propertyId: row.property_id,
      workOrderId: row.work_order_id,
      departmentId: row.department_id,
      zoneId: row.zone_id,
      memberIds: resourceIds,
      startTime: row.start_time,
      endTime: row.end_time,
      expiresAt: row.expires_at,
      status: row.status
    });
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports={ SchedulingHoldRepository };
