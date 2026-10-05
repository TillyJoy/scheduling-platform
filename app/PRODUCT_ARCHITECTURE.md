# Product Architecture Requirements

## Product Model

Scheduling Platform is a multi-organization SaaS product.

The product must be designed so organizations can purchase, configure, operate, troubleshoot, and maintain their own environment without requiring the product owner for normal operation.

The product owner should not need to perform organization-specific configuration or custom development.

## Core Principle

Build once.

Configure rather than customize.

Organizations must use configuration rather than organization-specific code whenever possible.

## Multi-Organization

One application may serve multiple organizations.

Organization data must be strictly isolated.

No organization may access another organization's:

- Clients
- Properties
- Units
- Users
- Appointments
- Services
- Funding
- Integrations
- Audit records
- Configuration

## Self-Service Onboarding

New organizations must be able to complete setup without assistance.

The onboarding process should guide administrators through:

1. Organization information
2. Language
3. Terminology
4. Roles and permissions
5. Users
6. Services
7. Zones
8. Resources
9. Teams
10. Scheduling rules
11. Availability
12. Notifications
13. Integrations
14. Testing
15. Activation

## Self-Service Configuration

Administrators must be able to configure the application without code.

Configuration may include:

- Terminology
- Definitions
- Languages
- Roles
- Permissions
- Services
- Zones
- Zone definitions
- Teams
- Resources
- Qualifications
- Appointment statuses
- Scheduling rules
- Availability
- Holidays
- Closures
- Travel rules
- Notifications
- Integrations
- Custom fields
- Branding

## Resources, Assignments, and Services

Resources are generalized schedulable or operational capabilities. A **Resource is not a User**. A User represents authenticated access to the application; a Resource represents something that can be available, qualified, assigned, scheduled, or otherwise consumed by operational work.

Resource types are organization-configurable and may include people, contractors, teams or crews, equipment, vehicles, rooms, facilities, or other organization-defined types. The core architecture must not require an Auditor or Contractor to be the underlying Resource abstraction.

Resource configuration may include:

- Resource type
- Role or operational function
- Capabilities
- Qualifications
- Qualification documentation and verification
- Effective dates
- Expiration dates
- Status
- Availability
- Geographic restrictions
- Service-specific restrictions
- Organization-defined attributes

A **Resource is not an Assignment**. An Assignment connects one or more Resources to operational work. Assignment behavior must support creation, modification, reassignment, removal, historical tracking, authorization, and audit.

Teams are configurable groupings of Resources for operational purposes. Team membership is distinct from system-user membership. A Resource may belong to a Team without being a User, and a User may have system access without being a Resource.

A **Service Definition is not Actual Work**. A Service Definition describes a type of work an organization offers or performs; it is not an occurrence of that work.

A Service Definition may configure:

- Duration
- Required Resources or Resource types
- Required qualifications and capabilities
- Scheduling rules
- Eligibility requirements
- Geographic restrictions
- Workflow requirements
- Notification behavior
- Billing behavior
- Required documentation
- Other organization-defined rules

The conceptual operational relationship is:

**Service Definition → Operational Work → Assignment → Scheduled Activity → Actual Work**

These concepts remain distinct. Service Definitions, Resources, Assignments, scheduled activities, and Actual Work must not be collapsed into a single record or abstraction.

## Authentication

The system must support secure authentication.

Future support should include:

- Password authentication
- Password reset
- Session management
- Multi-factor authentication
- Account recovery
- Organization membership

## Roles and Permissions

Permissions must be separate from displayed role names.

Organizations may create custom roles.

Permissions should be granular enough to control:

- View
- Create
- Edit
- Delete
- Schedule
- Cancel
- Reschedule
- Configure
- Manage users
- Manage integrations
- View audit logs
- View diagnostics
- Export data

## Time Zones

Each organization must have a configured time zone.

Appointments must use unambiguous timestamps internally.

User interfaces should display dates and times according to the appropriate organization or user context.

## Availability

Availability must support:

- Individual availability
- Team availability
- Recurring schedules
- Exceptions
- Holidays
- Closures
- Blackout periods
- Service-specific availability

## Travel

Scheduling rules may include travel time.

Travel requirements must be configurable.

The scheduling engine must prevent appointments that cannot reasonably be reached within the available time.

## Appointment Lifecycle

Appointment statuses must be configurable.

Examples:

- Requested
- Pending
- Held
- Scheduled
- Confirmed
- On the Way
- In Progress
- Completed
- Cancelled
- No Show
- Rescheduled

Organizations may define their own terminology.

## Waitlist

Organizations may enable a waitlist.

The system should be able to identify available appointments and notify eligible waitlisted clients when configured.

## Notifications

Notifications must support configurable channels such as:

- In-app
- Email
- SMS

Administrators should configure:

- Notification types
- Timing
- Recipients
- Templates
- Enable/disable settings

Notification and communication preferences are a first-class architectural requirement. The architecture must account for recipient and channel preferences and how those preferences interact with configurable notification rules. Preferences must operate within existing organization/tenant isolation, the permission model, notification-rule configuration, recipient resolution, and delivery-channel architecture.

This is an architectural requirement only. The existence of the notification foundation does not imply that notification preferences are currently implemented, and this requirement does not by itself add notification preferences to MVP implementation scope.

Mandatory communications are also a first-class architectural requirement. The architecture must distinguish:

- mandatory communications that cannot be disabled by applicable recipient preference;
- preference-controlled or optional communications; and
- organization-configured communication requirements that define when, for whom, and through which permitted channels a communication is required.

Mandatory status must be evaluated during notification processing and must interact with notification rules, recipient resolution, recipient/channel preferences, permissions, tenant isolation, auditability, delivery-channel fallback, retry, failure, and escalation behavior. Required communications remain required when an initial delivery attempt fails; applicable retry, fallback, failure, and escalation handling must preserve that requirement.

Organizations configure these requirements through the shared notification architecture. Mandatory communications are not hard-coded for a specific organization. This is an architectural/future capability requirement and does not by itself add mandatory communications to MVP implementation scope or imply that the current notification foundation implements them.

Restriction or unservable alerts remain configurable notification behavior. The platform must not hard-code a particular organization's definition of a restriction, unservable condition, recipient, channel, escalation, or message. Such alerts are produced through organization-configured rules and the shared notification/recipient-resolution architecture.

## Integration Security

External credentials must never be stored in source code.

Secrets must be securely stored and protected.

Integration credentials should be configurable by authorized administrators.

## Integration Reliability

Integrations must support:

- Webhooks
- Polling
- Configurable polling frequency
- 30-second default polling where polling is required
- Retry
- Exponential backoff
- Rate-limit protection
- Sync history
- Conflict detection
- Manual Sync Now
- Reconciliation

## Business History

The system must preserve meaningful historical events.

Examples:

- Service history
- Property history
- Unit history
- Eligibility changes
- Appointment history
- Funding changes
- Resource assignments

Business history is separate from the technical Audit Log.

## Audit Log

Important administrative and operational changes must be recorded.

Audit records should identify:

- Who
- What
- When
- Previous value
- New value
- Source

Audit records should not be casually deletable.

## Search

The platform must provide powerful search and filtering.

Search should support combinations of:

- Client
- Property
- Unit
- Service
- Zone
- Eligibility
- Priority
- Availability
- Resource
- Team
- Appointment status
- Date range
- Custom fields

## System Health

Administrators must have access to a System Health area.

It should display:

- Application status
- Database status
- Integration status
- Sync status
- Failed jobs
- Pending jobs
- Notification failures
- Recent errors
- Application version
- Configuration warnings

## Error Handling

The system should explain errors in administrator-friendly language.

Technical details should be available when appropriate without requiring the administrator to understand programming.

## In-App Bug Reporting

Users should be able to report a problem from within the application.

The report should automatically include appropriate diagnostic information such as:

- Application version
- Screen
- Timestamp
- Organization
- Error identifier
- Relevant system diagnostics

Sensitive client information should not be included unless necessary.

## Automatic Monitoring

The system should monitor itself for:

- Failed background jobs
- Failed integrations
- Database problems
- Notification failures
- Repeated application errors
- Configuration problems

## Automatic Recovery

Where safely possible, the system should automatically:

- Retry failed operations
- Reconnect integrations
- Resume interrupted jobs
- Recover from temporary external service failures

## Safe Repair Tools

Administrators should have safe tools for common problems.

Examples:

- Retry sync
- Rebuild integration connection
- Reprocess failed notification
- Recalculate availability
- Re-run configuration validation

Destructive repair operations must require confirmation.

## Help System

The product should contain built-in documentation.

Help should explain:

- Features
- Configuration
- Errors
- Integrations
- Scheduling rules
- User management

Help should be contextual where practical.

## Data Export

Organizations must be able to export their data.

Exports should support common formats such as:

- CSV
- JSON

Export permissions must be configurable.

## Backups

Production data must be automatically backed up.

Backup and recovery processes should not require customer intervention.

## Updates

The application must support centrally managed updates.

The product owner should deploy an update once rather than manually updating individual organizations.

Organizations should receive updates automatically according to the deployment strategy.

## Database Migrations

Database changes must use versioned migrations.

Migrations must be designed to minimize downtime and prevent data loss.

## Versioning

The application must maintain a visible application version.

System diagnostics should display the current version.

## Feature Flags

New functionality should be controllable through feature flags where appropriate.

Feature flags may be used for:

- Gradual releases
- Testing
- Emergency disabling
- Organization-specific feature availability

Feature flags must not become a substitute for proper product architecture.

## Billing

Organizations should eventually be able to manage their own subscription.

Self-service billing should support:

- Plan selection
- Payment method
- Invoices
- Upgrades
- Downgrades
- Cancellation

## No Organization-Specific Code

Organization requirements must normally be implemented through:

- Configuration
- Rules
- Custom fields
- Terminology
- Permissions
- Integrations
- Feature configuration

Custom code should not be required for ordinary customer setup.

## Branding

Organizations may eventually configure limited branding such as:

- Logo
- Organization name
- Optional brand colors

Branding must not interfere with usability or accessibility.

## Scalability

The architecture should support adding organizations without requiring a separate application installation for each organization.

## Dependency Reduction

The core Scheduling Engine must not depend on Monday.com.

External integrations are optional adapters.

## Product Owner Independence

Normal customer operation should not require the product owner.

The product should be designed to minimize:

- Manual setup
- Manual troubleshooting
- Manual updates
- Manual data repair
- Custom development
- Customer-specific deployments

## Design Goal

The ultimate product experience is:

An organization purchases the product.

The organization creates its account.

The administrator completes the setup wizard.

The organization configures its terminology, users, services, zones, resources, rules, and integrations.

The organization operates the application independently.

The product updates itself through centrally managed releases.

The organization can diagnose and resolve common problems without contacting the product owner.

---

## Future Contractor Compliance & Administration

Contractor/external-resource compliance is a future/later-phase product capability and is explicitly outside the initial MVP.

The product should eventually allow organizations to configure compliance requirements and administer evidence without organization-specific code.

The conceptual flow is:

**Contractor/External Resource → Configurable Requirements → Evidence → Evaluation → Configurable Operational Rule → Assignment/Scheduling/Work Consequence**

The model must distinguish:

- Compliance Requirement
- Compliance Evidence
- Compliance Evaluation

It must not collapse compliance into a single Boolean contractor status.

Future configurable compliance domains include:

- Licenses and credentials
- Insurance policies
- Qualifications and certifications
- Contracts and agreements
- Supporting documents
- Verification information
- Expiration and renewal information

Future operational consequences may be configured to:

- Prevent assignment
- Prevent scheduling
- Prevent activation/work authorization
- Prevent payment
- Restrict particular services
- Require administrative approval
- Allow assignment with warning

Organizations should eventually be able to configure expiration thresholds and resulting notifications/escalations, such as a 60-day warning followed by a 30-day escalation.

Authorized administrators should eventually be able to apply controlled overrides that record the requirement, contractor/resource, reason, authorizer, effective date, expiration date, scope, and audit record.

Shared documents should eventually be associable with contractors, contracts, licenses/credentials, insurance policies, and qualifications.

The capability must inherit the platform's organization/tenant isolation, permission, privacy, and audit requirements.

**Scope boundary:** full contractor licensing/insurance/compliance tracking remains out of scope for the initial MVP. This section is architectural preservation only and must not be converted into an MVP implementation item.


## Customer Surveys — Future Configurable Capability

Customer Surveys are a future platform capability and are **not an MVP requirement** unless a later authoritative MVP decision explicitly brings them into scope.

The platform should support a configurable survey lifecycle:

**Work Completed → Survey Invitation → Survey Landing Page → Response → Survey Results → Reporting / Analytics**

Organizations should be able to configure:

- Questions
- Question types
- Ratings
- Comments
- Required fields
- Branding
- Expiration
- Trigger conditions
- Anonymous responses
- Invitation timing
- Follow-up behavior

Survey definitions, invitations, responses, and results must be treated as distinct platform records rather than as reporting-only data.

Survey responses may be associated, where configured and appropriate, with:

- Organization
- Person/customer
- Job
- Work Order
- Appointment
- Service
- Resource/contractor

These relationships must respect organization isolation, permissions, privacy requirements, and configured anonymity behavior.

Survey capability should remain domain-neutral. Organizations may configure survey definitions and lifecycle behavior rather than requiring organization-specific code.

This capability should eventually support both operational follow-up and reporting/analytics while preserving the distinction between survey response data and derived reports.

## Customer Survey / Feedback — Future Configurable Platform Capability

Customer Survey / Feedback is a distinct, configurable, industry-neutral platform capability. It is separate from Intake Forms, Jobs, Work Orders, Appointments, Field Visits, Services, Resources, Notifications, and Reporting records. Survey responses are their own domain information associated with relevant operational context.

This is a future architecture capability, not an MVP implementation requirement.

### Conceptual Lifecycle

**Work Completed → Survey Invitation → Survey Landing Page → Response → Survey Results → Reporting / Analytics**

This lifecycle is conceptual architecture only and does not imply that survey runtime functionality currently exists.

### Survey Definition

A Survey Definition is organization-configurable. Established configuration includes:

- Questions
- Question types
- Required versus optional questions
- Ratings
- Comments / free text
- Branding
- Expiration
- Triggering conditions
- Invitation timing
- Follow-up behavior
- Privacy / anonymity configuration

### Survey Invitation and Response Boundaries

Survey Invitation and Survey Response are distinct records.

Survey invitations must reuse the existing Notifications & Communications architecture for delivery. Survey-specific invitation behavior remains future implementation; no second notification system is introduced.

A Survey Response is distinct from:

- Survey Definition
- Survey Invitation
- Job
- Work Order
- Appointment
- Field Visit
- Service
- Resource
- Operational reporting records

Responses may contain the configured questions and answers, ratings, comments, and other configured response information.

### Operational Relationships

A survey or response may be associated, as configured and appropriate, with:

- Organization
- Person / customer
- Job
- Work Order
- Appointment
- Service
- Resource / contractor

No relationship is made mandatory by this architecture unless established by a later authoritative survey design.

### Anonymous and Identified Responses

The platform must support configurable anonymous versus identified survey responses.

Where a survey is configured as anonymous, configured anonymity must be preserved through:

- Operational relationships
- Metadata
- Reporting
- Drill-down
- Filters
- Exports
- Derived analytics

The technical mechanism for preserving anonymity is intentionally not established by this architecture transfer and remains a future implementation/design question.

### Privacy, Permissions, and Tenant Isolation

Survey capability must reuse existing platform foundations for:

- Tenant isolation
- Permissions
- Authorization
- Audit
- Privacy controls

Survey architecture must not duplicate these foundations.

### Reporting and Analytics

Survey responses/results remain distinct from operational records and reporting records.

Survey reporting may include, where permitted:

- Response rates
- Ratings
- Comments
- Completion
- Trends
- Service-related results
- Appointment / work-order-related results
- Resource / contractor-related results

Reporting must respect configured anonymity, permissions, tenant boundaries, and privacy.

The existing **Customer Survey Reporting** material in `app/REPORTING.md` is part of this architecture and is not duplicated here.

### Survey Landing Page

The architecture includes a Survey Landing Page as part of the conceptual lifecycle. The exact public/authenticated access mechanism is intentionally open and is not established by this transfer.

### Deferred / Not Established

This transfer does not decide or implement:

- Database schema
- API design
- Frontend implementation
- Public authentication/access mechanism
- Duplicate-response rules
- Response editing
- Partial or draft submissions
- Scoring methodology
- Attachments
- Detailed retention/deletion rules
- Exact anonymity implementation
- Survey runtime services
- Survey notification automation implementation

### Architectural Boundaries

The following distinctions are authoritative:

- **Survey Definition ≠ Survey Invitation**
- **Survey Invitation ≠ Survey Response**
- **Survey Response ≠ Reporting Record**
- **Survey ≠ Intake Form**
- **Survey ≠ Operational Work**
- **Survey ≠ Notification**

Existing configurable platform foundations must be reused wherever applicable.

### Provenance and Governance

This architecture was transferred from the Customer Survey / Feedback workstream after its archival-safety review determined that the substantive architecture was not fully represented in the authoritative repository records.

Historical PR #22 contains related documentation but remains an open, unmerged historical artifact. It is not the authoritative implementation source for this capability after this transfer.

No runtime implementation, database schema, API, UI, public submission mechanism, scoring engine, or survey service is implied by this architecture record.

