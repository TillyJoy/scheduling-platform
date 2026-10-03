CREATE TABLE IF NOT EXISTS appointments (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  department_id TEXT,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_order_id TEXT,
  team_id TEXT,
  zone_id TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status_code TEXT NOT NULL DEFAULT 'scheduled',
  scheduler_id TEXT,
  client_scheduling_indicator BOOLEAN NOT NULL DEFAULT false,
  internal_notes TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT,
  reschedule_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES clients (organization_id, id),
  FOREIGN KEY (organization_id, property_id)
    REFERENCES properties (organization_id, id),
  FOREIGN KEY (organization_id, work_order_id)
    REFERENCES work_orders (organization_id, id),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS appointments_org_start_idx
  ON appointments (organization_id, start_time, id);
CREATE INDEX IF NOT EXISTS appointments_org_work_order_idx
  ON appointments (organization_id, work_order_id, start_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS appointments_org_client_idx
  ON appointments (organization_id, client_id, start_time DESC, id DESC);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_tenant_isolation ON appointments;
CREATE POLICY appointments_tenant_isolation ON appointments
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS appointment_units (
  appointment_unit_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  selection_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, appointment_unit_id),
  UNIQUE (organization_id, appointment_id, unit_id),
  FOREIGN KEY (organization_id, appointment_id)
    REFERENCES appointments (organization_id, id),
  FOREIGN KEY (organization_id, unit_id)
    REFERENCES units (organization_id, id)
);

CREATE INDEX IF NOT EXISTS appointment_units_org_appointment_idx
  ON appointment_units (organization_id, appointment_id);

ALTER TABLE appointment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_units FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_units_tenant_isolation ON appointment_units;
CREATE POLICY appointment_units_tenant_isolation ON appointment_units
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS appointment_services (
  appointment_service_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  service_ref TEXT NOT NULL,
  service_status TEXT,
  requested BOOLEAN NOT NULL DEFAULT true,
  scheduled BOOLEAN NOT NULL DEFAULT true,
  duration_contribution INTEGER,
  funding_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, appointment_service_id),
  UNIQUE (organization_id, appointment_id, service_ref),
  FOREIGN KEY (organization_id, appointment_id)
    REFERENCES appointments (organization_id, id),
  CHECK (duration_contribution IS NULL OR duration_contribution > 0)
);

CREATE INDEX IF NOT EXISTS appointment_services_org_appointment_idx
  ON appointment_services (organization_id, appointment_id);

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_services_tenant_isolation ON appointment_services;
CREATE POLICY appointment_services_tenant_isolation ON appointment_services
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS appointment_resources (
  appointment_resource_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  role TEXT,
  assignment_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, appointment_resource_id),
  UNIQUE (organization_id, appointment_id, resource_id),
  FOREIGN KEY (organization_id, appointment_id)
    REFERENCES appointments (organization_id, id),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES resources (organization_id, id)
);

CREATE INDEX IF NOT EXISTS appointment_resources_org_appointment_idx
  ON appointment_resources (organization_id, appointment_id);
CREATE INDEX IF NOT EXISTS appointment_resources_org_resource_idx
  ON appointment_resources (organization_id, resource_id);

ALTER TABLE appointment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_resources_tenant_isolation ON appointment_resources;
CREATE POLICY appointment_resources_tenant_isolation ON appointment_resources
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS appointment_history (
  appointment_history_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  user_id TEXT,
  source TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  PRIMARY KEY (organization_id, appointment_history_id),
  FOREIGN KEY (organization_id, appointment_id)
    REFERENCES appointments (organization_id, id)
);

CREATE INDEX IF NOT EXISTS appointment_history_org_appointment_idx
  ON appointment_history (organization_id, appointment_id, occurred_at DESC, appointment_history_id DESC);

ALTER TABLE appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_history_tenant_isolation ON appointment_history;
CREATE POLICY appointment_history_tenant_isolation ON appointment_history
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS scheduling_holds (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scheduler_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_order_id TEXT,
  department_id TEXT,
  zone_id TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','confirmed','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES clients (organization_id, id),
  FOREIGN KEY (organization_id, property_id)
    REFERENCES properties (organization_id, id),
  FOREIGN KEY (organization_id, work_order_id)
    REFERENCES work_orders (organization_id, id),
  CHECK (end_time > start_time),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS scheduling_holds_org_expiration_idx
  ON scheduling_holds (organization_id, status, expires_at);
CREATE INDEX IF NOT EXISTS scheduling_holds_org_start_idx
  ON scheduling_holds (organization_id, start_time, id);

ALTER TABLE scheduling_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_holds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_holds_tenant_isolation ON scheduling_holds;
CREATE POLICY scheduling_holds_tenant_isolation ON scheduling_holds
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS scheduling_hold_resources (
  scheduling_hold_resource_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  hold_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, scheduling_hold_resource_id),
  UNIQUE (organization_id, hold_id, resource_id),
  FOREIGN KEY (organization_id, hold_id)
    REFERENCES scheduling_holds (organization_id, id),
  FOREIGN KEY (organization_id, resource_id)
    REFERENCES resources (organization_id, id)
);

CREATE INDEX IF NOT EXISTS scheduling_hold_resources_org_hold_idx
  ON scheduling_hold_resources (organization_id, hold_id);
CREATE INDEX IF NOT EXISTS scheduling_hold_resources_org_resource_idx
  ON scheduling_hold_resources (organization_id, resource_id);

ALTER TABLE scheduling_hold_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_hold_resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_hold_resources_tenant_isolation ON scheduling_hold_resources;
CREATE POLICY scheduling_hold_resources_tenant_isolation ON scheduling_hold_resources
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE OR REPLACE FUNCTION prevent_appointment_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'appointment history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS appointment_history_no_update ON appointment_history;
CREATE TRIGGER appointment_history_no_update
BEFORE UPDATE OR DELETE ON appointment_history
FOR EACH ROW EXECUTE FUNCTION prevent_appointment_history_mutation();
