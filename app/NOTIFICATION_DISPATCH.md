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

## Deliberate non-goals

This increment does not select email/SMS vendors, implement external provider APIs, define organization-specific recipient rules, or build an administration UI.
