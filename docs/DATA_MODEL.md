# Agency Scheduling Platform
## Data Model — V1 Planning Document

**Status:** Draft  
**Purpose:** Define the core entities, relationships, and data responsibilities of the scheduling platform.

---

# 1. Data Model Principles

The application must separate people, properties, units, services, eligibility, funding, scheduling, and historical activity.

The system must not treat the Monday.com Central Vetting board as the database structure.

Monday.com is an external system that may provide information to the application, receive information from the application, or both.

The scheduling platform must have its own normalized internal data model.

The model must support:

- Multiple organizations
- Multiple departments
- Multiple users
- Multiple clients
- Multiple properties per client
- Multiple clients associated with one property
- Multiple units within one property
- Historical occupancy
- Multiple services
- Multiple funding sources
- Dynamic eligibility
- Multiple Auditors per appointment
- Multiple contractors per appointment
- Scheduling zones
- Travel rules
- Appointment history
- External integrations
- Detailed audit logging

---

# 2. Organization

An Organization represents an agency or other independent customer using the platform.

## Organization fields

- Organization ID
- Organization name
- Organization status
- Contact information
- Time zone
- Default scheduling settings
- Default notification settings
- Security settings
- Created date
- Updated date

One organization may contain multiple departments.

Organizations must be isolated from one another.

Users belonging to one organization must not automatically have access to another organization's data.

---

# 3. Department

A Department represents a functional department within an organization.

Examples:

- Energy Efficiency
- Weatherization
- Housing Services
- Scheduling Department

## Department fields

- Department ID
- Organization ID
- Department name
- Department status
- Department-specific settings
- Created date
- Updated date

One department may have many users, services, zones, and scheduling rules.

---

# 4. Person

Person is the generalized human record from which clients, landlords/owners, Auditors, schedulers, administrators, and other users may be associated.

The system should avoid unnecessarily duplicating personal information.

## Person fields

- Person ID
- First name
- Middle name
- Last name
- Preferred name
- Phone
- Email
- Communication preferences
- Status
- Created date
- Updated date

A person may have more than one role.

---

# 5. Client

A Client represents a person receiving or potentially receiving agency services.

Client information must be separate from the property because a client may move or be associated with multiple properties.

## Client fields

- Client ID
- Person ID
- Organization ID
- Client status
- Priority score
- Communication preferences
- External system identifiers
- Created date
- Updated date

A client may be associated with multiple properties over time.

A client may have different service eligibility at different properties.

---

# 6. Landlord / Owner

A Landlord or Owner represents a property owner or landlord.

A landlord may own or manage multiple properties.

## Landlord fields

- Landlord ID
- Person ID or organization/business reference
- Organization ID
- Mailing address
- Contact information
- Status
- External system identifiers
- Created date
- Updated date

One landlord may be associated with many properties.

A property may have multiple owners or relevant landlord relationships.

---

# 7. Property

A Property represents a physical residence/building.

The property is separate from the client.

## Property fields

- Property ID
- Organization ID
- Property name/item name
- Property address
- City
- State
- ZIP
- Location coordinates where permitted
- Property type
- Number of units
- Multi-unit indicator
- Owner/landlord relationships
- Property-level eligibility information
- Property service history
- Scheduling zone
- Geographic restrictions
- Created date
- Updated date

The property address is the geographic anchor used by the scheduling engine.

---

# 8. Property Ownership / Landlord Relationship

A separate relationship record should connect landlords/owners to properties.

## Relationship fields

- Relationship ID
- Property ID
- Landlord/Owner ID
- Relationship type
- Start date
- End date
- Primary indicator
- Mailing address
- Notes where authorized
- Created date
- Updated date

This allows the same landlord to be associated with multiple properties.

It also preserves historical ownership relationships.

---

# 9. Unit

A Unit represents an individual dwelling within a property.

Examples:

- Apartment 1
- Unit 2
- Lot 14
- Mobile home lot
- Other configured unit identifiers

A single-family property may be represented as one unit even when no unit number is displayed to the user.

## Unit fields

- Unit ID
- Property ID
- Unit identifier
- Unit type
- Current occupancy status
- Unit-level eligibility information
- Unit-level service history
- Created date
- Updated date

A property may have one or many units.

---

# 10. Occupancy History

Occupancy must be historical rather than simply overwritten.

An occupancy record connects a client to a unit for a period of time.

## Occupancy fields

- Occupancy ID
- Unit ID
- Client ID
- Start date
- End date
- Occupancy status
- Primary client indicator
- Created date
- Updated date

This allows the system to preserve historical relationships.

Example:

Property: 48 Oak Street  
Unit: 2

Client A:
2024–2026

Client B:
2026–present

The system must not lose Client A's historical relationship.

---

# 11. Service

A Service represents a service that the agency can provide.

Services must be configurable.

The application must not hard-code the initial four primary service categories.

## Service fields

- Service ID
- Organization ID
- Department ID
- Service code
- Service name
- Description
- Active/inactive status
- Standalone scheduling allowed
- Add-on service indicator
- Property-level or unit-level designation
- Default duration
- Created date
- Updated date

---

# 12. Service Combination

A Service Combination represents multiple services that may be performed during one appointment.

Examples:

- AMP + WX
- WX + ASHP
- AMP + ASHP
- Multiple add-on services

The system must distinguish between:

- Services requested
- Services scheduled
- Services actually performed

## Combination fields

- Combination ID
- Organization ID
- Name
- Description
- Included services
- Duration rule
- Active/inactive status
- Created date
- Updated date

Service combinations should not require creating a new service for every possible combination.

---

# 13. Service Eligibility

Eligibility must be represented as a dynamic relationship rather than a permanent field on the client.

An eligibility record connects a client, property, unit, service, and potentially funding source.

## Eligibility fields

- Eligibility ID
- Client ID
- Property ID
- Unit ID where applicable
- Service ID
- Eligibility status
- Eligibility reason
- Effective date
- Expiration date
- Source system
- Source record ID
- Funding relationship
- Prior service relationship
- Last evaluated date
- Created date
- Updated date

Possible statuses include:

- Eligible
- Ineligible
- Pending
- Prior work
- Ready to schedule
- Declined
- Other configurable states

Eligibility must be capable of changing over time.

---

# 14. Property-Level Eligibility

Some services are determined at the property level.

Examples may include building-level service history or property-based eligibility rules.

Property-level eligibility must be stored separately from unit-level eligibility.

The system must support rules where a property becomes eligible when a required percentage of units meet eligibility requirements.

Example:

If at least 50% of eligible units meet the required criteria, the property may qualify for a property-level service.

The actual percentage and rule must be configurable.

---

# 15. Unit-Level Eligibility

Some services are determined individually for each tenant/unit.

Each unit may therefore have a different eligibility state.

Example:

Unit 1:
AMP eligible

Unit 2:
AMP prior work

Unit 3:
AMP eligible

Unit 4:
AMP declined

The system must support these differences without creating duplicate property records.

---

# 16. Funding Source

A Funding Source represents a source of funding that may contribute to a service.

Examples may include:

- Electric utility funding
- Natural gas funding
- Other utility funding
- Government funding
- Agency funding
- Other configurable funding sources

## Funding Source fields

- Funding Source ID
- Organization ID
- Name
- Type
- Active/inactive status
- Geographic applicability
- Program rules
- Created date
- Updated date

A client/property/unit may have access to multiple funding sources.

---

# 17. Funding Availability

Funding Availability represents the funding currently available for a client/property/unit/service combination.

This is different from the Funding Source itself.

## Funding Availability fields

- Funding Availability ID
- Client ID
- Property ID
- Unit ID where applicable
- Service ID
- Funding Source ID
- Availability status
- Effective date
- Expiration date
- Source system
- Source record
- Created date
- Updated date

Multiple funding sources may apply simultaneously.

The Auditor may ultimately determine how available funding is used according to agency procedures.

---

# 18. Prior Service History

Prior service/work history must be associated with the appropriate location and service.

The system must not assume that a service performed for a client at one residence was performed at every residence associated with that client.

## Prior Service fields

- Prior Service ID
- Client ID
- Property ID
- Unit ID where applicable
- Service ID
- Service date
- Job number
- Source system
- Source record
- Documentation reference
- Applicable restriction period
- Created date
- Updated date

This supports rules such as:

- Service completed within the previous 5 years
- Building work completed within the previous 15 years
- Other configurable service-specific restrictions

---

# 19. Zone

A Zone represents a geographic scheduling area.

## Zone fields

- Zone ID
- Organization ID
- Name
- Description
- Geographic boundaries
- Included municipalities/areas
- Adjacent zones
- Travel rules
- Active/inactive status
- Created date
- Updated date

A property may be assigned to one primary scheduling zone.

---

# 20. Auditor

An Auditor represents a staff member qualified to perform one or more services.

Auditors are users but require additional scheduling-specific information.

## Auditor fields

- Auditor ID
- User ID
- Department ID
- Employment/status
- Qualifications
- Zones
- Geographic restrictions
- Availability rules
- Calendar
- Active/inactive status
- Created date
- Updated date

An Auditor may perform multiple services.

---

# 21. Auditor Service Qualification

A separate relationship should connect Auditors to Services.

## Fields

- Auditor qualification ID
- Auditor ID
- Service ID
- Qualification status
- Effective date
- Expiration date
- Restrictions
- Created date
- Updated date

This allows the system to determine whether an Auditor can perform a particular service.

---

# 22. Auditor Zone Assignment

Auditors may be assigned to specific zones.

The assignment may vary by day.

## Fields

- Assignment ID
- Auditor ID
- Zone ID
- Day of week
- Start time
- End time
- Maximum travel distance
- Geographic restrictions
- Effective date
- Expiration date
- Created date
- Updated date

An Auditor may work in different zones on different days.

---

# 23. Contractor

A Contractor represents an external contractor who may participate in service delivery.

Contractors may be:

- Preselected
- Selected after assessment
- Assigned to a particular service
- Assigned to multiple services

## Contractor fields

- Contractor ID
- Organization ID
- Name
- Contact information
- Service qualifications
- Zone assignments
- Availability
- Geographic restrictions
- Active/inactive status
- Created date
- Updated date

---

# 24. Contractor Availability

Contractors may have recurring or specific availability.

Examples:

- Tuesdays in Zone A
- Thursdays in Zone B
- 8:00 AM–12:00 PM
- Specific service restrictions

Availability must be configurable.

---

# 25. Calendar

The application should maintain internal calendars for scheduling resources.

A calendar may belong to:

- Auditor
- Contractor
- Department
- Other schedulable resource

## Calendar fields

- Calendar ID
- Owner/resource ID
- Calendar type
- Time zone
- Availability rules
- External calendar connection
- Active/inactive status

The internal calendar is the primary scheduling source.

External Outlook calendars may synchronize with the internal calendar.

---

# 26. Availability Block

An Availability Block represents time during which a resource cannot or should not be scheduled.

Examples:

- Vacation
- Meeting
- Training
- Personal appointment
- Administrative time
- Existing external calendar event
- Temporary block

## Fields

- Block ID
- Resource ID
- Start date/time
- End date/time
- Recurrence
- Reason/category
- Source
- Created date
- Updated date

---

# 27. Travel Rule

Travel rules determine whether an Auditor can reasonably move between appointments.

## Fields

- Travel Rule ID
- Organization ID
- Zone relationship
- Minimum buffer
- Maximum travel time
- Maximum travel distance
- Adjacent-zone allowance
- Border-town allowance
- Other geographic rules
- Active/inactive status

Travel calculations may use appointment locations and estimated travel times.

---

# 28. Appointment

An Appointment represents a scheduled visit.

This is one of the central entities of the application.

## Appointment fields

- Appointment ID
- Organization ID
- Department ID
- Client ID
- Property ID
- Zone ID
- Start date/time
- End date/time
- Duration
- Appointment status
- Scheduler ID
- Client scheduling indicator
- Internal notes
- Cancellation/reschedule information
- Created date
- Updated date

---

# 29. Appointment Units

An appointment may involve:

- An entire property
- One unit
- Multiple selected units

Therefore units should be associated with an appointment through a separate relationship.

## Fields

- Appointment Unit ID
- Appointment ID
- Unit ID
- Selection type
- Created date

This allows a single appointment to contain selected units without forcing all units at a property into the appointment.

---

# 30. Appointment Services

An appointment may include one or more services.

Services must be associated with an appointment separately from the appointment itself.

## Fields

- Appointment Service ID
- Appointment ID
- Service ID
- Service status
- Requested indicator
- Scheduled indicator
- Duration contribution
- Funding source(s)
- Created date
- Updated date

This allows:

Appointment:
48 Oak Street, Units 1–3

Services:
- WX
- AMP
- ASHP

without creating a new appointment for every service.

---

# 31. Appointment Auditors

An appointment may have one or more Auditors.

## Fields

- Appointment Auditor ID
- Appointment ID
- Auditor ID
- Role
- Assignment status
- Created date
- Updated date

The scheduling engine must ensure that every assigned Auditor is qualified and available.

---

# 32. Appointment Contractors

An appointment may have one or more Contractors.

## Fields

- Appointment Contractor ID
- Appointment ID
- Contractor ID
- Role
- Assignment status
- Created date
- Updated date

---

# 33. Appointment Hold

An Appointment Hold temporarily reserves scheduling resources while a Scheduler is working on an appointment.

## Hold fields

- Hold ID
- Client ID
- Property ID
- Zone ID
- Scheduler ID
- Potential start time
- Potential end time
- Held Auditor(s)
- Held Contractor(s)
- Created date/time
- Expiration date/time
- Hold status

Holds must automatically expire.

A Scheduler may release a hold.

Authorized managers may release abandoned holds.

---

# 34. Appointment History

Appointment changes must not simply overwrite the previous state.

The system must maintain appointment history.

## History fields

- Appointment History ID
- Appointment ID
- Event type
- Previous value
- New value
- User ID
- Source
- Date/time
- Notes

Examples:

- Scheduled
- Rescheduled
- Cancelled
- Auditor reassigned
- Contractor added
- Service added
- Service removed
- Client no-show
- Running late
- Appointment completed

---

# 35. Communication

Communications represent messages sent or received in relation to clients or appointments.

## Communication fields

- Communication ID
- Client ID
- Appointment ID where applicable
- Communication type
- Direction
- Recipient
- Sender
- Message template
- Delivery status
- Sent date/time
- Provider message ID
- Error information
- Created date

Communication types may include:

- Email
- SMS
- Push notification
- System notification
- Voice/telephone event

Sensitive information should be minimized.

---

# 36. Scheduling Link

A Scheduling Link represents a secure client-facing scheduling invitation.

## Fields

- Scheduling Link ID
- Client ID
- Property ID
- Appointment/service context
- Token/reference
- Created date
- Expiration date
- Status
- Allowed actions
- Last used date
- Created by

Links must be securely generated.

Links should be revocable.

Expired or revoked links must no longer permit scheduling activity.

---

# 37. Auditor Field Alert

A Field Alert represents a quick action initiated by an Auditor.

Examples:

- On My Way
- Running Late
- Cannot Attend
- Need Scheduler

## Fields

- Alert ID
- Auditor ID
- Appointment ID
- Alert type
- Status
- Delay information where applicable
- Reason where applicable
- Created date/time
- Acknowledged date/time
- Resolved date/time
- Scheduler handling record

---

# 38. Client Service Interest

An Auditor may indicate that a client is interested in an additional eligible service.

This does not automatically schedule the service.

## Fields

- Interest ID
- Client ID
- Property ID
- Unit ID where applicable
- Service ID
- Appointment ID
- Interest status
- Auditor ID
- Date/time
- Scheduler notification status
- Notes

Possible statuses:

- Interested
- Declined
- Needs scheduler follow-up
- Scheduled
- No longer interested

---

# 39. External Integration

An Integration represents a connection to an external system.

Examples:

- Monday.com
- Microsoft Outlook
- SMS provider
- Email provider
- Mapping/travel provider
- Future systems

## Integration fields

- Integration ID
- Organization ID
- Provider
- Integration type
- Connection status
- Credentials reference
- Configuration
- Last successful synchronization
- Last attempted synchronization
- Error status
- Created date
- Updated date

Credentials must never be stored as ordinary application data.

---

# 40. External Record Mapping

External Record Mapping connects an internal entity to an external system record.

This is essential for Monday.com integration.

## Fields

- Mapping ID
- Integration ID
- Internal entity type
- Internal entity ID
- External system
- External board/account/container
- External record ID
- Mapping status
- Last synchronized date/time
- Created date
- Updated date

This allows the same application to connect to multiple Monday boards.

---

# 41. External Field Mapping

External Field Mapping defines how an internal field corresponds to an external field.

Examples:

Internal:
`appointment.start_time`

Monday:
`AMP assessment date`

Internal:
`appointment.auditor`

Monday:
`AMP auditor`

Internal:
`service.job_number`

Monday:
`AMP job number`

## Fields

- Field Mapping ID
- Integration ID
- Board/container ID
- Internal entity
- Internal field
- External field
- Direction
- Transformation rule
- Active/inactive status
- Created date
- Updated date

Supported synchronization directions:

- External → Internal
- Internal → External
- Bidirectional

---

# 42. Synchronization Event

A Synchronization Event records an integration attempt.

## Fields

- Sync Event ID
- Integration ID
- Entity type
- Entity ID
- Direction
- Event type
- Started date/time
- Completed date/time
- Status
- Error message
- Retry count
- External reference

The system must not silently discard failed synchronization events.

---

# 43. Job Number

Job numbers are associated with individual services rather than only the client or property.

## Fields

- Job Number ID
- Client ID
- Property ID
- Unit ID where applicable
- Service ID
- Job number
- Job number type
- External system reference
- Status
- Created date
- Updated date

Job numbers may be:

- Numeric
- Alphanumeric
- Custom formatted

A bundled appointment containing three services may therefore have three separate job numbers.

---

# 44. User

A User represents an authenticated person with access to the application.

## User fields

- User ID
- Person ID
- Organization ID
- Department ID
- Username/login
- Authentication provider
- Status
- Last login
- Created date
- Updated date

---

# 45. Role

A Role defines a set of permissions.

Examples:

- Scheduler
- Auditor
- Contractor
- Department Manager
- Organization Administrator
- IT Administrator
- System Administrator

---

# 46. Permission

Permissions define individual capabilities.

Examples:

- View client
- Edit client
- View appointment
- Create appointment
- Modify appointment
- Cancel appointment
- View eligibility
- Modify eligibility
- Manage Auditors
- Manage Contractors
- Manage integrations
- View audit logs
- Manage organization settings

Permissions must be assigned through roles or approved administrative mechanisms.

---

# 47. Audit Log

The Audit Log records significant actions throughout the application.

## Audit Log fields

- Audit Log ID
- Organization ID
- User ID
- Action type
- Entity type
- Entity ID
- Previous value
- New value
- Source
- IP/device information where permitted
- Date/time
- Result
- Additional metadata

Examples:

- Client created
- Client updated
- Appointment created
- Appointment cancelled
- Auditor assigned
- Service changed
- Eligibility synchronized
- Monday record updated
- Notification sent
- Permission changed
- Integration failed

Audit records should be protected from ordinary modification or deletion.

---

# 48. Notification

A Notification represents an alert intended for an internal user.

## Fields

- Notification ID
- Recipient User ID
- Notification type
- Priority
- Related entity
- Message
- Status
- Created date/time
- Read date/time
- Resolved date/time

Examples:

- Auditor running late
- Auditor cancelled
- Client reschedule request
- Client cancellation
- Sync failure
- Scheduler assistance requested

---

# 49. Scheduling Queue Record

The scheduling queue represents work currently requiring scheduler attention.

## Fields

- Queue Record ID
- Client ID
- Property ID
- Zone ID
- Priority score
- Date entered scheduling queue
- Services requiring scheduling
- Queue status
- Assigned scheduler
- Scheduler lock
- Created date
- Updated date

The queue should support sorting by:

1. Priority score
2. Time waiting
3. Landlord last name for multi-unit properties

---

# 50. Scheduler Zone Lock

A Scheduler Zone Lock prevents multiple schedulers from simultaneously working on the same scheduling pool.

## Fields

- Lock ID
- Zone ID
- Scheduler ID
- Start date/time
- Expiration date/time
- Status

Locks must automatically expire.

---

# 51. Relationship Summary

The major relationships are:

```text
Organization
    │
    ├── Departments
    │
    ├── Users
    │
    ├── Clients
    │     │
    │     └── Property Relationships
    │
    ├── Properties
    │     │
    │     ├── Units
    │     │     └── Occupancy History
    │     │
    │     └── Landlord/Owner Relationships
    │
    ├── Services
    │     └── Service Combinations
    │
    ├── Funding Sources
    │
    ├── Zones
    │
    ├── Auditors
    │     ├── Service Qualifications
    │     └── Zone Assignments
    │
    ├── Contractors
    │     ├── Service Qualifications
    │     └── Zone Assignments
    │
    ├── Calendars
    │     └── Availability Blocks
    │
    ├── Appointments
    │     ├── Appointment Units
    │     ├── Appointment Services
    │     ├── Appointment Auditors
    │     ├── Appointment Contractors
    │     └── Appointment History
    │
    ├── Eligibility
    ├── Prior Service History
    ├── Communications
    ├── Scheduling Links
    ├── Notifications
    ├── Audit Logs
    │
    └── Integrations
          ├── External Record Mappings
          ├── External Field Mappings
          └── Synchronization Events
