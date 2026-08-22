# Calendar and Geographic Routing

The Scheduling Platform must maintain its own internal scheduling calendar.

External calendars such as Outlook may be synchronized with the internal calendar but must not be the primary scheduling database.

## Internal Calendar

The internal calendar must track:

- Auditor availability
- Auditor appointments
- Contractor appointments
- Scheduling holds
- Unavailable periods
- Travel time
- Buffer time
- Zone assignments
- Service qualifications

## Auditor Calendar

Each Auditor should have an internal calendar.

The calendar may contain:

- Working hours
- Scheduled appointments
- Time off
- Unavailable blocks
- Training
- Administrative time
- Travel
- Other organization-defined blocks

## Scheduler Calendar

Schedulers should have a central availability interface.

The Scheduler should be able to select:

- Client
- Property
- Selected units
- Services
- Date range
- Zone

The system then calculates valid appointment options.

## Available Auditor Display

For each valid appointment time, the Scheduler may see the qualified Auditors available at that time.

An Auditor should only appear if:

- They are qualified for all required services
- They are available
- They are permitted to work in the zone
- They can reach the appointment within the required travel time
- They are not already held by another Scheduler
- They have no conflicting appointment

## Auditor Assignment

Once an Auditor is assigned to an appointment, that Auditor should no longer appear as available for another appointment that would create a conflict.

The Auditor may remain available for appointments that occur later and are geographically compatible.

## Geographic Compatibility

Auditors may work in multiple zones during a day.

The system should evaluate geographic compatibility rather than simply blocking an entire day to one zone.

Compatible locations may include:

- Same municipality
- Bordering municipalities
- Nearby municipalities
- Configured adjacent zones
- Locations within a configured travel-time threshold

## Travel Calculation

The Scheduling Engine should calculate travel requirements using a mapping/travel service when available.

The calculation should consider:

- Appointment address
- Previous appointment address
- Estimated travel time
- Configured safety buffer
- Traffic information where available
- Organization-specific minimum travel buffer

## Travel Buffer

The system must support a configurable minimum buffer between appointments.

Example:

Appointment A:

9:00 AM–10:30 AM

Estimated travel:

20 minutes

Required buffer:

10 minutes

Earliest valid Appointment B:

11:00 AM

## Travel Feasibility

An appointment must not be offered if the Auditor cannot reasonably travel from the previous appointment.

The system should calculate:

```text
Previous appointment end
+
Estimated travel time
+
Required buffer
<=
Next appointment start
