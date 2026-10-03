# System Architecture

The Scheduling Platform should use a modular architecture that separates the user interfaces, application API, scheduling engine, database, integrations, notifications, and audit logging.

The system must be capable of operating independently or with external platforms such as Monday.com and Microsoft Outlook.

## High-Level Architecture

The system should consist of:

1. Client interfaces
2. Scheduler interface
3. Auditor mobile interface
4. Contractor interface
5. Administrative interfaces
6. Backend API
7. Scheduling Engine
8. Database
9. Integration Layer
10. Notification Service
11. Audit Log
12. Authentication and Authorization
13. Background Job / Synchronization System

## Frontend

The frontend provides the user interfaces described in `UI_SCREENS.md`.

The frontend should communicate with the backend through the API.

The frontend must not directly access the production database.

The system should support responsive web interfaces for:

- Desktop
- Tablet
- Mobile

Future native mobile applications may use the same API.

## Backend API

The backend API is the primary communication layer between the frontend and the application's data and business logic.

It should handle:

- Authentication
- Authorization
- Intake records
- Applications
- Vetting/review records
- Eligibility Determinations
- Evidence/document records
- Service Restrictions
- Client/person records
- Properties
- Units
- Services
- Eligibility
- Funding
- Appointments
- Calendars
- Users
- Notifications
- Integrations
- Reporting

The API requirements are defined in `API.md`.


## Intake, Application, Vetting, Eligibility & Service Restrictions

The platform's pre-operational workflow is modeled as:

**Intake → Application → Vetting → Eligibility Determination → configurable outcome → potentially Job**

These are domain concepts within the existing backend/API, database, configuration, audit, and integration architecture; they are not a separate application layer.

The architecture must preserve:

- Intake as receipt/routing of information or requests.
- Application as a first-class submission record.
- **Application ≠ Job.**
- Vetting as configurable review and verification.
- **Eligibility Determination ≠ Eligibility Boolean.**
- Evidence as traceable support for reviews and determinations.
- Historical/immutable determination records.
- Service Restrictions as configurable limitations/warnings distinct from eligibility.
- Configurable Application → Job transition rules.

Organizations may configure intake sources, forms, conditional questions, signatures, documents, application statuses/transitions, vetting steps, eligibility rules/outcomes, restriction detection/approval/notification/escalation, and Application → Job mappings without changing the core platform.

The architecture remains industry-neutral. Organization-specific rules and terminology belong in configuration.


## Scheduling Engine

The Scheduling Engine is a separate logical component.

It should determine whether an appointment can be offered based on:

- Service eligibility
- Selected units
- Property eligibility
- Funding
- Auditor qualifications
- Auditor availability
- Contractor requirements
- Contractor availability
- Zones
- Travel time
- Existing appointments
- Scheduling holds
- Organization rules
- Service duration
- Service combinations

The Scheduling Engine must not depend on Monday.com.

Monday.com may provide information used by the engine, but the engine must also work for organizations without Monday.com.

## Database

The database stores the application's authoritative internal records.

The database architecture is described in `DATABASE.md`.

The database should contain:

- Organizations
- Departments
- Users
- Intake/Application records
- Vetting and Eligibility Determinations
- Evidence and Service Restrictions
- Clients
- Properties
- Units
- Landlords/Owners
- Services
- Funders
- Eligibility
- Availability
- Appointments
- Appointment services
- Auditors
- Contractors
- Zones
- Integrations
- Communications
- Scheduling holds
- Audit records
- Synchronization records

## Internal Source of Truth

The Scheduling Platform must maintain its own internal scheduling records.

External systems must not be required for the application to function.

This is particularly important for:

- Appointments
- Scheduling holds
- Auditor schedules
- Client self-scheduling
- Calendar availability
- Scheduling history

## Integration Layer

External systems connect through an Integration Layer.

The Integration Layer should support:

- Monday.com
- Microsoft Outlook
- SMS providers
- Email providers
- Mapping providers
- Future external systems

Each integration should be modular and replaceable.

## Monday.com

Monday.com is an external integration and is not part of the core Scheduling Engine.

**Current job MVP:** the Monday.com integration is a required deployment component because the existing business workflow depends on it. The integration must remain behind the Integration Layer so the core domain and scheduling engine do not depend on Monday-specific data structures.

For other organizations, Monday.com may remain disconnected; standalone operation is a product capability, not a reason to couple the core architecture to Monday.com.

When connected, it may provide:

- Client information
- Property information
- Unit information
- Eligibility
- Funding information
- Service status
- Job numbers
- Auditor information
- Assessment dates
- Zone information

The Scheduling Platform may send information back to Monday.com.

The Monday.com architecture is defined in `MONDAY_INTEGRATION.md`.

## Outlook

Microsoft Outlook may be used as an external calendar synchronization system.

The internal Scheduling Platform calendar remains authoritative for scheduling decisions.

Outlook synchronization may provide:

- Availability blocks
- Existing calendar events
- Appointment synchronization

The system should avoid unnecessary client information in external calendar entries.

## Notification Service

Notifications should be handled by a dedicated service.

Supported channels may include:

- In-app notifications
- Push notifications
- SMS
- Email

Examples include:

- Auditor running late
- Auditor cancellation
- Client cancellation
- Client reschedule
- Client confirmation
- Scheduler follow-up
- Integration failure

## Background Jobs

The system should use background processing for tasks that should not block the user interface.

Examples:

- Monday synchronization
- Outlook synchronization
- Sending notifications
- Retry processing
- Report generation
- Data reconciliation
- Travel calculations
- Scheduled reminders

## Synchronization Queue

External changes should be processed through a synchronization mechanism when appropriate.

The synchronization system should support:

- Queuing
- Retry
- Failure tracking
- Duplicate prevention
- Conflict detection
- Manual retry

## Audit Logging

Important system activity must be recorded.

The Audit Log should record:

- Who performed the action
- What was changed
- When it occurred
- What record was affected
- Previous value where applicable
- New value where applicable
- Source of the action

Actions originating from:

- Web
- Mobile
- Monday.com
- Outlook
- API
- Automated workflows

should be distinguishable.

## Authentication

Authentication should be handled centrally.

The system should support secure authentication methods described in `SECURITY.md`.

## Authorization

Authorization should occur in the backend.

Permissions should be based on:

- Organization
- Department
- Role
- Resource
- Action

## Multi-Organization Architecture

The platform must support multiple independent organizations.

Each organization's data must remain isolated.

An organization should be able to configure:

- Services
- Funders
- Zones
- Scheduling rules
- Users
- Roles
- Integrations
- Notification settings

## No-Integration Mode

An organization must be able to use the complete scheduling system without an external platform.

In this mode, authorized users can create:

- Clients
- Properties
- Units
- Services
- Eligibility information
- Appointments

directly in the Scheduling Platform.

## Mobile Architecture

Auditor mobile access should use the same backend API as the web application.

The mobile application should support:

- Current schedule
- Appointment details
- Appointment actions
- Offline access
- Synchronization
- Push notifications
- Driving mode
- Widget actions

## Offline Operation

The mobile application should maintain a limited encrypted local cache of necessary information.

When offline, it should allow approved actions that do not require immediate server validation.

When connectivity returns, the application should synchronize changes.

Conflicts must be detected rather than silently overwritten.

## Field Execution Offline Synchronization

Field execution offline behavior is part of the Field Visit / Actual Work workflow, not a separate domain architecture.

The client may persist immutable field-execution operation envelopes locally when disconnected. Each envelope carries tenant context, actor identity, device ID, capture/action timestamps, a unique operation ID, payload, and a Field Visit version precondition when applicable.

The backend exposes an authenticated field-execution synchronization boundary. Synchronization reuses the normal Field Visit and Actual Work services, permissions, tenant-scoped lookups, audit logging, and domain events. Operation IDs are idempotency keys; conflicting reuse of an operation ID is rejected. Field Visit version mismatches are conflicts and are never silently overwritten.

The client removes only successfully applied or confirmed-duplicate operations. Conflicts and rejected operations remain visible locally so partially synchronized work is not lost or silently discarded.

The initial implementation is deliberately limited to field execution. It does not introduce a general offline framework, background sync engine, attachment cache, or offline billing workflow.

## Client Portal Architecture

The Client Portal should use restricted API access.

A client should be able to:

- View available appointments
- Schedule
- Reschedule
- Cancel
- Provide optional notes

The client must not have access to internal operational information.

## Geographic Services

The Scheduling Engine should use a replaceable geographic service for:

- Geocoding
- Distance
- Travel time
- Routing

Geographic services should not contain core scheduling logic.

## Reporting

Reporting should operate from the application's internal data.

Reports should not require Monday.com to remain available.

Reports are described in `REPORTING.md`.

## Future Analytics / Read-Layer Architecture

The application's transactional operational data remains the authoritative source for operational records and business transactions.

For future high-volume reporting and analytics workloads, the architecture may distinguish between:

`Operational transactional data → analytics/reporting read layer → dashboards and high-volume analytics`

This is a future architectural consideration rather than an MVP requirement. It does not change the existing transactional architecture and does not require a separate analytics database or read model at this stage.

As scale, query volume, or analytical workload characteristics justify it, the platform may introduce read-optimized, pre-aggregated, replicated, cached, or otherwise analytical structures. The appropriate approach should be selected based on demonstrated workload and consistency requirements rather than assumed in advance.

Any future analytical/read-layer implementation must preserve:

- Organization and tenant isolation.
- Backend-enforced permissions and role/department access boundaries.
- Privacy and minimum-necessary-data principles.
- Auditability.
- Historical reporting accuracy.
- A clear relationship to authoritative operational records.
- Explicit and appropriate consistency expectations between operational and analytical data.

Analytical structures must not become an independent source of truth for transactional operations. Existing asynchronous report generation remains part of the reporting architecture and may continue to be used alongside any future read-optimized structures.

No implementation tables, APIs, synchronization mechanisms, or separate analytical datastore are mandated by this consideration.

## Failure Isolation

Failure of an external service should not unnecessarily stop the core application.

For example:

If Monday.com is unavailable:

- Schedulers should still be able to use the internal calendar.
- Existing appointments should remain accessible.
- Changes should queue for synchronization.
- Administrators should be notified of synchronization failures.

## Scalability

The architecture should support growth from:

- One organization
- One department
- A small number of users

to:

- Multiple organizations
- Multiple departments
- Many simultaneous users
- Large client databases
- Large appointment volumes
- Multiple external integrations

## Replaceable Components

The following should be replaceable without redesigning the entire application:

- Mapping provider
- SMS provider
- Email provider
- Authentication provider
- Calendar provider
- External integration providers

## Security Boundary

The database, API, scheduling engine, and integrations must not trust client-side data without server validation.

All important business rules must be enforced server-side.

## Deployment

The architecture should eventually support deployment to a secure cloud environment.

Development, testing, and production environments should remain separate.

Production credentials and client data must never be placed in the public GitHub repository.

## Development Principle

The system should be built in modules.

A change to one component should require minimal changes to unrelated components.

The initial implementation should prioritize:

1. Secure authentication
2. Database
3. Backend API
4. Scheduling Engine
5. Internal calendar
6. Scheduler interface
7. Auditor interface
8. Client scheduling
9. Notifications
10. Monday.com integration
11. Outlook synchronization
12. Reporting

The system should be tested at each stage before adding the next major component.
