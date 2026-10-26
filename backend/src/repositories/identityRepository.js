class IdentityRepository {
  constructor({ pool } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
  }

  async resolvePrincipal({ userId, organizationId, db = this.pool } = {}) {
    if (!userId || !organizationId) return null;
    const result = await db.query(
      `SELECT u.id AS user_id, u.status AS user_status,
              m.organization_id, m.status AS membership_status,
              COALESCE(
                array_agg(DISTINCT rp.permission_code)
                  FILTER (WHERE rp.permission_code IS NOT NULL),
                ARRAY[]::text[]
              ) AS permissions
       FROM users u
       JOIN organization_memberships m ON m.user_id = u.id
       LEFT JOIN membership_roles mr
         ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
       LEFT JOIN organization_roles r
         ON r.organization_id = mr.organization_id AND r.id = mr.role_id AND r.status = 'active'
       LEFT JOIN role_permissions rp
         ON rp.organization_id = r.organization_id AND rp.role_id = r.id
       WHERE u.id = $1 AND m.organization_id = $2
       GROUP BY u.id, u.status, m.organization_id, m.status`,
      [userId, organizationId]
    );
    const row = result.rows[0];
    if (!row || row.user_status !== "active" || row.membership_status !== "active") return null;
    return Object.freeze({
      userId: row.user_id,
      organizationId: row.organization_id,
      permissions: [...new Set(row.permissions || [])],
      authMethod: "resolved-membership"
    });
  }

  async resolveExternalIdentity({ provider, issuer, subject, organizationId, db = this.pool } = {}) {
    if (
      typeof provider !== "string" || !provider.trim() ||
      typeof issuer !== "string" || !issuer.trim() ||
      typeof subject !== "string" || !subject.trim() ||
      typeof organizationId !== "string" || !organizationId.trim()
    ) return null;

    const result = await db.query(
      `SELECT ei.user_id
       FROM external_identities ei
       JOIN users u ON u.id = ei.user_id AND u.status = 'active'
       WHERE ei.provider = $1 AND ei.issuer = $2 AND ei.subject = $3`,
      [provider, issuer, subject]
    );
    if (!result.rows[0]) return null;
    return this.resolvePrincipal({
      userId: result.rows[0].user_id,
      organizationId,
      db
    });
  }
}

module.exports = { IdentityRepository };
