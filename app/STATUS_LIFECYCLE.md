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

## Domain event integration

When a domain event service is supplied, a successful transition emits a generic status-change event before the record mutation is committed by the injected record store. The default event type is derived from the runtime entity type using the pattern `<entityType>.status.changed`, and callers may supply another configured event type.

The event contains the previous status, new status, reason, and metadata. The lifecycle service does not invoke notification rules directly.

The current in-memory foundation cannot provide transactional guarantees across the record store and event store. Persistent production integration should use a transactionally reliable outbox/event boundary so a committed state change and its event cannot diverge.
