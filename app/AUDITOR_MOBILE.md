# Auditor Mobile Experience

The application must provide Auditors with mobile access to their assigned schedules and necessary appointment information.

The mobile experience must support both Android and Apple devices.

## Supported Devices

The application should support:

- Android phones
- Android tablets where appropriate
- iPhones
- iPads where appropriate
- Desktop/web access where appropriate

## Auditor Schedule

Auditors should be able to view:

- Today's appointments
- Upcoming appointments
- Appointment time
- Appointment address
- Unit information when necessary
- Services scheduled
- Assigned Contractor when applicable
- Relevant appointment instructions
- Status of the appointment

Client information must be limited to what is necessary for the Auditor to perform the work.

## Calendar View

Auditors should have access to:

- Daily schedule
- Weekly schedule
- Appointment details
- Travel time between appointments
- Appointment status

The application should make it easy to identify the next appointment.

## Offline Schedule

Auditors must be able to access their current day's necessary schedule information when cellular or Wi-Fi service is unavailable.

Offline information should include only the minimum necessary information, such as:

- Appointment time
- Appointment address
- Unit information when necessary
- Scheduled services
- Necessary appointment instructions

## Offline Actions

Where technically feasible, Auditors should be able to perform limited actions while offline.

Examples:

- On My Way
- Running Late
- Cancel/Unable to Attend
- Client No-Show
- Client Interested
- Client Declined

Actions performed offline must be stored securely on the device and synchronized when connectivity returns.

## Mobile Field Widget

The application should provide a simplified field widget that can be accessed without opening the full application.

The widget should use large, easily identifiable controls.

Primary actions:

- On My Way
- I'm Late
- Cancel
- Cannot Attend

Additional actions:

- Client No-Show
- Need Scheduler
- Client Interested
- Client Declined

## Widget Design

The widget should require as few interactions as possible.

Buttons should be large enough for use in field conditions.

The widget should not display unnecessary client information.

## On My Way

When selected:

1. The Auditor confirms the action when required.
2. The system records the time.
3. The Scheduler is notified according to configuration.
4. The client may be notified according to organization settings.

## Running Late

When selected:

1. The Auditor chooses or enters an estimated delay.
2. The system confirms the action.
3. The Scheduler is notified.
4. The client may be notified automatically.
5. The event is recorded in the Audit Log.

## Cancellation

When an Auditor selects Cancel:

1. Confirmation is required.
2. The Auditor may select a reason.
3. The Scheduler is immediately notified.
4. The client may be notified automatically or through the Scheduler.
5. The appointment becomes eligible for rescheduling.
6. The Auditor's time is released.
7. The event is recorded in the Audit Log.

## Cannot Attend

This action should be available when the Auditor cannot attend an appointment but the situation is not necessarily a normal cancellation.

Examples:

- Illness
- Vehicle problem
- Emergency
- Unexpected field issue
- Other configured reason

The Scheduler receives an immediate alert.

## Client No-Show

The Auditor may report a client no-show.

The system should:

- Record the appointment
- Record the time
- Mark the appointment as No-Show
- Notify the Scheduler
- Preserve the appointment history
- Allow the Scheduler to initiate rescheduling

## Client Interest in Additional Services

An Auditor may indicate that a client is interested in an additional eligible service.

The Auditor should not be required to schedule the service.

Available actions:

- Interested
- Declined
- Ask Scheduler to follow up

The Scheduler should receive an alert when follow-up is requested.

## Client Declines Additional Service

The Auditor may optionally record that a client declined an additional eligible service.

The system should preserve the information for the appropriate service record.

## Driving Mode

Driving Mode is optional.

When enabled, the application may use the device's native voice capabilities.

The Auditor should be able to interact with supported functions without manually navigating the application.

## Voice Commands

Supported voice commands may include:

- "I'm on my way"
- "I'm running late"
- "Cancel my next appointment"
- "I can't make my next appointment"
- "Client is a no-show"
- "Client is interested"
- "Client declined"

The system should support configurable command phrases.

## Voice Confirmation

Actions that change appointment status or notify clients should require confirmation unless the organization explicitly enables trusted one-step actions.

Example:

Auditor:

"I'm running 15 minutes late."

Application:

"Confirm running 15 minutes late?"

Auditor:

"Yes."

## Voice Information

When Driving Mode is active, the application should minimize spoken information.

For the next appointment, it may provide:

- Appointment time
- Address
- Whether it is a single unit
- Services scheduled

It should not verbally provide unnecessary client information.

## Single-Unit Identification

If an appointment is for a single unit, voice mode may identify that it is a single-unit appointment.

Example:

"Next appointment at 10:30 AM, 48 Oak Street, Unit 2. Services scheduled: AMP."

No additional client information should be spoken unless specifically required and authorized.

## Push Notifications

Auditors should receive push notifications for important changes.

Examples:

- Appointment changed
- Appointment cancelled
- New appointment assigned
- Contractor assignment changed
- Scheduler message
- Client reschedule
- Important organization alert

## Schedule Changes

If an appointment changes while the Auditor is using the application, the mobile schedule should update.

The Auditor should be clearly notified when the change materially affects their schedule.

## Security

The mobile application must support appropriate device security controls.

Potential controls include:

- Secure authentication
- Session expiration
- Device authentication
- Biometric authentication where supported
- Remote session revocation
- Encrypted local storage
- Secure synchronization

## Lost Device

Administrators should be able to revoke application access for a lost or compromised device.

## Minimum Necessary Data

The mobile application must follow the minimum-necessary principle.

The Auditor should receive enough information to perform the assigned appointment but should not automatically receive unrelated client or agency information.

## Audit Logging

Mobile actions must be included in the Audit Log.

The system should identify:

- Auditor
- Action
- Date/time
- Appointment
- Device/application source
- Offline/online status
- Synchronization status
