# Dynamic Schedule Movement

The Scheduler calendar must visually represent appointment time, travel time, availability, and schedule changes.

## Travel Blocks

Travel time should appear as a distinct visual block between appointments.

Travel blocks must show:

- Estimated travel duration
- Origin
- Destination
- Whether the time is calculated or manually adjusted

## Dynamic Recalculation

When a Scheduler changes:

- Travel time
- Appointment duration
- Appointment time
- Assigned resource
- Assigned team
- Resource availability
- Team availability
- Zone
- Service requirements

the system must recalculate affected appointments.

## Schedule Ripple

The Scheduler may choose to enable schedule ripple.

When enabled, a change may automatically move affected appointments forward or backward while respecting:

- Availability
- Travel time
- Appointment duration
- Resource assignments
- Team assignments
- Service rules
- Organization scheduling rules

## Ripple Preview

Before applying a change that affects multiple appointments, the system should show a preview.

The preview should identify:

- Appointment being changed
- Appointments that will move
- Original times
- New times
- Reason for movement
- Any conflicts created

## Conflict Protection

The system must not silently create impossible schedules.

If an appointment cannot be moved without creating a conflict, the Scheduler must be warned.

## Manual Override

Authorized Schedulers may manually override calculated travel time or schedule movement.

Manual overrides must be clearly identified.

## Undo

Schedule changes should support undo where technically practical.

## Audit

Schedule movement must be recorded in the Audit Log.

The record should identify:

- User
- Appointment
- Original time
- New time
- Triggering change
- Whether ripple was enabled
- Manual overrides
- Timestamp

## Visual Calendar Requirement

The calendar must make it immediately understandable:

- Where an appointment begins and ends
- How much travel time is required
- Which appointments are affected by a change
- Where conflicts exist
- Which times are calculated
- Which times were manually overridden

The visual design should prioritize clarity over displaying excessive information.

## Future Optimization

The scheduling engine should eventually support intelligent schedule optimization while preserving Scheduler control.

Potential optimization factors include:

- Travel distance
- Travel duration
- Zone
- Priority
- Resource availability
- Team composition
- Appointment duration
- Service requirements
- Client preferences
- Organization rules
