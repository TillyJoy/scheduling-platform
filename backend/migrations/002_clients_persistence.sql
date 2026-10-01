CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_org_created_id
  ON clients (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_clients_org_status_created_id
  ON clients (organization_id, status, created_at DESC, id DESC);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_tenant_isolation ON clients;
CREATE POLICY clients_tenant_isolation ON clients
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
