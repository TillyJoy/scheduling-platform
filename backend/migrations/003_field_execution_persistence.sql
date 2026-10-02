CREATE TABLE IF NOT EXISTS field_visits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  appointment_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status_code TEXT,
  resource_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  arrived_at TIMESTAMPTZ,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by_user_id TEXT,
  closed_at TIMESTAMPTZ,
  closed_by_user_id TEXT,
  outcome_code TEXT,
  outcome_reason TEXT,
  notes TEXT NOT NULL DEFAULT '',
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  completion_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_field_visits_org_updated
  ON field_visits (organization_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_field_visits_org_appointment
  ON field_visits (organization_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_field_visits_org_work_order
  ON field_visits (organization_id, work_order_id);

ALTER TABLE field_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_visits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_visits_tenant_isolation ON field_visits;
CREATE POLICY field_visits_tenant_isolation ON field_visits
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS actual_work (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  field_visit_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  resource_id TEXT,
  description TEXT NOT NULL,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  quantity NUMERIC,
  unit TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actual_work_org_visit
  ON actual_work (organization_id, field_visit_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_actual_work_org_work_order
  ON actual_work (organization_id, work_order_id, created_at DESC, id DESC);

ALTER TABLE actual_work
  ADD CONSTRAINT actual_work_field_visit_fk
  FOREIGN KEY (organization_id, field_visit_id)
  REFERENCES field_visits (organization_id, id);

ALTER TABLE actual_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_work FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actual_work_tenant_isolation ON actual_work;
CREATE POLICY actual_work_tenant_isolation ON actual_work
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

ALTER TABLE field_execution_operations
  ADD CONSTRAINT field_execution_operations_field_visit_fk
  FOREIGN KEY (organization_id, field_visit_id)
  REFERENCES field_visits (organization_id, id);

CREATE INDEX IF NOT EXISTS idx_field_execution_operations_org_visit
  ON field_execution_operations (organization_id, field_visit_id, created_at DESC);
