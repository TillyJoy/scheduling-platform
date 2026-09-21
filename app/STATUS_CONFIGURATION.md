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

## Current scope

The configuration and lifecycle foundations are implemented independently of database technology. Persistent domain repositories and domain-specific services will adopt the lifecycle service as those integrations are implemented.

The platform should continue to keep status rules in configuration rather than embedding organization-specific lifecycle behavior in domain code.
