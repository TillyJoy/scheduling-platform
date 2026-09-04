# Visual and Communication Requirements

## Theme

The application must provide a modern SaaS and practical operations interface.

Users must be able to select:

- Light
- Dark
- System

System follows the device appearance setting.

## Color Customization

Organizations and users may customize meaningful interface colors.

Configurable colors may include:

- Primary
- Secondary
- Background
- Surface
- Text
- Border
- Success
- Warning
- Critical
- Information
- Calendar
- Availability
- Travel
- Conflict
- Hold

The system must validate contrast and accessibility.

Color must never be the only indicator of important information.

## Calendar Color Configuration

Organizations may choose what calendar colors represent.

Possible categories include:

- Appointment status
- Service
- Program
- Funder
- Town
- Zone
- Team
- Resource
- Custom category

Organizations may configure their own colors or use defaults.

Users may be permitted to select different calendar views.

Example:

Color calendar by Town.

Or:

Color calendar by Funder.

Or:

Color calendar by Service.

## Calendar Subjects

Organizations may define visual subjects or categories for appointments.

Each subject may have:

- Name
- Color
- Icon
- Description
- Active/inactive status

Subjects must be configurable without code.

## Icons

The application should use meaningful icons for rapid visual processing.

Organizations may configure icons for supported categories and alerts from an approved icon library.

Icons must remain understandable and accessible.

## Alerts

Important system and scheduling events should support visible alerts.

Alerts may appear as:

- Popup
- Toast
- Notification center item
- Calendar indicator
- Badge

## Alert Center

Users should have a centralized notification and alert center.

Alerts should be categorized by severity:

- Critical
- Important
- Warning
- Information
- Success

Users should be able to quickly access the related record.

## Alert Configuration

Administrators may configure:

- Alert severity
- Icon
- Color
- Popup behavior
- Sound where supported
- Duration
- Recipients
- Required acknowledgement
- Notification channels

User-level preferences may be allowed where administrators permit them.

## Comments

Important records should provide an accessible comment/activity area.

Comments may be associated with:

- Client
- Property
- Unit
- Appointment/job
- Team
- Resource
- Service
- Funding
- Other configurable records

## Comment Categories

Organizations may configure comment categories.

Examples:

- General
- Scheduling
- Property
- Eligibility
- Funding
- Internal
- Safety
- Client Request
- Critical

Users may also leave a general comment without selecting a category where permitted.

## Comment Metadata

Comments should record:

- Author
- Date
- Time
- Category
- Associated record
- Edit history

Attachments and mentions may be supported.

## Comment Priority

Comments may have priority levels:

- General
- Important
- Critical

## Important Comments

Important comments must be visually prominent on the associated record.

## Critical Comments

Critical comments must be extremely visible.

They may:

- Display prominently on the appointment
- Display on the assigned user's schedule
- Generate a notification
- Generate a popup
- Require acknowledgement
- Display an icon
- Display a configurable color

## Appointment-Critical Comments

A Scheduler may mark a comment as important or critical for a specific appointment.

The comment must remain associated with that appointment if the appointment is:

- Rescheduled
- Reassigned
- Moved by schedule ripple
- Assigned to a different team

## Scheduler Push Notifications

Authorized Schedulers may send an immediate notification to the assigned resource or team when necessary.

The Scheduler should be able to choose:

- Recipient
- Priority
- Message
- Popup
- Require acknowledgement

## Notification Protection

The system should prevent excessive notification volume where practical.

Organizations should be able to configure notification behavior.

## Acknowledgement

Critical notifications may require acknowledgement.

The system should record:

- Recipient
- Notification time
- Acknowledgement time
- Acknowledgement status

## Central Activity

The application should provide a central activity area showing relevant:

- Comments
- Alerts
- Notifications
- Scheduling changes
- Important updates

Users should be able to navigate directly to the associated record.

## Visual Consistency

Themes, colors, icons, alerts, comments, and calendar indicators must work consistently across:

- Desktop
- Tablet
- Mobile

## Accessibility

Important information must be communicated using combinations of:

- Color
- Icon
- Text
- Position
- Appropriate visual emphasis

The interface must not rely solely on color.
