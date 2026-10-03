CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT,
  landlord_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL,
  unit_identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id)
);

ALTER TABLE clients
  ADD CONSTRAINT clients_organization_id_id_key UNIQUE (organization_id, id);

CREATE TABLE IF NOT EXISTS client_property_relationships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  unit_id TEXT,
  relationship_type TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id),
  FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id),
  CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_properties_org_created_id ON properties (organization_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_units_org_property_created_id ON units (organization_id, property_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_property_relationships_org_client_start ON client_property_relationships (organization_id, client_id, start_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_property_relationships_org_property_start ON client_property_relationships (organization_id, property_id, start_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_property_relationships_org_unit_start ON client_property_relationships (organization_id, unit_id, start_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_property_relationship_active_property
  ON client_property_relationships (organization_id, client_id, property_id)
  WHERE end_at IS NULL AND unit_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_property_relationship_active_unit
  ON client_property_relationships (organization_id, client_id, unit_id)
  WHERE end_at IS NULL AND unit_id IS NOT NULL;

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;
ALTER TABLE client_property_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_property_relationships FORCE ROW LEVEL SECURITY;

CREATE POLICY properties_tenant_isolation ON properties
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
CREATE POLICY units_tenant_isolation ON units
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
CREATE POLICY client_property_relationships_tenant_isolation ON client_property_relationships
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
