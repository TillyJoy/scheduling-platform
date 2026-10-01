const { Client } = require("../models/client");

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function normalizePageSize(value) {
  const size = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(size) || size < 1) throw new Error("limit must be a positive integer");
  return Math.min(size, MAX_PAGE_SIZE);
}

class ClientRepository {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("pool is required");
    this.pool = pool;
    this.clock = clock;
  }

  async create({ principal, client }) {
    this.#requirePrincipal(principal);
    const now = this.clock();
    const record = new Client(client);

    return this.pool.query(
      `INSERT INTO clients
        (id, organization_id, first_name, last_name, phone, email, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, organization_id, first_name, last_name, phone, email, status, created_at, updated_at`,
      [
        record.id,
        principal.organizationId,
        record.firstName,
        record.lastName,
        record.phone ?? null,
        record.email ?? null,
        client.status ?? "active",
        now
      ]
    ).then(result => this.#map(result.rows[0]));
  }

  async get({ principal, clientId }) {
    this.#requirePrincipal(principal);
    const result = await this.pool.query(
      `SELECT id, organization_id, first_name, last_name, phone, email, status, created_at, updated_at
       FROM clients
       WHERE organization_id = $1 AND id = $2`,
      [principal.organizationId, clientId]
    );
    return result.rows[0] ? this.#map(result.rows[0]) : null;
  }

  async listPage({ principal, status = null, limit = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
    this.#requirePrincipal(principal);
    const pageSize = normalizePageSize(limit);
    const values = [principal.organizationId];
    const filters = ["organization_id = $1"];

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    if (cursor) {
      if (!cursor.createdAt || !cursor.id) throw new Error("cursor must contain createdAt and id");
      values.push(cursor.createdAt, cursor.id);
      filters.push(`(created_at, id) < ($${values.length - 1}, $${values.length})`);
    }

    values.push(pageSize + 1);
    const result = await this.pool.query(
      `SELECT id, organization_id, first_name, last_name, phone, email, status, created_at, updated_at
       FROM clients
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length}`,
      values
    );

    const rows = result.rows.slice(0, pageSize);
    const hasMore = result.rows.length > pageSize;
    const last = rows.at(-1);

    return {
      items: rows.map(row => this.#map(row)),
      nextCursor: hasMore ? { createdAt: last.createdAt, id: last.id } : null,
      hasMore
    };
  }

  #map(row) {
    if (!row) return null;
    return {
      ...new Client({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        email: row.email
      }),
      organizationId: row.organization_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #requirePrincipal(principal) {
    if (!principal?.userId || !principal?.organizationId) {
      throw new Error("Trusted principal is required");
    }
  }
}

module.exports = { ClientRepository, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
