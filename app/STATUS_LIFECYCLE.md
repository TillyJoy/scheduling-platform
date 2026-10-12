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

## Generic service boundary

The generic `StatusLifecycleService` still uses an injected in-memory record store. It does not replace individual domain models or repositories, and its in-memory event path is not a durable transaction boundary.

## Durable assignment lifecycle

The assignment service has a separate PostgreSQL-backed transition path. It validates the organization-scoped configured transition, locks the resource and assignment, compares the expected current status, and enforces scheduling conflict behavior before changing the status. It records the state update, append-only audit event, domain event, and pending outbox item in one transaction. If any write fails, the complete transition rolls back.

The endpoint is `PATCH /api/assignments/{id}/status`. It requires a trusted principal with `assignment:update` and `status:transition`, and a body containing `expectedStatusCode` and `statusCode`, with optional `reason` and object `metadata`. A stale expected status or a transition that would create a resource conflict returns a conflict rather than silently overwriting state.

Status definitions and allowed transitions are persisted in `status_definitions` and `status_transitions`, with tenant row-level security. This is an incremental domain integration, not a claim that all entity types now have durable lifecycle handling.

## Domain event integration

The durable assignment path writes a generic `assignment.status.changed` domain event and an outbox entry inside the same transaction as the status update. It does not invoke notification rules directly; downstream delivery remains the responsibility of the outbox/notification processing layer.
