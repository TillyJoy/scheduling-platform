const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function getDatabaseConfig(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL || null,
    ssl: env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
    max: Number(env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(env.DATABASE_CONNECTION_TIMEOUT_MS || 5000)
  };
}

function createDatabasePool(config = getDatabaseConfig()) {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(config.max) || config.max < 1) throw new Error("DATABASE_POOL_MAX must be a positive integer");
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.ssl,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis
  });
}

async function withTransaction(pool, { organizationId, userId = null, action = "transaction" } = {}, work) {
  if (!pool || typeof pool.connect !== "function") throw new Error("A database pool is required");
  if (!organizationId) throw new Error("organizationId is required");
  if (typeof work !== "function") throw new Error("work must be a function");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId || "system"]);
    await client.query("SELECT set_config('app.action', $1, true)", [action]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations(pool, migrationsDir = path.join(__dirname, "../migrations")) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter(file => /^\\d+_.*\\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const version = file.split("_", 1)[0];
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
    if (existing.rowCount) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
}

async function main() {
  const pool = createDatabasePool();
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module && process.argv.includes("--migrate")) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { getDatabaseConfig, createDatabasePool, withTransaction, runMigrations };
