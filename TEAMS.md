# Teams and Multi-Person Assignments

The Scheduling Platform must support appointments requiring more than one person.

## Team Types

An organization may use:

- Individual staff
- Individual contractors
- Predefined teams
- Temporary teams
- Custom teams created for a specific appointment

## Team Members

A team may contain:

- Auditors
- Technicians
- Contractors
- Crew members
- Other organization-defined roles

## Predefined Teams

Authorized users may create reusable teams.

A predefined team may have:

- Team name
- Team members
- Roles
- Qualifications
- Service capabilities
- Geographic restrictions
- Availability

## Custom Teams

Schedulers may create a custom team for an individual appointment when permitted.

The custom team may contain any combination of qualified resources.

## Appointment Requirements

An appointment may require:

- One person
- Two or more people
- Specific roles
- Specific qualifications
- A particular team

## Availability

A team appointment is only available when all required members are available.

The Scheduling Engine must check:

- Individual availability
- Existing appointments
- Travel time
- Zone compatibility
- Required qualifications
- Required roles
- Scheduling buffers

## Conflict Prevention

Assigning a team to an appointment must prevent each team member from appearing as available for another conflicting appointment.

## Travel

Travel calculations must consider every required team member.

A team should not be offered if one required member cannot reasonably reach the appointment.

## Team Changes

Authorized users may add or remove team members before an appointment.

Changes should trigger a new availability check.

## Team Cancellation

If one required team member becomes unavailable:

- The appointment should be flagged.
- The Scheduler should be notified.
- The system should attempt to identify qualified replacement resources when configured.

The appointment should not automatically be cancelled unless configured to do so.

## Team Roles

Team members may have different roles.

Examples:

- Lead Auditor
- Assistant Auditor
- Contractor
- Technician
- Observer

Role names are configurable through the organization's terminology settings.

## Qualifications

Team members may have different qualifications.

The Scheduling Engine must verify that required qualifications are satisfied.

## Reporting

Reports should support:

- Appointments by team
- Appointments by team member
- Team utilization
- Multi-person appointments
- Team cancellations
- Team conflicts

## External Calendars

When configured, each team member's individual calendar may synchronize with the appointment.

The internal Scheduling Platform remains authoritative for team scheduling.

## Audit Log

Team creation, assignment, changes, and removal should be recorded in the Audit Log.

## Organization Configuration

Organizations determine:

- Which roles can form teams
- Who can create teams
- Which services require multiple people
- Whether custom teams are permitted
- Required qualifications
- Maximum team size
