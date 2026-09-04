const databaseUrl = process.env.DATABASE_URL || null;

function getDatabaseConfig() {
  return {
    databaseUrl
  };
}

module.exports = { getDatabaseConfig };
