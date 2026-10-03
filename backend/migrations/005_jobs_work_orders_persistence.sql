CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  service_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES clients (organization_id, id)
);

CREATE INDEX IF NOT EXISTS jobs_org_created_idx
  ON jobs (organization_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_org_client_created_idx
  ON jobs (organization_id, client_id, created_at DESC, id DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_tenant_isolation ON jobs;
CREATE POLICY jobs_tenant_isolation ON jobs
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_id TEXT NOT NULL,
  number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (organization_id, job_id)
    REFERENCES jobs (organization_id, id)
);

CREATE INDEX IF NOT EXISTS work_orders_org_job_created_idx
  ON work_orders (organization_id, job_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS work_orders_org_status_created_idx
  ON work_orders (organization_id, status_code, created_at DESC, id DESC);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_orders_tenant_isolation ON work_orders;
CREATE POLICY work_orders_tenant_isolation ON work_orders
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
