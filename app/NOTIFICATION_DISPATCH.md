# Notification Event Dispatch

## Decision

Notification processing sits downstream of the generic domain-event layer:

`domain event → published notification rules → condition matching → recipient resolution → template rendering → channel handoff`

The processor is intentionally separate from the domain event service and from delivery providers.

## Recipient resolution

The foundation supports three domain-neutral recipient rule forms:

- `actor`: the trusted actor recorded on the event
- `event_payload`: a recipient identifier supplied in the event payload
- `static_user`: an explicitly configured user identifier

A pluggable `recipientResolver` can add organization-specific resolution such as role, assignment, team, relationship, or resource-based recipients without changing the notification core.

## Conditions

Rules can contain exact-match conditions against event fields or payload fields.

Conditions are evaluated before recipient resolution.

## Templates

Only variables explicitly declared by the template are rendered. Template content is plain text and is never executed as code.

## Channels

The processor currently creates in-app notifications directly through the existing notification service.

Email and SMS are handed to an injected delivery sink when one is configured. If no provider is configured, the result remains `delivery_pending`; the core platform never pretends a message was delivered.

## Security

Processing requires a trusted principal with `notification:dispatch`.

Tenant identity is derived from the trusted principal and must match the event organization.

## Delivery and reliability contract

Individual delivery records retain the delivery provider/channel, attempt information, lifecycle status, error information, and relevant timestamps. Applicable lifecycle states include pending, sent, delivered, failed, suppressed, and expired; exact state applicability may vary by channel/provider. A delivery record represents delivery processing and is distinct from the notification request and the underlying business record.

Delivery processing is asynchronous. Core business transactions must not remain open while waiting for an external notification provider. Domain events and the durable outbox provide the post-commit handoff to notification processing.

Notification retries use bounded retry behavior with appropriate backoff for genuinely transient failures. Permanent failures are not retried indefinitely and remain observable for operational handling. Provider failure must not be represented as successful delivery.

Notification processing and delivery are idempotent/deduplicated at the appropriate notification, delivery, event-consumer, worker, and provider boundaries so event replay or worker/provider retries cannot unintentionally create duplicate communications. Idempotency keys and identities remain organization-scoped.

Suppression is an explicit delivery outcome where applicable and carries an auditable reason. Suppression may result from preferences, rule conditions, channel constraints, configuration, or other authorized processing decisions; mandatory-communication semantics take precedence where applicable.

Configurable escalation may be triggered by conditions such as lack of acknowledgement, elapsed time, severity, status, delivery failure, or other organization-defined criteria. Escalation remains part of the notification architecture rather than a hard-coded organization workflow.

The delivery layer uses provider abstraction. Provider-specific APIs, credentials, response formats, and failure behavior remain integration concerns and must not become core business logic. Provider/channel replacement must not require changes to core domain semantics.

## Deliberate non-goals

This increment does not select email/SMS vendors, implement external provider APIs, define organization-specific recipient rules, or build an administration UI.
