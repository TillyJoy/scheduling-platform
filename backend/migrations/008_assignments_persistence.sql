CREATE TABLE IF NOT EXISTS assignments (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_id TEXT NOT NULL,
  job_id TEXT,
  work_order_id TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES resources (organization_id, id),
  FOREIGN KEY (organization_id, job_id)
    REFERENCES jobs (organization_id, id),
  FOREIGN KEY (organization_id, work_order_id)
    REFERENCES work_orders (organization_id, id),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS assignments_org_resource_time_idx
  ON assignments (organization_id, resource_id, start_time, end_time, id);

CREATE INDEX IF NOT EXISTS assignments_org_job_idx
  ON assignments (organization_id, job_id, start_time DESC, id DESC);

CREATE INDEX IF NOT EXISTS assignments_org_work_order_idx
  ON assignments (organization_id, work_order_id, start_time DESC, id DESC);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignments_tenant_isolation ON assignments;
CREATE POLICY assignments_tenant_isolation ON assignments
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
