# Generic Domain Events

## Decision

The platform uses a domain-neutral event layer between business actions and downstream reactions.

The intended flow is:

domain action → domain event → event dispatch → matching notification rules → recipient resolution → template/channel selection → delivery

A domain event describes something that happened. It does not decide which notifications, integrations, or workflows should run.

## Event structure

Each event contains:

- organization
- stable event ID
- event type
- entity type
- entity ID
- trusted actor identity when applicable
- payload
- source
- occurrence timestamp
- optional correlation ID
- optional causation ID

eventType and entityType are configuration/runtime values. The core platform does not hard-code an agency-specific event vocabulary.

## Security and tenancy

Events are emitted through a trusted principal. The service derives the organization and actor from that principal rather than trusting caller-supplied tenant or actor values.

Reads are organization-scoped and require the explicit event:read permission.

Emission requires event:emit.

Duplicate event IDs are rejected.

## Audit

Successful event emission creates an audit event containing the trusted actor, organization, entity reference, event ID, event type, and source.

Domain events are not a replacement for the audit log. The audit record answers who performed an action; the domain event answers what occurred for downstream processing.

## Current implementation boundary

The current implementation uses an injected in-memory event store so event behavior can be tested without choosing a database or message broker.

The service is append-only: existing events are not edited or deleted through this API.

Event dispatch, durable persistence, retries, ordering guarantees, subscriptions, and delivery infrastructure remain separate concerns.

## Status lifecycle integration

A successful status transition emits a generic status-change event through the domain event service when one is supplied to the lifecycle service. This keeps notification logic out of status management while providing a standard downstream trigger.

## Future considerations

Before production event processing is enabled, the platform will need explicit decisions for:

- durable event storage
- transactional event/outbox behavior
- retry and failure semantics
- idempotent consumers
- ordering guarantees
- retention
- event schema/version evolution
- authorization for sensitive event payloads
