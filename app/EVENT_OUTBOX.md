# Domain Event Outbox Foundation

## Decision

The platform now has a domain-neutral outbox boundary for downstream processing of domain events.

The intended production flow is:

`domain action → domain event → transactional outbox → dispatcher → downstream consumers`

The outbox is not itself a notification system. It provides a reliable handoff boundary so event production and downstream delivery can be separated.

## Current implementation

The current backend implementation provides:

- organization-scoped outbox entries
- duplicate event protection
- pending/processing/published/failed lifecycle states
- attempt counting
- retry scheduling through `availableAt`
- explicit dispatch authorization
- tenant isolation
- audit records for enqueue operations
- an injectable store so the behavior can be tested independently of database technology

The current store remains in-memory. This is intentionally a foundation and does **not** yet provide a production transaction or crash-recovery guarantee.

## Production boundary

Before production event processing is enabled, a persistent implementation must provide an atomic operation that commits the domain change and its outbox record together.

The production design should use a database transaction/outbox pattern rather than trying to coordinate two independent writes from application code.

The dispatcher must also use an atomic claim/lease operation so multiple workers cannot publish the same entry concurrently.

## Retry behavior

The outbox records failed attempts and the next `availableAt` time. The retry policy itself remains configurable and should be implemented by the dispatcher layer.

The platform should eventually support:

- exponential backoff
- maximum attempts
- dead-letter handling
- stale lease recovery
- idempotent downstream consumers
- ordering guarantees where required
- event schema/version evolution
- retention policies

## Security

Outbox operations are organization-scoped and require a trusted principal.

Application actors require `event:emit` to enqueue events. Dispatcher workers require `event:dispatch`.

The service never trusts a caller-supplied organization when authorizing access to an existing entry.

## Deliberate non-goals

This increment does not implement:

- a specific database
- a message broker
- external notification delivery
- recipient resolution
- email/SMS/push providers
- administration UI
- final retry/backoff policy
