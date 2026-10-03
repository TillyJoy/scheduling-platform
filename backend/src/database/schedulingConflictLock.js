async function lockResources(db, organizationId, resourceIds = []) {
  if (!db || typeof db.query !== "function") throw new Error("database client is required");
  const ids = [...new Set(resourceIds.filter(Boolean))].sort();
  for (const resourceId of ids) {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`scheduling-resource:${organizationId}:${resourceId}`]
    );
  }
}

module.exports = { lockResources };
