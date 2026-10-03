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


## Durable Persistence Architecture Contract

Durable persistence is integrated incrementally behind the existing domain and application architecture. This section defines the cross-cutting persistence contract for migrated transactional workflows.

### Dependency Direction

The persistence dependency direction is:

**API / Interface → Application Service → Domain Model / Business Rules → Repository Interface → Persistence Implementation → PostgreSQL**

Domain and application logic must not depend on PostgreSQL-specific implementation details. Repositories own persistence mapping and database interaction; domain models remain independent of database row shape.

### Unit of Work and Transaction Ownership

Application commands that perform a logically atomic state change use a Unit of Work to own the transaction boundary.

The Unit of Work establishes:

- the database transaction;
- trusted organization and actor context;
- transaction-bound repository access;
- audit recording;
- domain-event recording; and
- event-outbox recording.

Repositories may participate in an existing Unit of Work. A repository must not silently create or commit an independent transaction when called inside an existing Unit of Work.

Simple reads may use repository operations without an explicit Unit of Work where a transaction is not required.

### Canonical Mutation Boundary

The canonical transactional sequence is:

1. Authenticate and establish the trusted principal.
2. Establish tenant/user/action database context.
3. Begin the Unit of Work.
4. Load the required aggregate/state through repositories.
5. Authorize the operation.
6. Validate domain and application rules.
7. Mutate the domain state.
8. Persist the state change.
9. Record the audit event.
10. Record the resulting domain event.
11. Record any required event-outbox entry.
12. Commit the transaction.
13. Return the result.

The state mutation, required audit record, domain event, and outbox entry are one atomic transaction. Failure of a required step rolls back the entire transaction.

### External Integrations

External integrations must not be performed while holding the core database transaction open.

After the internal transaction commits, background processing may deliver the resulting work to Monday.com, Outlook, notification providers, mapping services, or other external systems.

External-system failure must not roll back an already committed internal business transaction. Integration retry, reconciliation, and failure handling remain responsibilities of the integration/background-processing architecture.

### Tenant Context and Security

Organization scope comes from the authenticated trusted principal and transaction context. Client-supplied organization identifiers must not establish authorization scope.

Tenant isolation is defense in depth:

**Authentication → Authorization → Application tenant scope → Repository tenant scope → PostgreSQL RLS / forced RLS**

Repositories must apply appropriate tenant predicates even when PostgreSQL RLS provides the final database boundary.

### Domain / Database Mapping

Repositories translate between domain/application representations and database representations. Database rows do not need to be identical to domain objects.

Values whose historical meaning must remain stable must be persisted explicitly rather than recomputed from mutable future configuration.

### Concurrency

Where an entity requires optimistic concurrency, updates use a version/precondition and atomically increment the stored version. An update that affects no row because the expected version is stale is reported as a concurrency conflict.

Entity versioning does not replace scheduling conflict protection. Durable scheduling reservations and holds require their own database-enforced concurrency/conflict mechanisms.

### Durable Scheduling Holds

Scheduling holds are durable lifecycle state. They must survive process restart and must not depend solely on in-memory timers.

Expiration processing may be performed by background processing, but the database remains authoritative for hold state and expiration eligibility.

### Reads and Pagination

Interactive list queries must be bounded and deterministic. Keyset pagination is preferred for large or continuously changing collections.

The existing Client persistence slice establishes the current precedent for organization-scoped indexes, deterministic keyset pagination, and bounded page size.

Multi-query reads that require a consistent snapshot may use an explicit read transaction.

### Layered Idempotency

Idempotency is applied at the boundary appropriate to the operation rather than through one universal mechanism. Existing layers include request/operation idempotency, domain-event identity, field-execution operation identity, and notification delivery identity.

Each layer must preserve organization scope and must not weaken the underlying business invariant.

### Authoritative State and Migration

PostgreSQL is authoritative for an entity once that entity's durable repository migration is adopted.

The platform must not establish indefinite dual-write authority between in-memory and durable stores. During incremental migration, compatibility mechanisms may exist temporarily, but there must be a defined path to one authoritative persistence mechanism.

Additional domain services should migrate incrementally behind repositories without creating a second domain architecture.

### Persistence Error Semantics

Persistence failures must be translated into application-level outcomes appropriate to the operation, including not found, conflict, concurrency conflict, invalid related entity, authorization/RLS failure, retryable transient failure, and infrastructure failure.

Retries are limited to genuinely transient failures such as appropriate serialization, deadlock, or connection failures. Business conflicts and validation failures must not be blindly retried.

### Architecture-Change Triggers

This contract should be revisited only when implementation evidence demonstrates a material architectural problem, including:

- PostgreSQL cannot enforce a required invariant;
- the required business mutation cannot be made atomic;
- the repository boundary causes unavoidable domain leakage;
- tenant isolation cannot be reliably enforced;
- the concurrency model cannot protect a required invariant;
- the required MVP workflow cannot be represented by the contract; or
- demonstrated production-scale workload invalidates the design assumptions.

Implementation details such as exact SQL statements, filenames, dependency-injection wiring, worker technology, connection-pool tuning, and individual route implementations remain implementation concerns and do not constitute new architectural decisions by themselves.
