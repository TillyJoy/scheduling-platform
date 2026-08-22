# Scheduling Engine — V1

## Purpose

The Scheduling Engine determines which appointments can be offered to clients and schedulers based on eligibility, services, property/unit selection, Auditor qualifications, geographic zones, availability, travel requirements, contractors, and scheduling rules.

The Scheduling Engine must operate independently of Monday.com.

Monday.com may provide eligibility and service information, but the scheduling engine must be capable of operating without Monday.com for organizations that use the application as their primary system.

---

# 1. Scheduling Entry Requirements

A client/property must not enter the active scheduling queue until the organization has determined that the client/property is ready for scheduling.

For organizations using Monday.com, this may occur when the appropriate external status and connection rules indicate that scheduling may begin.

For organizations without Monday.com, an authorized user may manually move the client/property into scheduling.

Once admitted to scheduling, the system assigns the property to an appropriate scheduling zone.

---

# 2. Scheduling Zone

Every actively schedulable property must have a scheduling zone.

A zone may be based on:

- Municipality
- Geographic boundary
- ZIP code
- Custom geographic area
- Organization-defined routing area

The zone determines which Auditors and Contractors may normally be offered.

Adjacent zones may be configured as compatible when travel distance and time are reasonable.

---

# 3. Property vs. Unit Scheduling

The Scheduler must be able to choose:

- Schedule entire property
- Schedule selected units only
- Schedule a single unit

The selection must be recorded on the appointment.

If only selected units are being scheduled, other eligible units must remain available for future scheduling.

The system must not assume that scheduling one unit means the entire property has been scheduled.

---

# 4. Dynamic Service Availability

The Scheduler interface must display only services that are currently eligible and available for the selected client/property/unit.

Service availability may depend on:

- Client eligibility
- Unit eligibility
- Property eligibility
- Property service history
- Prior work restrictions
- Funding availability
- Service-specific rules
- Geographic rules
- Organization configuration
- Funder requirements

Eligibility must be evaluated dynamically.

---

# 5. Four Primary Scheduling Categories

The organization may define primary scheduling categories.

The initial implementation is expected to support four primary categories:

- AMP
- WX
- ASHP
- HS

These must remain configurable rather than permanently hard-coded.

Other services may exist as add-on services.

---

# 6. Add-On Services

An add-on service may be:

- Offered with a primary service
- Added after the initial scheduling process
- Available only under certain eligibility/funding conditions
- Occasionally scheduled independently

The Scheduler should see eligible add-on services when applicable.

An add-on service may increase the appointment duration.

---

# 7. Service Combinations

Multiple services may be scheduled during one appointment.

Example:

AMP + ASHP

or:

WX + AMP + Add-on Service

The system must calculate the total appointment duration from the configured service requirements.

The system must avoid double-counting time where services share assessment activities.

---

# 8. Funder-Specific Duration Rules

The same service may require different amounts of assessment time depending on the funding source.

Example:

Service:
AMP

Funder A:
90 minutes

Funder B:
105 minutes

Funder C:
120 minutes

The Scheduling Engine must select the appropriate duration based on the applicable funding rules.

Duration rules must be configurable without changing application code.

Authorized administrators must be able to modify duration rules.

Changes must be recorded in the Audit Log.

---

# 9. Service Combination Duration

Each combination of services may have a configurable duration rule.

The engine should support:

- Base service duration
- Additional service duration
- Shared-task reductions
- Funder-specific adjustments
- Property-size adjustments
- Unit-count adjustments
- Other configurable modifiers

The calculation must produce a final appointment duration before available times are presented.

---

# 10. Auditor Qualification

An Auditor may perform one or more services.

The system must verify that an Auditor is qualified for every service assigned to an appointment.

If an Auditor cannot perform one of the requested services, that Auditor must not be presented as a valid option for that appointment.

---

# 11. Auditor Availability

An Auditor's availability is determined by:

- Working schedule
- Service qualifications
- Zone assignments
- Geographic restrictions
- Existing appointments
- Availability blocks
- Travel time
- Organization rules

The system must calculate actual available appointment windows rather than simply displaying open calendar time.

---

# 12. Auditor Zone Restrictions

An Auditor may be assigned to:

- One zone
- Multiple zones
- Specific days in specific zones
- A primary zone plus nearby zones
- A zone with a maximum travel distance outside it

These rules must be configurable.

---

# 13. Auditor Geographic Routing

An Auditor may work in different zones during the same day when travel is reasonable.

The system should consider:

- Appointment addresses
- Geographic distance
- Estimated driving time
- Configured travel buffer
- Adjacent zones
- Border communities

The system should prevent scheduling combinations that would require unreasonable travel.

---

# 14. Travel Buffer

A configurable travel buffer must be added between appointments.

The buffer may depend on:

- Distance
- Estimated travel time
- Zone relationship
- Organization policy
- Auditor-specific rules

Example:

Appointment ends at 10:00 AM.

Travel calculation:
25 minutes.

Required buffer:
10 minutes.

Next appointment cannot begin before 10:35 AM.

---

# 15. Multiple Auditors

An appointment may have more than one Auditor.

The system must verify availability for all assigned Auditors.

A Scheduler may assign multiple Auditors when required by the service or appointment.

---

# 16. Contractor Scheduling

Contractors may be:

- Preselected before an appointment
- Selected after an assessment
- Assigned to specific services
- Assigned to specific zones
- Assigned to recurring days
- Assigned to specific time windows

Contractor availability must be considered when the appointment requires the Contractor to attend.

---

# 17. Preselected Contractor

If a Contractor is required to attend the assessment and is already selected, the Scheduling Engine must include that Contractor's availability when determining valid appointment times.

If the Contractor is not required to attend the assessment, the appointment may be scheduled without their availability.

---

# 18. Post-Assessment Contractor

If the Auditor selects a Contractor after the assessment, the Contractor does not necessarily participate in the assessment appointment.

The system must allow the Contractor to be assigned later.

---

# 19. Central Availability

The Scheduler should see a central availability view.

For a selected:

- Client
- Property/unit selection
- Service combination
- Zone

the system should display available appointment times.

For each available time, the Scheduler may see which qualified Auditors are available.

---

# 20. Auditor Assignment During Scheduling

When a Scheduler selects an available time and Auditor:

1. The system creates a temporary hold.
2. The selected Auditor becomes unavailable to other schedulers for that time.
3. The Scheduler completes the appointment.
4. If confirmed, the hold becomes an appointment.
5. If cancelled, the hold is released.
6. If abandoned, the hold automatically expires.

---

# 21. Scheduler Holds

A Scheduler may place a temporary hold while speaking with a client.

A hold must include:

- Scheduler
- Client
- Property
- Units
- Services
- Potential appointment time
- Potential Auditor
- Expiration time

Holds must automatically expire after a configurable period.

---

# 22. Multiple Scheduler Protection

Multiple Schedulers may work simultaneously.

The system must prevent two Schedulers from booking the same Auditor/time combination.

The system should also allow a Scheduler to temporarily reserve a scheduling record while working with a client.

A Scheduler working in one zone should not unnecessarily prevent another Scheduler from working in another zone.

---

# 23. Scheduler Queue

Clients/properties in the scheduling queue should be sortable by:

1. Priority score
2. Time waiting
3. Landlord last name for multi-unit properties

Additional filters may include:

- Zone
- Service
- Property type
- Number of units
- Eligibility
- Funder
- Urgency
- Appointment status

---

# 24. Client Self-Scheduling

Clients may receive a secure scheduling link by:

- Email
- Text message

The link should display only appointments that are valid for that client.

The client should not see:

- Ineligible services
- Unqualified Auditors
- Restricted zones
- Internal notes
- Internal funding details unless specifically authorized

---

# 25. Client Scheduling Availability

When a client self-schedules, the engine must calculate available appointments using the same scheduling rules used by Schedulers.

The client must not receive a separate or less accurate availability system.

---

# 26. Automatic Auditor Assignment

When a client self-schedules, the system should automatically select a qualified available Auditor.

The assignment should consider:

1. Service qualifications
2. Auditor availability
3. Zone assignment
4. Travel requirements
5. Existing appointments
6. Contractor requirements
7. Organization scheduling rules

The system may use configurable balancing rules when multiple Auditors are equally appropriate.

---

# 27. Client Rescheduling

A client may use the original secure scheduling link to request or perform an authorized reschedule.

The system must recalculate availability.

The original appointment must be retained in history.

The new appointment must be recorded separately or as a new appointment state according to the organization's configuration.

---

# 28. Client Cancellation

A client may cancel through the secure scheduling link.

The client may optionally provide a reason.

The client may also provide additional information.

Cancellation should:

- Release the Auditor
- Release the Contractor when applicable
- Notify Schedulers
- Notify assigned staff according to organization settings
- Update external systems when configured
- Preserve the appointment history

---

# 29. No-Show

A client no-show may be categorized as:

**Needs Rescheduling**

The system should allow a Scheduler to record:

- No-show
- Date/time
- Notes
- Attempt count

The organization may configure a maximum number of scheduling attempts.

The initial policy may be three attempts.

After the configured number of attempts, the service may be marked declined unless the client later reinitiates scheduling.

---

# 30. Reschedule Reason

When an appointment is rescheduled, the system should optionally capture:

- Client request
- Auditor cancellation
- Auditor delay
- Contractor conflict
- Weather
- Agency scheduling issue
- Other configured reason

---

# 31. Appointment Completion

Auditors may complete or partially complete services.

Completion may occur in:

- Scheduling Platform
- Monday.com
- Both, through synchronization

The Scheduling Engine must not hide or archive a client merely because an appointment was completed.

The system should evaluate whether additional eligible services remain.

---

# 32. Service Exhaustion

A client/property should become eligible for hiding or archiving from the active scheduling queue only when:

- Required services have been completed, and/or
- Remaining eligible services have been declined, and/or
- An authorized user otherwise closes the scheduling process according to organization rules

The system must not archive simply because an appointment was scheduled.

---

# 33. External Completion Updates

If an Auditor or authorized staff member records completion in Monday.com, the scheduling system should receive that change through synchronization.

The system should then reevaluate the client's scheduling state.

This may cause the client/property to:

- Remain active
- Display remaining eligible services
- Move to completed
- Move to declined
- Move to another configured state

---

# 34. Service Added After Assessment

An Auditor may identify an additional eligible service during an assessment.

The Auditor may indicate:

- Interested
- Declined
- Needs scheduler follow-up

An interested service should notify the Scheduler.

The Scheduler may then:

- Contact the client
- Send a scheduling link
- Schedule the service
- Place the client back into the appropriate scheduling queue

---

# 35. Auditor Field Widget

Auditors should have access to a simplified field widget.

The widget should support large, easy-to-use actions:

- On My Way
- Running Late
- Cancel Appointment
- Cannot Attend
- Need Scheduler
- Client No-Show
- Client Interested in Another Service
- Client Declined Additional Service

The widget should require minimal interaction.

---

# 36. Driving Mode

Driving Mode is optional.

When enabled, it should use the device's available voice capabilities.

The Auditor should be able to issue supported voice commands without navigating the full application.

The system should request confirmation before sending consequential notifications or changing appointment status.

---

# 37. Driving Mode Information

Voice responses must minimize client information.

When appropriate, the system may provide:

- Next appointment time
- Next appointment address
- Whether the appointment is for a single unit
- Services scheduled for the appointment

The system should not verbally provide unnecessary sensitive client information.

---

# 38. Running Late

An Auditor may select:

**Running Late**

The system may request:

- Estimated delay
- Optional reason

The system then:

1. Notifies the Scheduler
2. May notify the client automatically
3. Records the event
4. Updates the appointment status
5. Recalculates downstream scheduling risk where appropriate

---

# 39. Auditor Cancellation

An Auditor may select:

**Cancel Appointment**

The system should:

1. Require confirmation
2. Record the reason when appropriate
3. Notify the Scheduler
4. Notify the client according to organization rules
5. Release affected scheduling resources
6. Mark the appointment for rescheduling
7. Preserve the original appointment history

---

# 40. Client Communication

The system should support configurable communication templates.

Examples:

- Scheduling invitation
- Appointment confirmation
- Appointment reminder
- Rescheduling confirmation
- Cancellation confirmation
- Auditor running late
- Auditor cancellation
- Appointment reschedule request

Organizations may customize templates.

---

# 41. Calendar Synchronization

The Scheduling Platform should maintain its own scheduling calendar.

Outlook may be connected as an external calendar.

The internal scheduling engine remains responsible for determining whether an appointment may be booked.

External calendar synchronization should prevent conflicts without making the external calendar the core scheduling database.

---

# 42. Offline Auditor Access

Auditors may lose cellular or Wi-Fi connectivity.

The mobile application should support an offline mode that allows an Auditor to view necessary information for their current day's schedule.

Offline information should be limited to the minimum required.

The system should synchronize changes once connectivity returns.

---

# 43. Offline Conflict Handling

If an Auditor performs an action while offline, the application should store the action locally.

When connectivity returns:

1. The action is synchronized.
2. The server verifies the action.
3. Conflicts are detected.
4. The user is notified when manual resolution is required.

---

# 44. Scheduling Engine Priority

When evaluating appointment availability, the engine should prioritize:

1. Client eligibility
2. Requested services
3. Selected units/property
4. Required duration
5. Required Auditor qualifications
6. Auditor availability
7. Contractor requirements
8. Zone restrictions
9. Travel time
10. Existing appointments
11. Scheduling holds
12. Organization-specific rules

---

# 45. Availability Calculation

A time slot is available only if all required conditions are satisfied.

Conceptually:

```text
AVAILABLE =
    eligible services
    AND valid property/unit selection
    AND sufficient appointment duration
    AND qualified Auditor
    AND Auditor available
    AND zone permitted
    AND travel feasible
    AND contractor available when required
    AND no conflicting appointment
    AND no active hold
    AND organization rules satisfied
