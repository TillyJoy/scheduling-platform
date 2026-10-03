const { ResourceQualification } = require("../models/resourceQualification");

class ResourceQualificationRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, resourceQualification, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new ResourceQualification({ ...resourceQualification, organizationId: principal.organizationId });
    const now = this.clock();
    const result = await db.query(
      `INSERT INTO resource_qualifications
        (resource_qualification_id,organization_id,resource_id,qualification_id,service_ref,status_code,
         effective_at,expiration_at,restrictions,verification_status,verification_metadata,verified_at,verifier_ref,evidence_refs,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13,$14::jsonb,$15,$15)
       RETURNING *`,
      [record.resourceQualificationId, principal.organizationId, record.resourceId, record.qualificationId,
        record.serviceRef, record.statusCode, record.effectiveAt, record.expirationAt,
        JSON.stringify(record.restrictions), record.verificationStatus, JSON.stringify(record.verificationMetadata),
        record.verifiedAt, record.verifierRef, JSON.stringify(record.evidenceRefs), now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "resource-qualification.created", saved.resourceQualificationId, null, saved, db, now);
    return saved;
  }

  async get({ principal, resourceQualificationId, db = this.pool }) {
    this.#requirePrincipal(principal);
    const result = await db.query(
      "SELECT * FROM resource_qualifications WHERE organization_id=$1 AND resource_qualification_id=$2",
      [principal.organizationId, resourceQualificationId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async list({ principal, resourceId = null, qualificationId = null, serviceRef = null, db = this.pool } = {}) {
    this.#requirePrincipal(principal);
    const values = [principal.organizationId];
    const filters = ["organization_id=$1"];
    for (const [column, value] of [["resource_id", resourceId], ["qualification_id", qualificationId], ["service_ref", serviceRef]]) {
      if (value !== null) {
        values.push(value);
        filters.push(`${column}=$${values.length}`);
      }
    }
    const result = await db.query(
      `SELECT * FROM resource_qualifications WHERE ${filters.join(" AND ")}
       ORDER BY effective_at DESC NULLS LAST, resource_qualification_id DESC`,
      values
    );
    return result.rows.map(row => this.#map(row));
  }

  async update({ principal, resourceQualification, db = this.pool }) {
    this.#requirePrincipal(principal);
    const record = new ResourceQualification({ ...resourceQualification, organizationId: principal.organizationId });
    const existing = await this.get({ principal, resourceQualificationId: record.resourceQualificationId, db });
    if (!existing) return null;
    const now = this.clock();
    const result = await db.query(
      `UPDATE resource_qualifications
       SET resource_id=$3,qualification_id=$4,service_ref=$5,status_code=$6,effective_at=$7,expiration_at=$8,
           restrictions=$9::jsonb,verification_status=$10,verification_metadata=$11::jsonb,verified_at=$12,
           verifier_ref=$13,evidence_refs=$14::jsonb,updated_at=$15
       WHERE organization_id=$1 AND resource_qualification_id=$2
       RETURNING *`,
      [principal.organizationId, record.resourceQualificationId, record.resourceId, record.qualificationId, record.serviceRef,
        record.statusCode, record.effectiveAt, record.expirationAt, JSON.stringify(record.restrictions),
        record.verificationStatus, JSON.stringify(record.verificationMetadata), record.verifiedAt,
        record.verifierRef, JSON.stringify(record.evidenceRefs), now]
    );
    const saved = this.#map(result.rows[0]);
    await this.#audit(principal, "resource-qualification.updated", saved.resourceQualificationId, existing, saved, db, now);
    return saved;
  }

  #map(row) {
    return new ResourceQualification({
      resourceQualificationId: row.resource_qualification_id,
      organizationId: row.organization_id,
      resourceId: row.resource_id,
      qualificationId: row.qualification_id,
      serviceRef: row.service_ref,
      statusCode: row.status_code,
      effectiveAt: row.effective_at,
      expirationAt: row.expiration_at,
      restrictions: row.restrictions,
      verificationStatus: row.verification_status,
      verificationMetadata: row.verification_metadata,
      verifiedAt: row.verified_at,
      verifierRef: row.verifier_ref,
      evidenceRefs: row.evidence_refs
    });
  }

  async #audit(principal, action, entityId, previousValue, newValue, db, createdAt) {
    await db.query(
      `INSERT INTO audit_events
        (id,organization_id,user_id,action,entity_type,entity_id,previous_value,new_value,source,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'resource_qualification',$4,$5::jsonb,$6::jsonb,'application',$7)`,
      [principal.organizationId, principal.userId, action, entityId,
        previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(newValue), createdAt]
    );
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) throw new Error("Trusted principal is required");
  }
}

module.exports = { ResourceQualificationRepository };
