# Configurable Status Lifecycle

## Decision

Configured statuses and transitions are now consumable by a generic lifecycle service. Domain services do not define a universal status graph.

The lifecycle service accepts an organization, entity type, entity identifier, current status on the entity record, requested target status, and optional reason/metadata.

It checks the organization-scoped status configuration before changing the record.

## Domain neutrality

The lifecycle service does not know what a job, appointment, work order, or field visit means. `entityType` is a runtime/configuration value.

A domain service can provide its own repository or record store without changing the lifecycle rules.

## Security and tenancy

A trusted principal is required. The default policy requires organization membership plus the explicit `status:transition` or `status:read` permission.

Records are keyed by organization + entity type + entity ID, and the stored organization is checked again.

## Audit

Every successful transition creates an `AuditEvent` containing the trusted actor, organization, entity type/ID, previous status, new status, reason, and metadata.

## Current boundary

The service uses an injected record store so lifecycle behavior can be tested independently of database technology. It does not replace individual domain models or repositories yet.

## Next integration

A successful transition can become a generic domain event for the notification system. Notification rules can then react to status changes without embedding notification logic into domain services.
