# Notification Configuration

## Status

Implemented as the next Notifications & Communications foundation increment.

## Architecture

`domain event → notification rule → recipient resolution → template/channel selection → delivery`

Notification configuration does not perform external delivery.

## Templates

Templates are organization-scoped and channel-aware. Foundation channels are in-app, email, and SMS. Template content uses controlled variable names rather than executable code.

Template lifecycle:

`Draft → Published → Inactive/Archived`

A rule can only be published when every referenced template is published.

## Rules

Rules define:

- Event type
- Conditions
- Recipient rules
- Template references
- Allowed channels
- Timing
- Required/optional behavior
- Priority
- Enabled state

## Security and tenancy

Configuration operations require a trusted principal and explicit action permission. Organization membership is checked by the default authorization policy. Cross-organization template references are rejected.

The authorization policy is injectable so the platform's central authorization system can replace the foundation policy later.

## Audit

Create, publish, and archive operations create AuditEvent records using the trusted principal's identity.

## Deliberate non-goals

This increment does not implement delivery providers, retries, rate limiting, user communication preferences, event dispatch, recipient resolution execution, or the administration UI.
