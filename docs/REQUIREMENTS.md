# Agency Scheduling Platform
## Master Requirements — V1 Planning Document

**Status:** Draft  
**Purpose:** Master functional and technical blueprint for the scheduling platform.

---

# 1. Purpose

The application is a scheduling platform designed initially for a nonprofit agency's service departments.

The system must allow agency staff to schedule clients for one or more services while considering:

- Client eligibility
- Available services
- Property and unit eligibility
- Scheduling zones
- Auditor qualifications
- Auditor availability
- Contractor availability
- Service-specific appointment duration
- Funder-specific service duration
- Travel time
- Geographic compatibility
- Existing appointments
- Blocked/unavailable time
- Client scheduling preferences
- Multiple schedulers working simultaneously

The system must also support client self-scheduling through secure links.

The application must be capable of operating independently or integrating with external systems such as Monday.com.

---

# 2. Core Design Principle

The application separates:

## Program/Job Management

Primarily managed by external systems such as Monday.com.

Examples:

- Eligibility
- Funding
- Job status
- Assessment status
- Prior work
- Job numbers
- Service decisions
- Work performed
- Payment/job workflow
- Program documentation

## Appointment Management

Managed by the scheduling platform.

Examples:

- Appointment date and time
- Appointment duration
- Assigned Auditor
- Assigned Contractor
- Selected services
- Selected units
- Travel/buffer requirements
- Client scheduling
- Rescheduling
- Cancellation
- Appointment notifications
- Scheduler workflow

External systems and the scheduling platform must be able to exchange information in both directions.

---

# 3. Initial Users

The system must support:

- Schedulers
- Auditors
- Contractors
- Department managers
- System administrators
- Agency administrators
- IT administrators
- Clients

Different users must have different permissions.

Auditors must not be able to schedule appointments.

Auditors may communicate scheduling-related information to schedulers, including:

- Running late
- Unable to attend
- On the way
- Need scheduler assistance
- Client interested in additional services
- Client declined additional services

---

# 4. Services

The system must support at least 12 configurable services.

The initial agency scheduling workflow primarily handles four main service categories.

Additional services may be offered alongside those services and may occasionally be scheduled independently.

Services must be configurable rather than hard-coded.

Each service may have:

- Eligibility rules
- Duration
- Funder-specific duration
- Required Auditor qualifications
- Required Contractor qualifications
- Property-level eligibility
- Unit-level eligibility
- Combination rules
- Scheduling restrictions
- Geographic restrictions

---

# 5. Dynamic Service Availability

Service availability is dynamic.

The system must never assume that a client has a permanently fixed list of services.

Instead, it must determine what is currently schedulable based on the latest available information.

A service may be:

- Eligible
- Ineligible
- Requested
- Not requested
- Ready to schedule
- Scheduling
- Scheduled
- Assessment complete
- Declined
- Prior work
- In progress
- Completed
- Other configurable program statuses

External systems may update these states.

The scheduling platform must synchronize changes and recalculate available scheduling options.

The interface should display the most recent synchronization time.

---

# 6. Funding

Available funding may consist of one or more funding sources.

The intake system determines available funding.

The Auditor determines how available funding is ultimately used and in what combination when appropriate.

Funding availability may affect eligibility and available services.

The scheduling system must be able to display relevant available funding information to authorized staff without becoming the authoritative funding system when an external system is connected.

---

# 7. Multi-Unit Properties

The system must support:

- Single-family properties
- Single-unit properties
- Multi-unit properties
- Apartments
- Units
- Mobile home lots
- Selected units within a property

Each unit must be independently schedulable when appropriate.

A scheduler must be able to choose:

- Entire property
- Single unit
- Multiple selected units

The remaining units must not automatically be included.

The system must retain the relationship between:

**Property → Units → Clients → Services → Appointments**

Multi-unit eligibility may differ between units.

The system must support property-level eligibility rules, including situations where a required percentage of eligible units makes a property eligible.

The application must support service-specific eligibility restrictions.

---

# 8. Service Duration

The system must calculate appointment duration automatically.

Duration may depend on:

- Service
- Combination of services
- Number of selected units
- Property type
- Funder
- Funder-specific requirements
- Other configurable rules

Administrators must be able to change duration rules without rebuilding the application.

Example:

Service A = 90 minutes

Service B = 60 minutes

Combined A+B = 120 minutes

A particular funder may require:

A+B = 150 minutes

The system must use the applicable rule automatically.

---

# 9. Scheduling Zones

Clients must not enter the active scheduling database until they have been assigned to an appropriate scheduling zone.

Zones are based primarily on geographic location.

Each zone may have:

- Assigned Auditors
- Assigned Contractors
- Preferred days
- Travel restrictions
- Geographic boundaries
- Maximum travel distance outside the zone
- Border/adjacent-zone rules

Auditors may work in multiple zones.

An Auditor may be restricted to particular zones on particular days.

Contractors may have similar geographic and scheduling restrictions.

---

# 10. Geographic Scheduling

The system must consider geographic compatibility when presenting available appointments.

It must consider:

- Appointment location
- Previous appointment location
- Next appointment location
- Estimated travel time
- Configured travel buffer
- Zone boundaries
- Adjacent/border communities
- Auditor geographic restrictions

An Auditor should not be presented as available when the travel time between appointments is unreasonable.

Auditors may work different zones on the same day when travel between locations is reasonable.

---

# 11. Auditors

Auditors must have configurable:

- Service qualifications
- Availability
- Work days
- Work hours
- Zones
- Geographic restrictions
- Blocked time
- Vacation/unavailable periods
- Contractor relationships where applicable

One Auditor may perform multiple services.

Another Auditor may perform only one service.

The scheduling engine must only present an Auditor when that Auditor is qualified and available for the requested appointment.

Multiple Auditors may be assigned to one appointment when required.

---

# 12. Contractors

The system must support contractors who may:

- Be selected before an assessment
- Be selected after an assessment
- Attend an assessment
- Perform work after assessment

Contractors may have:

- Specific days
- Specific times
- Specific zones
- Specific geographic restrictions
- Recurring weekly availability

Multiple contractors may be associated with an appointment/job when required.

---

# 13. Calendars

The scheduling platform should maintain its own internal calendar system.

Individual Auditor calendars should be managed primarily within the scheduling platform.

The system should support integration with external calendars, including Outlook.

External calendar integrations should preferably receive/synchronize appointments from the scheduling platform rather than making external calendars the primary scheduling database.

The system must account for:

- Existing appointments
- Blocked time
- Travel
- Service duration
- Auditor qualification
- Zone restrictions

---

# 14. Central Availability Engine

Schedulers should see a central availability system rather than having to manually inspect individual Auditor calendars.

For a selected client/property and service combination, the system should determine:

- Available dates
- Available times
- Qualified Auditors
- Qualified Contractors
- Appointment duration
- Travel feasibility
- Zone compatibility

When an Auditor is assigned to an appointment, that Auditor must no longer appear as available for conflicting appointments.

The Auditor may remain available for another appointment if the geographic and travel requirements permit it.

---

# 15. Client Self-Scheduling

Schedulers may send a secure scheduling link to a client by:

- Email
- Text message

The client should only see:

- Services they are eligible/requested for
- Appropriate property/unit options
- Appropriate dates
- Appropriate times
- Appointments compatible with zone and staffing rules

The client should not see internal program information unnecessarily.

The system may automatically assign an appropriate Auditor when the client self-schedules.

Clients must be able to:

- Schedule
- Reschedule
- Cancel

using the original secure scheduling link where appropriate.

Clients may optionally provide:

- Cancellation reason
- Rescheduling reason
- Additional information

Client actions must generate appropriate staff notifications and audit events.

---

# 16. Scheduler Booking

Schedulers may schedule clients:

- By phone
- Using the client self-scheduling workflow
- Directly within the application

When scheduling by phone, the scheduler does not need to send a digital invitation.

A confirmation may be sent if requested by the client.

Schedulers must be able to select:

- Property
- Selected units
- Services
- Date
- Time
- Auditor
- Contractor where applicable

The system must calculate the appointment duration automatically.

---

# 17. Appointment Holds

When a scheduler begins actively working on an appointment, the system should place a temporary hold on the relevant scheduling resources.

A hold may include:

- Client
- Property/unit
- Zone
- Potential appointment time
- Auditor
- Contractor

The hold must automatically expire if abandoned.

Schedulers must be able to cancel the hold.

Authorized managers must be able to release abandoned holds.

---

# 18. Scheduler Zone Locks

Schedulers may temporarily lock a zone while actively scheduling clients in that zone.

Other schedulers should see that the zone is currently being worked.

They should not receive the same active scheduling candidates within that zone while the lock is active.

The lock should:

- Identify the scheduler
- Record start time
- Automatically expire
- Be manually released
- Be transferable/releasable by authorized managers

The system must continue protecting against appointment conflicts even when multiple schedulers are working simultaneously.

---

# 19. Scheduling Queue

The scheduler queue should be sortable/filterable by:

1. Priority score
2. Time waiting for services
3. Landlord last name for multi-unit properties

The scheduling system should preserve relevant priority information received from the agency's source system.

---

# 20. Appointment Status

Appointments should support configurable states including:

- Held
- Scheduled
- Confirmed
- Reschedule requested
- Cancelled
- Needs rescheduling
- Client no-show
- Auditor running late
- Auditor unable to attend
- Completed

The system must retain appointment history.

---

# 21. No-Show Workflow

Client no-shows may be recorded as:

**Needs Rescheduling**

with a note indicating:

**Client No-Show**

The agency may attempt to reschedule up to three times.

The system should track attempts.

After the configured number of unsuccessful attempts, the client/service may be marked declined according to agency policy.

The client may become active again if they later contact the agency and are ready.

---

# 22. Completing Scheduling

A client/property must remain in the active scheduling system while any relevant service still requires scheduling or follow-up.

Schedulers must not manually remove clients simply because they believe scheduling is finished.

The system should hide/archive a client from active scheduling only when the applicable services have reached appropriate terminal states, such as:

- Assessment complete
- Declined
- Other configured completed/terminal status

This determination may come from Monday.com or another integrated system.

If an Auditor updates the status in Monday.com, the scheduling platform must eventually reflect the change.

If the Auditor updates the status through the scheduling platform, the change must synchronize to the appropriate external system.

A newly eligible/requested service may reactivate a previously hidden client.

---

# 23. Auditor Mobile Application

Auditors must have mobile access through supported Apple and Android devices.

The Auditor interface should provide:

- Today's schedule
- Appointment details
- Directions/access information where authorized
- Services scheduled
- Selected units where appropriate
- Eligible additional services
- Client interest/decline options
- Scheduling alerts
- On My Way
- Running Late
- Cannot Attend
- Need Scheduler

Auditors must not be able to create or book appointments.

---

# 24. Offline Operation

Auditors must be able to access their essential daily schedule when cellular or Wi-Fi service is unavailable.

The system should cache necessary information securely.

Actions performed offline should be queued and synchronized when connectivity returns.

The system must clearly indicate synchronization status.

Sensitive information should not be stored offline unnecessarily.

---

# 25. Auditor Field Alert

The system should provide a very simple quick-access Field Alert interface.

Primary actions:

- ON MY WAY
- I'M RUNNING LATE
- I CAN'T ATTEND
- NEED SCHEDULER

The interface should require minimal interaction.

The same functions must also exist in the full Auditor application.

---

# 26. Voice and Driving Mode

Hands-free voice interaction is optional.

The system should use device-native voice capabilities where practical.

Driving Mode should provide voice commands for:

- On My Way
- Running Late
- Cannot Attend
- Need Scheduler

Consequential actions require confirmation.

Driving Mode should not provide general application navigation.

Voice mode must minimize client information.

When asking for next appointment information, voice mode may provide:

- Appointment time
- Address
- Unit designation when appropriate
- Scheduled service(s)

It must not provide:

- Client name
- Phone number
- Eligibility information
- Funding information
- Landlord information
- Sensitive notes
- Other unnecessary client information

For a multi-unit property, voice mode should not identify the individual tenant/unit unless specifically permitted by future agency configuration.

---

# 27. Auditor Alerts

Auditor alerts must notify schedulers when an Auditor:

- Is running late
- Cannot attend
- Needs scheduler assistance
- Reports another scheduling issue

Alerts should support:

- New
- Acknowledged
- Resolved

All alerts must be logged.

---

# 28. Client Notifications

The system should support:

- Email
- SMS/text
- Secure scheduling links
- Appointment confirmations
- Rescheduling confirmations
- Cancellation confirmations
- Configurable late/cancellation notifications

Notification content must be configurable and privacy-conscious.

---

# 29. Monday.com Integration

The scheduling platform must support two-way integration with Monday.com.

It must eventually support:

- Multiple Monday boards
- Multiple departments
- Multiple workflows
- Status updates
- Date updates
- Mirror columns
- Job numbers
- Multiple services on one item
- Multiple job numbers on one item
- Custom alphanumeric job numbers
- Two-way synchronization
- Configurable automation rules

A single Monday item may represent a client/property while containing multiple services without requiring subitems.

The scheduling system must support separate job numbers for each service.

---

# 30. Monday Central Vetting Integration

The initial agency implementation will integrate with the **Central Vetting** board.

Relevant information includes:

- Client first name
- Client last name
- Client phone
- Client email
- Property address
- Item/property name
- Landlord/owner information
- Landlord mailing address
- Electric utility provider
- Gas provider
- Available funding
- AMP job status
- WX job status
- ASHP job status
- HS job status
- HS priority
- Priority score
- Assessment dates
- Auditors
- Job numbers

The scheduling system must use the appropriate synchronized fields without duplicating unnecessary program data.

---

# 31. Dynamic Synchronization

External changes must be reflected in the scheduling system.

Examples:

Monday changes:

**Ready to Schedule → Scheduling**

The scheduling system reflects the new state.

Monday changes:

**Ready to Schedule → Prior Work**

The scheduling system removes the affected service from scheduling.

Monday changes:

**Eligible → Ineligible**

The scheduling system updates available services.

Scheduling system creates an appointment:

**Appointment information → Monday**

The appropriate Monday fields are updated.

Synchronization must support configurable mapping rather than hard-coding every Monday column.

---

# 32. Audit Log

The application must maintain a detailed audit log.

The log should record:

- Who performed an action
- Date/time
- Action
- Previous value
- New value
- Source system
- Appointment/client/property reference where appropriate
- Synchronization events
- Notifications
- Errors
- Administrative changes

Audit logs should be protected from ordinary users.

Authorized administrators should be able to search and review them.

---

# 33. Security

The application must be designed for nonprofit agency IT/security review.

Requirements should include:

- Role-based permissions
- Least-privilege access
- Secure authentication
- Encrypted connections
- Encryption of sensitive stored data
- Secure client scheduling links
- Expiring/invalidatable scheduling links
- Audit logging
- Administrative controls
- Integration credential protection
- Separation of organizations/departments
- Secure offline storage
- Configurable retention policies
- No unnecessary client information in notifications

---

# 34. Standalone Mode

The application must eventually operate without Monday.com.

Organizations without an external platform should be able to:

- Create clients
- Create properties
- Create units
- Define services
- Define eligibility
- Define zones
- Define Auditors
- Define contractors
- Manage calendars
- Schedule clients
- Send client links
- Manage appointments
- View reports
- Maintain audit history

The external integration layer should therefore be optional.

---

# 35. Multi-Organization Architecture

The eventual product should support multiple agencies or departments.

Each organization should have isolated:

- Clients
- Properties
- Users
- Services
- Zones
- Funding rules
- Scheduling rules
- Integrations
- Calendars
- Audit logs

Organization administrators should be able to manage their own configuration.

System/IT administrators should have appropriately restricted technical administration rights.

---

# 36. Reporting

The system should eventually support reporting on:

- Appointments
- Scheduling volume
- No-shows
- Cancellations
- Rescheduling
- Auditor utilization
- Travel
- Zones
- Service demand
- Scheduling wait time
- Client self-scheduling
- Scheduler activity
- Notification activity
- Integration status
- System errors

Charts and graphs are planned but are not required for the first functional prototype.

---

# 37. Design Philosophy

The application should prioritize:

1. Reliability
2. Security
3. Simple scheduler workflow
4. Minimal unnecessary data entry
5. Dynamic scheduling
6. Geographic efficiency
7. Mobile usability
8. Accessibility
9. Clear auditability
10. Integration flexibility
11. Configurability
12. Future standalone commercialization

The system should avoid duplicating business processes already handled effectively by external systems.

---

# 38. Development Strategy

The interface and scheduling engine should be designed as separate components.

The core scheduling engine should be capable of operating independently of:

- Monday.com
- Outlook
- SMS provider
- Email provider
- Mobile application interface

Integrations should communicate with the core engine through defined APIs.

This will allow the application to eventually become a standalone product.

---

# 39. Initial Development Priority

The first working prototype should focus on:

1. Users and permissions
2. Clients
3. Properties
4. Units
5. Services
6. Auditors
7. Auditor availability
8. Zones
9. Appointment duration rules
10. Scheduling engine
11. Appointment holds
12. Scheduler interface
13. Appointment creation
14. Basic audit log

External integrations should be added after the core scheduling engine is functioning reliably.

---

# 40. Future Development

Potential future features include:

- Advanced analytics
- Automated optimization of Auditor routes
- ETA calculations
- Native Android application
- Native iOS application
- Native desktop application
- Advanced voice interaction
- Additional external integrations
- White-label agency deployments
- Commercial licensing
- Multi-agency SaaS deployment
