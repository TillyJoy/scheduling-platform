ALTER TABLE domain_events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS causation_id TEXT;

ALTER TABLE event_outbox
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS template_version INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_id_unique
  ON notifications (organization_id, id);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','email','sms')),
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','failed','suppressed','expired')),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  idempotency_key TEXT,
  error_code TEXT,
  error_message TEXT,
  provider_message_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, notification_id)
    REFERENCES notifications (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_attempts_identity
  ON notification_delivery_attempts (organization_id, notification_id, channel, attempt_number);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_pending_idx
  ON notification_delivery_attempts (organization_id, status, requested_at);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_notification_idx
  ON notification_delivery_attempts (organization_id, notification_id, created_at DESC);

ALTER TABLE notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_attempts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_attempts_tenant_isolation
  ON notification_delivery_attempts;

CREATE POLICY notification_delivery_attempts_tenant_isolation
  ON notification_delivery_attempts
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE INDEX IF NOT EXISTS event_outbox_processing_idx
  ON event_outbox (organization_id, status, available_at, id);
