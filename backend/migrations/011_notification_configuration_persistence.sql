ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS template_version INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_id_unique
  ON notifications (organization_id, id);

CREATE TABLE IF NOT EXISTS notification_templates (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','email','sms')),
  subject TEXT,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('draft','published','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, template_id, version),
  CHECK (jsonb_typeof(variables) = 'array')
);

CREATE INDEX IF NOT EXISTS notification_templates_org_lifecycle_idx
  ON notification_templates (organization_id, template_id, status, version DESC);

CREATE TABLE IF NOT EXISTS notification_rules (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  rule_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_rules JSONB NOT NULL,
  template_refs JSONB NOT NULL,
  allowed_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  timing JSONB NOT NULL DEFAULT '{"mode":"immediate"}'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal',
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL CHECK (status IN ('draft','published','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, rule_id),
  CHECK (jsonb_typeof(conditions) = 'object'),
  CHECK (jsonb_typeof(recipient_rules) = 'array' AND jsonb_array_length(recipient_rules) > 0),
  CHECK (jsonb_typeof(template_refs) = 'array' AND jsonb_array_length(template_refs) > 0),
  CHECK (jsonb_typeof(allowed_channels) = 'array')
);

CREATE INDEX IF NOT EXISTS notification_rules_org_event_lifecycle_idx
  ON notification_rules (organization_id, event_type, status, enabled);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_templates_tenant_isolation ON notification_templates;
CREATE POLICY notification_templates_tenant_isolation ON notification_templates
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_rules_tenant_isolation ON notification_rules;
CREATE POLICY notification_rules_tenant_isolation ON notification_rules
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE OR REPLACE FUNCTION prevent_published_notification_template_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'published notification template versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.template_id IS DISTINCT FROM OLD.template_id OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.channel IS DISTINCT FROM OLD.channel OR
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.body IS DISTINCT FROM OLD.body OR
    NEW.variables IS DISTINCT FROM OLD.variables OR
    NEW.created_at IS DISTINCT FROM OLD.created_at OR
    NEW.published_at IS DISTINCT FROM OLD.published_at OR
    NEW.status NOT IN ('published','inactive','archived')
  ) THEN
    RAISE EXCEPTION 'published notification template content is immutable';
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS notification_templates_immutable_published ON notification_templates;
CREATE TRIGGER notification_templates_immutable_published
BEFORE UPDATE OR DELETE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION prevent_published_notification_template_mutation();

CREATE OR REPLACE FUNCTION prevent_published_notification_rule_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'published notification rules cannot be deleted; archive them instead';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.rule_id IS DISTINCT FROM OLD.rule_id OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.event_type IS DISTINCT FROM OLD.event_type OR
    NEW.conditions IS DISTINCT FROM OLD.conditions OR
    NEW.recipient_rules IS DISTINCT FROM OLD.recipient_rules OR
    NEW.template_refs IS DISTINCT FROM OLD.template_refs OR
    NEW.allowed_channels IS DISTINCT FROM OLD.allowed_channels OR
    NEW.timing IS DISTINCT FROM OLD.timing OR
    NEW.required IS DISTINCT FROM OLD.required OR
    NEW.priority IS DISTINCT FROM OLD.priority OR
    NEW.enabled IS DISTINCT FROM OLD.enabled OR
    NEW.status NOT IN ('published','inactive','archived')
  ) THEN
    RAISE EXCEPTION 'notification rule content is immutable after publication; create a new rule';
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS notification_rules_published_immutable ON notification_rules;
CREATE TRIGGER notification_rules_published_immutable
BEFORE UPDATE OR DELETE ON notification_rules
FOR EACH ROW EXECUTE FUNCTION prevent_published_notification_rule_mutation();

CREATE OR REPLACE FUNCTION validate_published_notification_rule_templates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ref JSONB;
  referenced_template notification_templates%ROWTYPE;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  FOR ref IN SELECT value FROM jsonb_array_elements(NEW.template_refs)
  LOOP
    IF NOT (ref ? 'templateId' AND ref ? 'version')
      OR jsonb_typeof(ref->'templateId') <> 'string'
      OR jsonb_typeof(ref->'version') <> 'number'
    THEN
      RAISE EXCEPTION 'notification rule template references require templateId and version';
    END IF;

    SELECT * INTO referenced_template
      FROM notification_templates
      WHERE organization_id = NEW.organization_id
        AND template_id = ref->>'templateId'
        AND version = (ref->>'version')::INTEGER;

    IF NOT FOUND OR referenced_template.status <> 'published' THEN
      RAISE EXCEPTION 'notification rule references a missing, cross-tenant, or unpublished template version';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_rules_valid_template_refs ON notification_rules;
CREATE CONSTRAINT TRIGGER notification_rules_valid_template_refs
AFTER INSERT OR UPDATE ON notification_rules
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION validate_published_notification_rule_templates();

CREATE OR REPLACE FUNCTION prevent_notification_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.template_id IS DISTINCT FROM NEW.template_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.version IS DISTINCT FROM NEW.version
  THEN
    RAISE EXCEPTION 'notification template version identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_template_version_identity_immutable ON notification_templates;
CREATE TRIGGER notification_template_version_identity_immutable
BEFORE UPDATE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION prevent_notification_template_version_mutation();
