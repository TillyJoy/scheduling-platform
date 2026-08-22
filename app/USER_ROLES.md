# User Roles

The application must support configurable user roles and permissions.

## Scheduler

Schedulers can:

- View clients ready for scheduling
- View eligible services
- View available appointment times
- View available Auditors
- View applicable Contractors
- Place temporary scheduling holds
- Create appointments
- Reschedule appointments
- Cancel appointments
- Contact clients
- Record scheduling notes
- View scheduling history
- Respond to Auditor alerts

Schedulers cannot:

- Change eligibility rules
- Change funder rules
- Change service durations
- Change Auditor qualifications
- Change system configuration
- Override security permissions unless specifically authorized

## Auditor

Auditors can:

- View their assigned schedule
- View necessary client/property information
- View scheduled services
- View applicable additional eligible services
- Report client interest or decline
- Report no-shows
- Mark appointments partially or fully completed
- Use field-status controls
- Send "On My Way" notifications
- Send "Running Late" notifications
- Report cancellation/unavailability
- Use optional hands-free driving mode

Auditors cannot:

- Schedule appointments
- Change client eligibility
- Change funder rules
- Change service durations
- Change other Auditors' schedules

## Contractor

Contractors can be granted limited access to:

- Their assigned appointments
- Necessary property/unit information
- Appointment time
- Appointment location
- Required services
- Scheduling notifications

Contractors cannot access unrelated clients or appointments.

## Department Manager

Department Managers may be granted administrative access to their department.

They may:

- Manage users
- Manage schedules
- Manage zones
- Manage services
- Manage service durations
- Manage Auditor qualifications
- Manage Contractor availability
- Manage scheduling rules
- View reports
- View audit logs

## Organization Administrator

Organization Administrators may manage the entire organization's configuration.

They may:

- Create departments
- Manage department administrators
- Configure integrations
- Configure organization-wide rules
- Manage security settings
- Manage data retention
- View organization-wide audit logs

## IT Administrator

IT Administrators may be granted technical administration rights without necessarily receiving operational scheduling permissions.

They may:

- Manage integrations
- Manage authentication
- Manage application connections
- Manage technical configuration
- Manage security settings
- Review technical audit logs
- Manage API credentials
- Manage system access

IT access should be independently configurable from operational permissions.

## System Administrator

A System Administrator has the highest application-level administrative permissions.

System Administrator permissions should be tightly controlled and fully audited.

## Client

Clients may:

- Receive secure scheduling links
- View eligible appointment options
- Schedule an appointment
- Reschedule an appointment
- Cancel an appointment
- Provide optional cancellation/rescheduling information

Clients must only have access to their own scheduling information.

## Permission Principles

Permissions should follow least-privilege principles.

Users should receive only the permissions necessary for their role.

Permissions must be configurable by organization and, where appropriate, by department.

Sensitive administrative actions must be recorded in the Audit Log.

## Audit Requirement

The system must record:

- User
- Role
- Action
- Date/time
- Affected record
- Previous value when applicable
- New value when applicable
- Source/device when available
- Integration source when applicable
