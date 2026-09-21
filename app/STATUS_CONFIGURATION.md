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

## Security

All configuration operations require a trusted principal. The default authorization policy requires the principal's organization to match the target organization and the corresponding status permission.

## Audit

Creation and transition configuration changes create audit events using the trusted principal identity.

## Current scope

This is the configuration foundation. It does not yet mutate domain records or enforce every lifecycle transition at the domain-service layer. Domain services should consume this configuration rather than embedding status rules.
