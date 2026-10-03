# Database Specification

The application requires a secure relational database.

The database must support multiple organizations and departments while keeping each organization's data isolated.

## Core Principles

The database must:

- Support multiple organizations
- Support multiple departments
- Support multiple users
- Support multiple properties
- Support multiple units per property
- Support clients with multiple properties
- Support multiple services per appointment
- Support multiple Auditors per appointment
- Support multiple Contractors per appointment
- Preserve historical records
- Support external system identifiers
- Support detailed audit logging

## Organization

An Organization represents an agency or other organization using the platform.

Fields may include:

- Organization ID
- Organization name
- Status
- Time zone
- Configuration
- Created date
- Updated date

## Department

A Department belongs to an Organization.

A department may have:

- Department ID
- Organization ID
- Department name
- Configuration
- Status
- Created date
- Updated date

An organization may have multiple departments.

## User

A User represents a person with access to the application.

A User may belong to:

- One organization
- One or more departments
- One or more roles

Fields may include:

- User ID
- Organization ID
- Name
- Email
- Phone
- Status
- Authentication information
- Created date
- Updated date

## Role

Roles define permissions.

Examples:

- Scheduler
- Auditor
- Contractor
- Department Manager
- Organization Administrator
- IT Administrator
- System Administrator

Roles must not be hard-coded in a way that prevents future organization-specific roles.

## Client

A Client represents the person receiving services.

A client may have multiple properties over time.

A client must have a persistent Client ID.

A client should not be uniquely identified only by:

- Name
- Phone
- Email
- Address

Fields may include:

- Client ID
- First name
- Last name
- Phone
- Email
- Status
- Created date
- Updated date

## Client Property Relationship

A separate relationship should connect Clients to Properties.

This is necessary because:

- A client may move
- A client may have multiple residences
- Multiple clients may live at one property
- A client may return to a previous property

The relationship may include:

- Client ID
- Property ID
- Unit ID when applicable
- Relationship type
- Start date
- End date
- Active status

## Property

A Property represents a physical residence or structure.

Fields may include:

- Property ID
- Property address
- City
- State
- ZIP
- Latitude
- Longitude
- Property type
- Scheduling zone
- Landlord/owner relationship
- Created date
- Updated date

## Unit

A Unit represents an individual dwelling within a property.

A property may have:

- One unit
- Multiple units
- Apartments
- Lots
- Mobile home spaces
- Other organization-defined unit types

Fields may include:

- Unit ID
- Property ID
- Unit identifier
- Unit type
- Address information
- Status

## Landlord / Owner

A Landlord or Owner may be associated with multiple properties.

Fields may include:

- Landlord/Owner ID
- First name
- Last name
- Phone
- Email
- Mailing address

The same Landlord/Owner should be reusable across multiple properties.

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

## Service

A Service represents a service offered by an organization.

Examples:

- AMP
- WX
- ASHP
- HS
- Add-on services

Services must be configurable.

Fields may include:

- Service ID
- Organization ID
- Name
- Code
- Description
- Active status

## Funder

A Funder represents a funding source.

A service may have multiple possible funders.

A client/property may have multiple available funding sources.

Fields may include:

- Funder ID
- Organization ID
- Name
- Code
- Status
- Configuration

## Eligibility

Eligibility must be modeled separately from the Client and Service records.

Eligibility may apply to:

- Client
- Unit
- Property
- Service
- Funder

The system must support combinations of these conditions.

Fields may include:

- Eligibility ID
- Client ID
- Property ID
- Unit ID
- Service ID
- Funder ID
- Eligibility status
- Effective date
- Expiration date
- Reason
- Source
- Created date
- Updated date

## Service Availability

The system must distinguish between:

- Eligibility
- Funding availability
- Scheduling availability

A service may be eligible but not currently schedulable.

## Service Funding

A client/unit/property may have multiple available funding sources.

The database must support many-to-many relationships between:

- Services
- Funders
- Clients
- Units
- Properties

## Funder Rules

Funder-specific rules must be stored separately from appointments.

Rules may include:

- Service duration
- Eligibility requirements
- Property requirements
- Unit requirements
- Effective date
- Expiration date
- Other configurable requirements

## Service Duration

Service duration must support:

- Default duration
- Funder-specific duration
- Service-combination duration
- Property-size adjustments
- Unit-count adjustments
- Other organization-defined modifiers

Historical appointment durations must not change when future configuration changes.

## Service Combination

An appointment may contain multiple services.

A Service Combination may define:

- Services included
- Base duration
- Additional duration
- Shared-task reduction
- Funder adjustments

## Auditor

An Auditor is a specialized Resource profile used for assessment work. An Auditor may have a User account, but **Resource ≠ User**; the generalized Resource remains the core scheduling abstraction.

An Auditor may be qualified for multiple services.

The database must support many-to-many relationships between Auditors and Services.

## Auditor Qualification

Fields may include:

- Auditor ID
- Service ID
- Qualification status
- Effective date
- Expiration date

## Auditor Zone Assignment

An Auditor may work in multiple zones.

Assignments may be restricted by:

- Day
- Time
- Maximum distance
- Maximum travel time

## Contractor

A Contractor is a specialized Resource profile used for external service delivery. Contractor-specific scheduling data remains supported without making Contractor the core Resource abstraction.

Contractors may be:

- Assigned before assessment
- Assigned after assessment
- Restricted by service
- Restricted by zone
- Restricted by date/time

## Contractor Qualification

Contractors may have service-specific qualifications.

## Contractor Availability

Contractor availability should support:

- Recurring schedules
- Specific dates
- Specific time windows
- Specific zones
- Maximum travel distance

## Scheduling Zone

A Zone represents an organization-defined geographic scheduling area.

Fields may include:

- Zone ID
- Organization ID
- Name
- Description
- Geographic definition
- Active status

## Zone Relationships

Zones may have relationships indicating:

- Adjacent
- Compatible
- Restricted
- Preferred

These relationships assist travel calculations.

## Availability

Availability should be modeled separately from appointments.

An Auditor may have:

- Working hours
- Time off
- Blocks
- Training
- Administrative time
- Other unavailable periods

## Appointment

An Appointment represents a scheduled visit.

Fields may include:

- Appointment ID
- Organization ID
- Department ID
- Client ID
- Property ID
- Status
- Start time
- End time
- Zone
- Created by
- Created date
- Updated date

## Appointment Units

An appointment may apply to:

- Entire property
- Selected units
- One unit

The selected units must be explicitly stored.

## Appointment Services

An appointment may contain multiple services.

Each service must have its own appointment-service record.

This allows:

- Separate service status
- Separate job number
- Separate funding information
- Separate completion status
- Separate scheduling history

## Appointment Auditors

An appointment may have multiple Auditors.

This relationship must be stored separately.

## Appointment Contractors

An appointment may have multiple Contractors.

This relationship must be stored separately.

## Job Number

Each service may have its own job number.

Job numbers may be:

- Numeric
- Alphanumeric
- Custom

Example:

Appointment:

AMP + ASHP

Job numbers:

- AMP-26-00123
- ASHP-26-00451

## Scheduling Hold

A Scheduling Hold temporarily reserves resources.

Fields may include:

- Hold ID
- Scheduler ID
- Client ID
- Property ID
- Appointment information
- Auditor
- Expiration time
- Status

## Communication

Communications should be stored separately from appointments.

A communication may be:

- Email
- SMS
- Push notification
- System notification
- Voice-related event

Fields may include:

- Communication ID
- Recipient
- Appointment
- Type
- Template
- Status
- Sent date
- Delivery result

## External System Connection

An organization may have multiple external integrations.

Fields may include:

- Connection ID
- Organization ID
- Provider
- Status
- Configuration
- Credential reference
- Created date

Secrets must not be stored directly in normal database fields.

## External Record Mapping

External records must map to internal records.

Examples:

- Monday item → Client
- Monday item → Property
- Monday item → Unit
- Monday item → Appointment
- Monday item → Service

The mapping must preserve the external system's stable record identifier.

## External Field Mapping

Each integration may define mappings between external fields and internal fields.

Mappings must be configurable.

## Synchronization Event

Synchronization events must record:

- Connection
- Direction
- External record
- Internal record
- Field
- Previous value
- New value
- Timestamp
- Result
- Error

## Appointment History

Appointment changes must preserve history.

The system must not simply overwrite important historical information.

Historical records may include:

- Original appointment
- Rescheduled appointment
- Cancellation
- Auditor reassignment
- Service changes
- Completion changes

## Audit Log

Audit records must be stored separately and must follow the requirements in `AUDIT_LOG.md`.

## Archiving

Records should normally be archived rather than permanently deleted when historical preservation is required.

The system must distinguish between:

- Active
- Archived
- Deleted where legally permissible

## Data Isolation

Every organization-owned record must be associated with an Organization ID.

Users must only be able to access records they are authorized to access.

Department-level restrictions must also be enforceable.

## Data Integrity

The database must enforce appropriate relationships and constraints.

Examples:

- An appointment cannot reference a nonexistent client.
- An appointment service cannot reference a nonexistent service.
- An Auditor assignment cannot reference a nonexistent Auditor.
- A Unit must belong to a Property.
- A Client/Property relationship must reference valid records.

## Historical Integrity

Changes to current eligibility, service duration, funding rules, or configuration must not rewrite historical appointment records.

Historical appointments must retain the values that applied when they were created.

## Future Scalability

The database architecture should support:

- Multiple organizations
- Multiple departments
- Thousands of clients
- Large appointment volumes
- Multiple simultaneous Schedulers
- Large numbers of Auditors
- Multiple external integrations
- Mobile applications
- Future standalone commercial deployments


## Implemented persistence foundation

The repository now has the first secure PostgreSQL persistence boundary without migrating the domain services in one step.

Implemented:

- PostgreSQL connection pooling through `DATABASE_URL`
- TLS verification enabled by default; insecure transport must be explicitly opted out
- bounded pool and connection/idle timeouts
- explicit transaction helper
- transaction-local trusted organization, user, and action context
- ordered SQL migrations with a migration ledger
- organization-scoped row-level security (RLS) with forced RLS
- append-only audit event protection
- durable domain-event and event-outbox primitives
- durable notification delivery-key uniqueness
- durable field-execution operation idempotency storage

The Field Visit and Actual Work services now use durable repositories when a PostgreSQL pool is configured. Their lifecycle writes and offline replay share transaction boundaries with the durable operation ledger. Other domain services remain on their existing stores and will move incrementally when their workflows require it.

The application role must not rely on client-supplied tenant identifiers for authorization. API principals establish the trusted organization context before database work is performed.


## Capacity and query discipline

The launch capacity target is hundreds of active/pending client records per organization, with an engineering target of approximately 1,000–5,000 active/pending client records per organization without fundamental architectural redesign. Historical records must remain queryable beyond that range.

Durable persistence is implemented incrementally behind the existing domain architecture. The first high-volume vertical slice is Client persistence through ClientRepository, using the trusted organization context established by the authenticated principal.

The client persistence path uses:

- PostgreSQL as the authoritative store
- Organization-scoped indexes
- Keyset pagination ordered by created_at DESC, id DESC
- A bounded page size of 100 records
- Tenant predicates in repository queries in addition to database RLS

This is intentionally not a general repository framework. Additional entities should move to durable repositories incrementally when their workflow requires it.

Scheduling queries must remain bounded by time/resource windows; background processing and incremental integration synchronization remain the mechanisms for work that should not block interactive requests.


## Field Execution Persistence

Field Visit and Actual Work are now durable when PostgreSQL persistence is configured.

Implemented:

- tenant-scoped `field_visits` storage with optimistic version replacement
- tenant-scoped `actual_work` storage
- tenant-scoped durable offline operation ledger
- transaction-local trusted organization/user/action context for field execution reads and writes
- durable offline replay with operation fingerprint validation
- durable duplicate replay detection
- version/conflict protection for Field Visit lifecycle changes
- tenant-scoped composite foreign keys from Actual Work and offline operations to Field Visit
- transaction boundaries that commit Field Visit/Actual Work state and the corresponding applied/conflict operation record together
- post-commit preservation of existing audit and domain-event behavior

The PostgreSQL integration test verifies migration execution, RLS context, persistence across service instances, duplicate replay, payload mismatch detection, version conflicts, and Actual Work persistence.

## Authoritative Durable Persistence Migration Sequence

The project has approved the following as the **default implementation order for incremental durable persistence migration**:

1. Client
2. Property / Unit / Client relationships
3. Job / Work Order
4. Resource / Qualification / Availability
5. Appointment / Hold
6. Assignment
7. Field Visit / Actual Work
8. Notifications / Domain Events / Outbox consumers

This is the project's default **overall** durable-persistence migration sequence. It includes stages that are already durably implemented for completeness, dependency context, and migration history; already-completed migrations are not repeated. Implementation proceeds from the first applicable incomplete persistence slice. Based on the current repository state, Client and Field Visit / Actual Work persistence already exist, so the next incomplete authorized slice is Job / Work Order.

This clarification does not change the approved eight-step sequence or MVP scope. The sequence may be adjusted only when a concrete architectural dependency, technical constraint, or implementation finding requires a different order. Any material deviation must be documented in the authoritative Open Questions/architecture records before implementation proceeds.

This decision does not require all stages to be implemented immediately, does not expand MVP scope by itself, and does not authorize unrelated runtime functionality.

**Current authorization:** Job / Work Order is the next authorized durable-persistence slice, subject to the normal implementation review, testing, and verification requirements.

This decision establishes migration order only; it does not create a new architecture layer or replace the existing domain boundaries.
