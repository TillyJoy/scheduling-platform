# Centralized Alert and Notification Foundation

## Purpose
The notification foundation provides a reusable, organization-scoped mechanism for important system and scheduling events. Domain features emit notification-worthy events without owning delivery or presentation logic.

## Service boundary and authorization
`NotificationService` is the application boundary for creating and managing notifications. It accepts a trusted principal from the authenticated application/request context. Callers do not supply organization, recipient, or audit identities as independent authorization inputs for lifecycle operations.

The default authorization policy requires the principal to belong to the target organization, hold the action-specific notification permission, and target its own notifications unless it also has `notification:manage`. An application can inject a stronger authorization policy when its permission model is more sophisticated.

## Multi-organization isolation
Every notification requires a unique ID and organization ID. Cross-tenant access is rejected before a notification is returned or changed. Duplicate IDs are rejected rather than replacing an existing notification.

## Audit integration
Creation and lifecycle changes create `AuditEvent` records. Audit user IDs are derived from the trusted principal rather than caller-supplied identity fields.

## Future delivery channels
The foundation is intentionally channel-neutral. Future adapters may deliver notifications through in-app notification center, popup/toast, calendar indicators, badges, email, SMS, push notifications, or sound where supported.

Channel preferences, rate limiting, recipient rules, and organization configuration belong at the delivery layer rather than inside domain services.

## Future event sources
Examples include appointment changes, field alerts, client self-service actions, synchronization failures, critical comments, unservable-client contacts, funding changes, and administrative events.