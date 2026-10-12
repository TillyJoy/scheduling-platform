# Configurable Status Framework

## Decision

Statuses are organization-scoped configuration rather than hard-coded application behavior. The same framework can be used by jobs, work orders, appointments, field visits, applications, billing records, or other organization-defined entities.

## Status definition

Each status can define:

- organization
- entity type
- stable code
- display label
- category
- description
- color/icon metadata
- sort order
- initial-state flag
- terminal-state flag
- additional metadata

Entity-specific terminology remains configurable through the terminology layer.

## Transitions

Organizations may configure which statuses can follow another status. Transitions are scoped to organization + entity type, and terminal statuses cannot have outgoing transitions.

The framework intentionally does not assume a universal lifecycle such as "new → scheduled → completed". Different organizations and entity types can define their own valid states.

## Lifecycle enforcement

The generic status lifecycle service consumes these configured transitions. A domain record can request a status change through the lifecycle service, which verifies the configured transition before updating the record.

The lifecycle service is domain-neutral and uses an injected record store/repository boundary. It does not replace domain models or define domain-specific workflows.

## Security

All configuration operations require a trusted principal. The default authorization policy requires the principal's organization to match the target organization and the corresponding status permission.

Lifecycle reads and transitions likewise require a trusted principal and the applicable status permission.

## Audit

Status configuration changes create audit events using the trusted principal identity. Successful domain status transitions also create audit events containing the previous status, new status, actor, and optional reason/metadata.

## Persistence and current scope

The service retains its in-memory mode for isolated tests and non-durable use. Database-backed application composition uses PostgreSQL persistence for status definitions and allowed transitions. Both tables are organization-scoped, use row-level security, and preserve the domain-neutral `entityType` + stable status `code` model. Configuration writes and their audit records share a transaction.

The durable assignment lifecycle consumes persisted status definitions/transitions. Its status change, immutable audit event, domain event, and outbox entry are committed in the same PostgreSQL transaction. The assignment transition API is `PATCH /api/assignments/{id}/status` and requires both `assignment:update` and `status:transition`; it accepts the expected current status as a compare-and-swap precondition.

This does not claim that every entity lifecycle has been migrated. The generic `StatusLifecycleService` remains an in-memory foundation for other entities until each durable repository adopts an equivalent transactional boundary. Status rules remain configuration, not organization-specific code.
