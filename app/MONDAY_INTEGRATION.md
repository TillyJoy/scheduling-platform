# Monday.com Integration

The application must support optional bidirectional integration with Monday.com.

The scheduling platform must remain fully functional without Monday.com.

## Integration Model

Monday.com may:

- Send client information to the Scheduling Platform
- Send eligibility information
- Send service information
- Send funding information
- Send scheduling status information
- Receive appointment information
- Receive appointment dates
- Receive appointment times
- Receive Auditor assignments
- Receive Contractor assignments
- Receive job numbers
- Receive scheduling status changes
- Receive cancellation/rescheduling information
- Receive completion information

The integration must support both directions.

## Multiple Boards

An organization may connect multiple Monday.com boards.

Example:

- Central Vetting
- Central Jobs
- Central Ineligible
- Department-specific boards
- Additional program boards

Each connection must be independently configurable.

## Board Mapping

Each connected board must have a configurable mapping between:

Monday.com columns
and
Scheduling Platform fields.

The integration must not assume that all organizations use the same column names.

## Central Vetting

For the initial agency implementation, the primary intake/vetting board is:

`Central Vetting`

The Scheduling Platform should receive clients only after the configured Monday.com workflow determines that the client is ready for scheduling.

Clients should not enter the active Scheduling Platform queue merely because they exist on the Central Vetting board.

## Connection Status

A configured Monday.com status or automation may indicate when a client/property becomes eligible to enter the Scheduling Platform.

When the configured condition is met:

1. The integration retrieves the required information.
2. The Scheduling Platform creates or updates the corresponding client/property record.
3. The property is assigned to the appropriate scheduling zone.
4. Eligible services are evaluated.
5. The client becomes available to Schedulers.

## Client Identity

The integration must support clients who:

- Have multiple properties
- Move between properties
- Appear at multiple residences
- Have multiple units associated with a property
- Share a landlord with other properties

A client must not be identified solely by address.

A client may have multiple property relationships.

A property must have its own persistent identifier.

Units must have their own persistent identifiers where appropriate.

## Property Identity

The system must support:

- Single-family properties
- Multi-unit properties
- Apartments
- Units
- Lots
- Mobile homes
- Properties with multiple items in Monday.com

The same property address may appear in multiple Monday.com items.

The integration must not automatically merge those records simply because the addresses match.

## Multi-Unit Properties

Each tenant/unit may have different eligibility.

The integration must support:

- Property-level eligibility
- Unit-level eligibility
- Tenant-level eligibility
- Funding available to individual units
- Funding available because of property-level rules
- Service-specific eligibility

## Fifty-Percent Rule

The integration must support organization-defined rules such as:

If at least 50% of units are eligible, the property may qualify for specified services.

The actual rule must be configurable.

The Scheduling Platform should receive the resulting eligibility information rather than attempting to replace the agency's existing eligibility determination unless specifically configured to do so.

## Service Statuses

Monday.com may contain separate status fields for primary services.

Initial examples include:

- AMP job status
- WX job status
- ASHP job status
- HS status

The Scheduling Platform must not hard-code these names.

Organizations must be able to map their own service status fields.

## Scheduling Status

The integration must support statuses such as:

- Ready to Schedule
- Scheduling
- Scheduled
- In Progress
- Assessment Complete
- Declined
- Prior Work
- Invoiced
- Completed
- Other configured statuses

A status change in Monday.com may trigger a corresponding Scheduling Platform state change.

## Scheduling Platform → Monday.com

When a Scheduler or client creates an appointment, the integration should update the associated Monday.com record.

Potential fields include:

- Appointment date
- Appointment time
- Auditor
- Contractor
- Scheduling status
- Service
- Job number
- Scheduling notes where authorized

## Monday.com → Scheduling Platform

When an authorized Monday.com user changes relevant information, the Scheduling Platform should update accordingly.

Examples:

- Client becomes ineligible
- Service becomes ineligible
- Service becomes eligible
- Prior work is discovered
- Job is cancelled
- Job is completed
- New service becomes available
- Client is moved to another workflow state

## Mirrored Columns

Monday.com mirror columns must be handled carefully.

The integration should understand that a value displayed through a Mirror column may originate from another item/board.

The system should identify the underlying source record when possible.

The integration must not create duplicate records simply because the same information appears through multiple Mirror columns.

## Connected Boards

Monday.com Connected Boards may represent relationships between:

- Vetting
- Jobs
- Intake
- Other program boards

The integration must preserve these relationships.

## Source of Truth

Each synchronized field must have a configured authority.

Possible settings:

- Monday.com
- Scheduling Platform
- Bidirectional
- External/manual

The system must not assume that Monday.com is always authoritative.

## Conflict Resolution

If both systems change the same field before synchronization completes, the integration must use a defined conflict rule.

Possible rules include:

- Most recent authorized change
- Monday.com wins
- Scheduling Platform wins
- Manual review required

The conflict rule must be configurable.

## Synchronization Frequency

The integration should support:

- Real-time webhook/event synchronization when available
- Scheduled synchronization
- Manual synchronization

Real-time synchronization should be preferred for scheduling-critical fields.

## Webhooks

Where supported, Monday.com webhooks should be used to detect relevant changes.

Webhook events must be validated before being processed.

## API

The integration must use the official Monday.com API.

API credentials must never be stored in source code.

Credentials must be stored using secure secret-management mechanisms.

## Error Handling

If synchronization fails:

1. The failure must be recorded.
2. The affected record must remain identifiable.
3. The system must avoid silently losing data.
4. Retry logic should be used where appropriate.
5. A user-visible integration error should be available to authorized administrators.
6. Repeated failures should generate an alert.

## Duplicate Prevention

The integration must use stable external identifiers.

A Monday.com item ID should be stored with the corresponding Scheduling Platform record.

The same Monday.com item must not create duplicate clients, properties, or appointments.

## Job Numbers

The system must support custom job numbers.

Job numbers may be:

- Numeric
- Alphanumeric
- Organization-defined

Bundled services must still retain separate job numbers.

Example:

Client appointment:

AMP + ASHP

May contain:

AMP Job Number: AMP-26-00123
ASHP Job Number: ASHP-26-00451

These values must be synchronized according to configured mappings.

## Appointment Updates

When an appointment is:

- Created
- Rescheduled
- Cancelled
- Completed
- Partially completed

the appropriate Monday.com fields should be updated.

## External State Changes

If Monday.com changes a client to an ineligible or closed state, the Scheduling Platform must reevaluate the client's scheduling status.

If no active services remain, the client may be removed from the active scheduling queue according to the configured scheduling rules.

## Do Not Delete Automatically

External synchronization should not automatically delete Scheduling Platform records merely because a Monday.com item was removed.

Deletion behavior must be explicitly configured.

Historical scheduling information must be preserved.

## Synchronization Log

Every synchronization event must be included in the Audit Log.

The log should identify:

- Direction
- Board
- Item ID
- Field
- Previous value
- New value
- Timestamp
- Success/failure
- Error information where applicable
