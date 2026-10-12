CREATE TABLE IF NOT EXISTS status_definitions (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('active','pending','completed','cancelled','exception')),
  description TEXT,
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, entity_type, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS status_definitions_one_initial_per_entity_idx
  ON status_definitions (organization_id, entity_type) WHERE is_initial;
CREATE INDEX IF NOT EXISTS status_definitions_org_entity_sort_idx
  ON status_definitions (organization_id, entity_type, sort_order, label, code);

CREATE TABLE IF NOT EXISTS status_transitions (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_type, from_code, to_code),
  FOREIGN KEY (organization_id, entity_type, from_code)
    REFERENCES status_definitions (organization_id, entity_type, code),
  FOREIGN KEY (organization_id, entity_type, to_code)
    REFERENCES status_definitions (organization_id, entity_type, code),
  CHECK (from_code <> to_code)
);

ALTER TABLE status_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS status_definitions_tenant_isolation ON status_definitions;
CREATE POLICY status_definitions_tenant_isolation ON status_definitions
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS status_transitions_tenant_isolation ON status_transitions;
CREATE POLICY status_transitions_tenant_isolation ON status_transitions
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
