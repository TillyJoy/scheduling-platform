# Centralized Alert and Notification Foundation

## Purpose

The notification foundation provides a reusable, organization-scoped mechanism for important system and scheduling events. Domain features emit notification-worthy events without owning delivery or presentation logic.

## Notification model

Each notification contains:

- organization and recipient scope
- configurable severity: critical, important, warning, information, success
- title and message
- optional icon/color presentation hints
- optional related entity/type and ID
- source event type
- lifecycle status: unread, read, acknowledged, dismissed, expired
- acknowledgement requirement and timestamps
- optional expiration

Color is never the only severity indicator; the UI should pair it with text and/or an icon.

## Service boundary

`NotificationService` is the application boundary for creating and managing notifications. It supports listing a recipient's notifications and lifecycle transitions for read, acknowledgement, and dismissal.

The service intentionally uses a small storage abstraction (a `Map` by default) in this planning-stage implementation. A database repository can replace that storage without changing callers of the service.

## Multi-organization isolation

Every notification requires an `organizationId`. Reads and state changes require both organization and recipient scope. A notification from another organization or another recipient is treated as not found, preventing cross-tenant access through the service boundary.

## Audit integration

Creation and lifecycle changes create `AuditEvent` records using the existing audit model. Notification auditing therefore remains part of the platform's existing audit architecture rather than creating a separate audit trail.

## Future delivery channels

The foundation is intentionally channel-neutral. Future adapters may deliver notifications through:

- in-app notification center
- popup/toast
- calendar indicator
- badge
- email
- SMS
- push notification
- sound where supported

Channel preferences, rate limiting, recipient rules, and organization configuration should be added at the delivery layer rather than hard-coded into domain services.

## Future event sources

Examples include appointment changes, Auditor field alerts, client self-service actions, synchronization failures, critical comments, unservable-client contacts, funding changes, and administrative events.
