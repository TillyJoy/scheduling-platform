# Monday.com Integration Specification

Monday.com is an optional external system.

The Scheduling Platform must also operate independently for organizations that do not use Monday.com.

When Monday.com is connected, the integration must support bidirectional communication.

## Integration Direction

Information may flow:

Monday.com → Scheduling Platform

Scheduling Platform → Monday.com

The integration may support both directions simultaneously.

## Multiple Boards

An organization may connect multiple Monday.com boards.

Examples may include:

- Central Vetting
- Central Jobs
- Central Ineligible
- Additional organization-specific boards

Each board connection must be independently configurable.

## Board Relationships

Boards may have relationships such as:

- Connected items
- Mirror columns
- Linked records
- Status-driven workflows
- Automations

The Scheduling Platform must understand the underlying relationships without assuming a single fixed board structure.

## Central Vetting

The organization's Central Vetting board contains intake and eligibility information.

The Scheduling Platform should be able to receive relevant information when a client/property reaches the appropriate scheduling stage.

Clients must not enter the Scheduling Platform scheduling database merely because they exist in Monday.com.

The client should enter the Scheduling Platform only after the appropriate Monday.com workflow moves the client into a scheduling zone.

## Zone Trigger

A configured Monday.com event may indicate that a client/property is ready for scheduling.

Example workflow:

1. Intake completes initial vetting.
2. Client moves to pending connection.
3. Monday.com connections are established.
4. Appropriate job statuses are established.
5. Connection status triggers the Monday.com automation.
6. Client is assigned to a geographic zone.
7. The Scheduling Platform receives the qualifying event.
8. The client/property is imported into the Scheduling Platform.
9. Scheduling eligibility becomes active.
10. The client becomes available to Schedulers.

## Scheduling Entry Rule

The Scheduling Platform should not create an active scheduling record for clients who have not reached the configured scheduling-entry condition.

## Zone Changes

If a client's zone changes in Monday.com, the Scheduling Platform should receive the change.

The system should:

- Update the zone
- Recalculate scheduling availability
- Update Scheduler views
- Recalculate geographic routing where appropriate

## Central Jobs

The Central Jobs board contains job-level information.

Relevant information may include:

- Job status
- Assessment date
- Auditor
- Job number
- Service
- Additional service information

The Scheduling Platform should be able to receive relevant job information from the Jobs board.

## Bidirectional Scheduling Updates

When a Scheduler creates or changes an appointment, the Scheduling Platform should update Monday.com.

Examples:

- Scheduling status
- Assessment date
- Auditor
- Job number
- Other configured scheduling fields

## Monday Status Columns

The integration must support configurable status mappings.

Examples:

- Ready to Schedule
- Scheduling
- Scheduled
- In Progress
- Assessment Complete
- Completed
- Declined
- Prior Work
- Invoiced
- Other organization-defined statuses

Status values must not be hard-coded.

## Multiple Service Statuses

A client/property may have separate status fields for multiple primary services.

Examples:

- AMP Job Status
- WX Job Status
- ASHP Job Status
- HS Status

The integration must treat these as separate service-specific statuses.

## Service-Specific Scheduling

Schedulers primarily schedule the organization's four main services.

Other services may exist as:

- Add-on services
- Services identified during assessment
- Services that are occasionally scheduled independently

The integration must support both.

## Add-On Services

Additional services may be managed primarily on the Jobs board.

Their eligibility may be determined through Monday.com automation and available funding.

The Scheduling Platform should receive relevant eligibility information when configured.

## Dynamic Services

Service availability must be dynamic.

A client/property may have:

- Multiple eligible services
- Different funding sources
- Different service eligibility by unit
- Services that are property-level
- Services that are unit-level
- Services that become available after assessment

## Funding

Monday.com may contain multiple funding-source fields.

The Scheduling Platform must support receiving:

- Primary funder
- Secondary funder
- Multiple funding sources
- Available funding combinations

Available funding is not necessarily the same as the funding ultimately selected for a service.

The Auditor may determine how funding is ultimately used.

## Multi-Unit Properties

A multi-unit property may have multiple Monday.com items.

Example:

48 Oak Street, Apartments 1–4

Each unit may have its own:

- Eligibility
- Service status
- Funding availability
- Job number
- Service history

The Scheduling Platform must preserve these distinctions.

## Property-Level Rules

Some services are determined at the property level.

Example:

Weatherization may require the building to meet a property-level service-history rule.

The Scheduling Platform must support property-level eligibility independently of individual unit eligibility.

## Fifty-Percent Rule

The organization may use a rule where a multi-unit property becomes eligible when at least 50% of units meet the required eligibility conditions.

The Scheduling Platform must support receiving and displaying the result of this rule from Monday.com.

The Scheduling Platform should not silently replace the organization's Monday.com eligibility determination.

## Prior Work

Monday.com may indicate that a service is unavailable because the client or property received the service previously.

Examples:

- Prior AMP within five years
- Prior WX
- Prior work
- Invoiced FY25

The Scheduling Platform should receive these statuses when they affect scheduling eligibility.

## Job Numbers

Each service may have its own job number.

Job numbers may be:

- Numeric
- Alphanumeric
- Custom

Examples:

- AMP job number
- WX job number
- ASHP job number
- HS job number

Job numbers must synchronize in both directions when configured.

## Job Number Integrity

The Scheduling Platform must not silently overwrite an existing job number.

Conflicts should be flagged for review.

## Mirrored Columns

Monday.com may use mirrored columns between boards.

The integration must understand that a value may appear:

- On the source board
- On a mirror column
- On a connected item

The integration should identify the underlying source where possible.

## Mirror Synchronization

When a Scheduler changes a field in the Scheduling Platform, the integration should update the appropriate Monday.com source field rather than attempting to write blindly to a mirror field.

Where Monday.com permits writing through the relevant connected structure, that method may be used.

## Scheduler-Facing Fields

The Scheduling Platform should receive the fields necessary for scheduling.

Examples:

- Client name
- Client phone
- Client email
- Property address
- Unit
- Landlord information when necessary
- Funding availability
- Service status
- Priority score
- Service history
- Job number
- Assessment dates
- Auditor assignments

## Priority

Priority score is used for Scheduler sorting.

The Scheduling Platform should receive the priority score where configured.

Scheduler sorting may use:

1. Priority score
2. Time waiting for services
3. Landlord last name for multi-unit properties

Sorting rules must be configurable.

## Scheduling Views

The Scheduling Platform should replicate the operational concept of Monday.com filtered views.

Schedulers should be able to see clients based on:

- Service eligibility
- Zone
- Unit count
- Property type
- Scheduling status
- Priority
- Other configured criteria

The Scheduling Platform should not require Schedulers to manually reproduce complex Monday.com filters.

## Property vs Selected Unit Scheduling

The Scheduler must be able to choose:

- Entire property
- Selected units
- Single unit

This selection must be stored in the Scheduling Platform.

The selection should be communicated to Monday.com where configured.

## Auditor Information

The Scheduling Platform should synchronize Auditor assignments.

Examples:

- AMP Auditor
- WX Auditor
- ASHP Auditor
- HS Auditor

Assignments may be updated from the Scheduling Platform or Monday.com depending on configured authority.

## Assessment Dates

Assessment dates should synchronize.

Examples:

- AMP Assessment Date
- WX Assessment Date
- ASHP Assessment Date
- HS Assessment Date

## Cancellation and Rescheduling

When a client cancels or reschedules through the Scheduling Platform:

1. Appointment status updates.
2. Monday.com receives the configured status change.
3. Assessment dates are updated where appropriate.
4. Auditor information remains or is changed according to workflow.
5. Scheduler alerts are generated.
6. The event is recorded in the Audit Log.

## Auditor Alerts

Auditor actions such as:

- Running late
- On My Way
- Cancel
- Cannot Attend
- No-Show

should generate Scheduler notifications.

Monday.com may also be updated when configured.

## Client Interest

If an Auditor records interest in an additional eligible service:

- The Scheduling Platform records the interest.
- The Scheduler receives an alert.
- Monday.com may be updated where configured.
- The client remains available for follow-up until the organization resolves the request.

## Completion and Archiving

A client/property should not automatically disappear from Scheduling merely because an appointment is complete.

The Scheduling Platform should hide/archive scheduling work only when configured conditions are satisfied.

Examples:

- Requested services completed
- Remaining eligible services declined
- No remaining schedulable services

Completion information may originate from:

- Scheduling Platform
- Monday.com

## Ineligibility

If Monday.com determines that a client/property is no longer eligible:

- Scheduling Platform scheduling availability should be updated.
- Existing appointments must be handled according to configured rules.
- The client should not be available for new scheduling.
- The Central Ineligible workflow may be reflected in the Scheduling Platform.

The system must not automatically cancel an appointment unless the organization's configured rule requires it.

## Monday Automations

Existing Monday.com automations should be allowed to continue operating.

The Scheduling Platform should integrate with those workflows rather than unnecessarily replacing them.

## Source of Truth

Each field must have a configurable authority.

Possible authority:

- Monday.com
- Scheduling Platform
- Shared
- Manual review

The system must not assume that every field has the same source of truth.

## Conflict Resolution

If both systems change the same field:

1. Detect the conflict.
2. Record both values.
3. Apply the configured conflict rule.
4. Notify an authorized user when manual review is required.
5. Record the resolution in the Audit Log.

## Synchronization Queue

Changes should pass through a synchronization queue where appropriate.

The queue should support:

- Retry
- Failure tracking
- Duplicate prevention
- Ordering where required
- Manual retry
- Error reporting

## Synchronization Frequency

The integration should use event-driven synchronization whenever supported.

Monday.com webhooks should be used for near-real-time updates where practical.

When polling is required, the default polling interval should be:

**30 seconds**

The polling interval must be configurable by organization and integration.

The system should support:

- 30-second default polling
- Longer intervals when appropriate
- Manual "Sync Now"
- Automatic retry
- Exponential backoff after repeated failures
- Rate-limit protection

Polling must not create duplicate records or duplicate updates.

The system should prioritize webhooks over polling when both are available.

## Sync Freshness

The system should track the last successful synchronization time for each integration.

Authorized users should be able to see:

- Last successful sync
- Last attempted sync
- Current synchronization status
- Pending changes
- Failed changes
- Number of retry attempts

## Synchronization History

The system must preserve synchronization history.

History should include:

- Board
- Item
- Field
- Direction
- Previous value
- New value
- Timestamp
- Result
- Error if applicable

## Integration Failure

A temporary Monday.com outage should not prevent Schedulers from using the internal Scheduling Platform.

Changes should queue and synchronize when Monday.com becomes available again.

## Reconciliation

Authorized users should have a reconciliation screen showing:

- Records synchronized successfully
- Records pending synchronization
- Failed records
- Conflicts
- Records requiring manual review

## External IDs

The integration must preserve stable Monday.com identifiers.

Internal records must not rely solely on:

- Item name
- Client name
- Address

## Multiple Properties Per Client

A client may have multiple properties.

The integration must preserve the relationship between:

- Client
- Property
- Unit
- Monday item
- Service
- Job number

A client moving to a new property must not cause historical records from the prior property to be overwritten.

## Landlords Across Properties

The same landlord may be associated with multiple properties.

The integration should preserve the landlord/property relationship independently.

## Integration Configuration

Authorized administrators should be able to configure:

- Board IDs
- Group IDs
- Column mappings
- Status mappings
- Service mappings
- Field authority
- Webhooks
- Synchronization rules
- Conflict rules
- Scheduling-entry triggers
- Polling frequency

## Future Integrations

The integration architecture should allow other platforms to be connected using the same general model.

Monday.com must be an integration, not a dependency of the core Scheduling Engine.
