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

## Notification architecture contract

A notification is the logical communication request produced by notification processing. An individual delivery record is a separate record for a delivery attempt through a particular channel/provider. Notification records must not be collapsed into provider attempts or into the underlying business record.

Published notification templates are immutable and versioned. Editing a published template creates a new version rather than changing the content or meaning of a template already referenced by historical notification processing. Template variables are explicitly declared and validated against an approved variable set; arbitrary executable content or undeclared variables are not permitted.

Notification rules are organization-configurable and may define event/condition matching, timing, priority, required/optional behavior, recipients, templates, and permitted channels. Rules remain configuration rather than organization-specific core logic.

Notification authorization is distinct from authorization to view or mutate the related business entity. Notification configuration and operational handling require explicit notification permissions, and all recipient resolution remains organization-scoped and authorization-aware.

Communication history/audit is distinct from the underlying business record. Material notification configuration, suppression, delivery, failure, and escalation decisions should be auditable without replacing the business record's own history or the technical Audit Log.

Sensitive communication content must be subject to appropriate retention and access controls. Notification storage and diagnostics should expose only the minimum content required for operational handling.

Restriction/unservable alerts are represented through the same configurable rule and notification architecture; the core platform does not encode organization-specific alert conditions, recipients, or channels.

This is an architectural contract. It does not by itself imply implementation of the capabilities below.


## Durable persistence and version-pinning contract

Notification rules and template versions are persisted in PostgreSQL as organization-scoped configuration records. Durable reads and writes use the trusted principal's organization context and the database's forced row-level security policies. Configuration create, publish, archive, and version-creation mutations write audit events in the same database transaction as the mutation.

A template has a stable logical template ID and immutable positive integer version. A new edit creates a new draft version; publishing does not alter previously published content. Published content is immutable, while lifecycle status changes to inactive or archived do not rewrite content or identity.

When a rule is created or published, it stores explicit template references containing both template ID and version. A published rule therefore pins an exact published template version; publishing a newer version does not change the version used by that rule. A rule can only be published when every referenced version exists in the same organization, is published, and its channel is allowed by the rule. Database constraints/triggers revalidate these references at write time.

During durable event processing, the processor resolves the published matching rules and their exact template versions from PostgreSQL in a single short-lived read transaction. It releases the configuration transaction before notification creation or any external delivery sink handoff. Resulting notification records retain the exact template ID and template version used to render them. Replay deduplication continues to use the organization-scoped, stable event/rule/template/recipient delivery key; configuration versioning does not create duplicate notification requests.

When database-backed configuration repositories are not provided, the existing in-memory configuration path remains available for tests and no-database development mode. Durable configuration persistence does not constitute a queue and does not perform provider delivery itself.

## Deliberate non-goals

This increment does not implement delivery providers, retries, rate limiting, user communication preferences, event dispatch, recipient resolution execution, or the administration UI.
