ALTER TABLE notification_delivery_attempts
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_claim_idx
  ON notification_delivery_attempts (organization_id, status, available_at, id);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_lease_idx
  ON notification_delivery_attempts (organization_id, status, locked_at)
  WHERE status = 'pending';