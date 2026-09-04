# Audit Log

The application must maintain a detailed, tamper-resistant record of significant system activity.

## Purpose

The Audit Log provides accountability, troubleshooting information, security monitoring, and a historical record of changes.

## Events to Record

The system should record, when applicable:

- User login
- User logout
- Failed login
- Account creation
- Account modification
- Permission changes
- Client creation
- Client modification
- Client archival
- Client restoration
- Property creation
- Property modification
- Unit creation
- Unit modification
- Eligibility changes
- Service eligibility changes
- Funding changes
- Scheduling status changes
- Appointment creation
- Appointment modification
- Appointment cancellation
- Appointment rescheduling
- Appointment completion
- Appointment partial completion
- No-show
- Scheduling hold creation
- Scheduling hold expiration
- Auditor assignment
- Auditor removal
- Contractor assignment
- Contractor removal
- Service addition
- Service decline
- Client self-scheduling
- Client self-cancellation
- Client self-rescheduling
- Automated scheduling actions
- External integration synchronization
- Integration failures
- Manual synchronization
- Configuration changes
- Service-duration changes
- Funder-rule changes
- Zone-rule changes
- Auditor qualification changes
- Contractor availability changes
- User-role changes
- API credential changes
- Security-related events

## Audit Record

Each audit event should contain, when applicable:

- Event ID
- Timestamp
- User ID
- User name
- User role
- Organization
- Department
- Action
- Entity type
- Entity ID
- Previous value
- New value
- Reason
- Source
- Device information when available
- IP information when appropriate
- Integration/source system
- Correlation ID

## Automated Actions

Automated actions must identify themselves as automated.

The log should distinguish between:

- Human action
- Scheduled automation
- Event-triggered automation
- External integration
- System process

## External Integrations

When an action originates from an external system, the log should identify:

- External system
- External board/account
- External record ID
- Synchronization event
- Direction of synchronization

Example:

```text
Source: Monday.com
Direction: Monday → Scheduling Platform
External Record: 123456789
Action: Service eligibility changed
