CREATE TABLE IF NOT EXISTS resources (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  resource_type TEXT,
  role TEXT,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  geographic_restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  service_restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS resources_org_active_idx
  ON resources (organization_id, active, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS resources_org_type_idx
  ON resources (organization_id, resource_type, created_at DESC, id DESC);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resources_tenant_isolation ON resources;
CREATE POLICY resources_tenant_isolation ON resources
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS qualifications (
  qualification_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, qualification_id),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS qualifications_org_status_idx
  ON qualifications (organization_id, status_code, created_at DESC, qualification_id DESC);

ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualifications_tenant_isolation ON qualifications;
CREATE POLICY qualifications_tenant_isolation ON qualifications
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS resource_qualifications (
  resource_qualification_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_id TEXT NOT NULL,
  qualification_id TEXT NOT NULL,
  service_ref TEXT,
  status_code TEXT,
  effective_at TIMESTAMPTZ,
  expiration_at TIMESTAMPTZ,
  restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT,
  verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ,
  verifier_ref TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, resource_qualification_id),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES resources (organization_id, id),
  FOREIGN KEY (organization_id, qualification_id)
    REFERENCES qualifications (organization_id, qualification_id),
  CHECK (expiration_at IS NULL OR effective_at IS NULL OR expiration_at > effective_at)
);

CREATE INDEX IF NOT EXISTS resource_qualifications_org_resource_idx
  ON resource_qualifications (organization_id, resource_id, effective_at DESC, resource_qualification_id DESC);
CREATE INDEX IF NOT EXISTS resource_qualifications_org_qualification_idx
  ON resource_qualifications (organization_id, qualification_id, effective_at DESC, resource_qualification_id DESC);
CREATE INDEX IF NOT EXISTS resource_qualifications_org_service_idx
  ON resource_qualifications (organization_id, service_ref, status_code, effective_at DESC, resource_qualification_id DESC);

ALTER TABLE resource_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_qualifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_qualifications_tenant_isolation ON resource_qualifications;
CREATE POLICY resource_qualifications_tenant_isolation ON resource_qualifications
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS availability (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  zone_id TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES resources (organization_id, id),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS availability_org_resource_start_idx
  ON availability (organization_id, resource_id, start_time, id);
CREATE INDEX IF NOT EXISTS availability_org_zone_start_idx
  ON availability (organization_id, zone_id, start_time, id);

ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS availability_tenant_isolation ON availability;
CREATE POLICY availability_tenant_isolation ON availability
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
