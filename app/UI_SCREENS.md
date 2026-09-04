# User Interface Screens

The application should provide separate interfaces for Clients, Schedulers, Auditors, Contractors, Department Managers, Organization Administrators, and IT Administrators.

The interface must use role-based permissions so users only see functions they are authorized to use.

---

# Scheduler Interface

## Scheduler Dashboard

The Scheduler Dashboard should provide a real-time overview of scheduling work.

It should display:

- Clients ready to schedule
- Clients currently being worked on
- Scheduling holds
- Appointments requiring attention
- Reschedules
- Cancellations
- No-shows
- Auditor alerts
- Contractor alerts
- Client follow-up requests
- Integration alerts

The dashboard should allow filtering by:

- Zone
- Service
- Date
- Priority
- Scheduler
- Status

---

# Client Scheduling Workspace

The primary Scheduler workspace should allow a Scheduler to select a client/property and begin scheduling.

The Scheduler should be able to see:

- Client
- Property
- Selected unit(s)
- Eligible services
- Available funding
- Scheduling zone
- Priority score
- Waiting time
- Relevant scheduling notes

Internal information should be displayed according to permissions.

---

# Service Selection

The Scheduler should be able to select:

- One service
- Multiple services
- Eligible add-on services
- Selected units
- Entire property

The system should automatically calculate appointment duration based on:

- Selected services
- Selected units
- Funder requirements
- Service combinations
- Property rules
- Organization rules

---

# Appointment Availability

After services and units are selected, the Scheduler should see available appointment options.

Each option may display:

- Date
- Start time
- End time
- Zone
- Available Auditor count
- Qualified Auditors
- Contractor availability when required
- Travel feasibility

The Scheduler should not have to manually calculate travel time.

---

# Auditor Selection

The system should recommend qualified Auditors automatically.

The Scheduler may see:

- Auditor name
- Availability
- Relevant service qualifications
- Geographic compatibility

The system should prevent assignment when an Auditor cannot reasonably reach the appointment.

---

# Scheduler Hold

A Scheduler may temporarily hold an appointment slot.

The interface should clearly display:

- Hold owner
- Client
- Property
- Services
- Hold expiration

Other Schedulers should not be able to book the held resource.

---

# Appointment Confirmation

Before finalizing an appointment, the Scheduler should see a confirmation summary.

Example:

Client:
Jane Smith

Property:
48 Oak Street, Unit 2

Services:
AMP + ASHP

Date:
October 12

Time:
10:00 AM–12:00 PM

Auditor:
Assigned Auditor

Contractor:
Required Contractor

The Scheduler must confirm before committing the appointment.

---

# Appointment Complete

After confirmation, the system should:

- Create the appointment
- Assign the Auditor
- Assign Contractors where applicable
- Release the scheduling hold
- Update internal calendars
- Synchronize Monday.com when configured
- Synchronize Outlook when configured
- Send client confirmation when configured
- Record the event in the Audit Log

---

# Scheduler Calendar

Schedulers should have access to:

- Central availability calendar
- Auditor calendar
- Contractor calendar
- Zone calendar
- Daily view
- Weekly view

The primary purpose is to show appointment availability rather than expose unnecessary internal information.

---

# Client Follow-Up

Schedulers should have a dedicated view for:

- Client interested in additional service
- Client requested callback
- Client cancellation
- Client rescheduling
- Auditor requested Scheduler contact
- No-show requiring rescheduling

---

# Auditor Interface

## Auditor Dashboard

The Auditor Dashboard should prioritize the current day's work.

It should display:

- Today's appointments
- Appointment times
- Addresses
- Units
- Scheduled services
- Travel information
- Contractor information when necessary

---

# Auditor Daily Schedule

The Auditor should be able to view:

- Today's schedule
- Upcoming schedule
- Appointment status
- Travel time
- Appointment location

---

# Auditor Appointment

An Auditor may open an appointment to see necessary information.

Possible information:

- Appointment time
- Address
- Unit
- Scheduled services
- Relevant work instructions
- Assigned Contractor

Client information should be limited to what is necessary.

---

# Auditor Actions

The Auditor may select:

- On My Way
- Running Late
- Cancel
- Cannot Attend
- Client No-Show
- Client Interested
- Client Declined
- Need Scheduler

These actions must be easy to access from the appointment screen.

---

# Additional Eligible Services

If additional eligible services are available, the Auditor should be able to see them.

The Auditor should be able to indicate:

- Client interested
- Client declined
- Ask Scheduler to follow up

The Auditor should not normally schedule the additional service.

---

# Auditor Mobile Widget

The mobile widget should provide large controls for:

- On My Way
- I'm Late
- Cancel
- Cannot Attend

Additional controls:

- Client No-Show
- Need Scheduler
- Client Interested
- Client Declined

The widget must not display unnecessary client information.

---

# Auditor Driving Mode

Driving Mode should provide optional hands-free operation.

It should use device-native voice capabilities when available.

Supported commands may include:

- "I'm on my way"
- "I'm running late"
- "Cancel my next appointment"
- "I can't make my next appointment"
- "Client is a no-show"
- "Client is interested"
- "Client declined"

Confirmation should be used for actions that materially change an appointment unless explicitly disabled by the organization.

---

# Offline Auditor Interface

If connectivity is unavailable, the Auditor should still be able to access the current day's necessary schedule information.

The application should indicate when it is operating offline.

Offline actions should synchronize when connectivity returns.

---

# Contractor Interface

Contractors should see only appointments assigned to them.

The interface may display:

- Date
- Time
- Property
- Unit
- Required service
- Appointment instructions
- Contact information when authorized

Contractors should not see unrelated agency information.

---

# Client Interface

The Client interface should be intentionally simple.

The client should be able to:

- View available appointment times
- Schedule
- Reschedule
- Cancel
- Provide optional notes
- Receive confirmation

---

# Client Scheduling Screen

The client should see only:

- Eligible services
- Available appointment times
- Necessary property information
- Appointment instructions

Internal eligibility information should not be exposed.

---

# Client Rescheduling Screen

The client should be able to use the original secure link.

The system should show only currently valid appointment options.

The client should not have to understand the internal scheduling rules.

---

# Client Cancellation Screen

The client may cancel the appointment.

The system may optionally ask:

- Reason
- Additional information

Cancellation should require confirmation.

---

# Department Manager Interface

Managers should have access to:

- Scheduling dashboard
- Department calendar
- Auditor availability
- Contractor availability
- Zone management
- Service configuration
- Reports
- Audit information permitted by role

---

# Organization Administrator Interface

Organization Administrators should be able to manage:

- Departments
- Users
- Roles
- Services
- Funders
- Scheduling rules
- Zones
- Integrations
- Communication settings
- Reports
- Data retention

---

# IT Administrator Interface

IT Administrators should have a separate technical administration area.

Functions may include:

- Authentication
- User access
- Integration connections
- API credentials
- Webhooks
- Synchronization status
- System health
- Security configuration
- Technical logs

IT access should not automatically grant access to operational client information.

---

# Integration Dashboard

Authorized administrators should be able to view connected systems.

Examples:

- Monday.com
- Microsoft Outlook
- SMS provider
- Email provider
- Mapping provider

The dashboard should show:

- Connection status
- Last synchronization
- Failed synchronization
- Pending synchronization
- Webhook status

---

# Notification Center

Users should have a notification center appropriate to their role.

Examples:

Scheduler:

- Auditor late
- Auditor cancelled
- Client cancelled
- Client rescheduled
- Client interested
- Integration error

Auditor:

- Appointment changed
- Appointment cancelled
- New assignment
- Contractor change

Manager:

- Scheduling problems
- System alerts
- Reporting alerts

---

# Search

Authorized users should be able to search for records they have permission to access.

Search may include:

- Client
- Property
- Unit
- Job number
- Appointment
- External record ID

Search results must respect role permissions.

---

# Accessibility

The interface should support:

- Mobile devices
- Tablets
- Desktop computers
- Keyboard navigation
- Screen readers where practical
- Adjustable text size
- Accessible contrast
- Large touch targets
- Clear error messages

---

# Responsive Design

The web interface should adapt to:

- Phone
- Tablet
- Laptop
- Desktop
- Large monitor

The Scheduler interface should prioritize desktop/tablet use.

The Auditor interface should prioritize phone use.

The Client interface should prioritize mobile use.

---

# UI Security

The interface must never rely solely on hiding buttons for security.

The backend must enforce all permissions.

A user attempting to access an unauthorized function directly must still be denied.

---

# Future Standalone Application

The interface should be designed so the Scheduling Platform can eventually be distributed as:

- Web application
- Android application
- iOS application
- Desktop application where appropriate

The same backend and scheduling engine should support these interfaces.
