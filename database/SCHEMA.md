# Database Schema

The database must support multiple organizations with isolated data.

## Core Entities

- organizations
- users
- clients
- landlords
- properties
- units
- services
- funders
- eligibility
- resources
- teams
- availability
- zones
- appointments
- scheduling_holds
- notifications
- integrations
- audit_events

## Relationships

An organization may have many:

- Users
- Clients
- Landlords
- Properties
- Services
- Funders
- Resources
- Teams
- Zones
- Appointments
- Integrations

A landlord may own or manage multiple properties.

A property may contain multiple units.

A client may have relationships with multiple properties over time.

A unit may have a client associated with it.

An appointment may involve:

- One client
- One property
- One or more units
- One or more services
- One resource
- Multiple resources
- A predefined team
- A custom team

## Historical Records

Historical property, unit, service, eligibility, appointment, and funding information must not be overwritten simply because a client moves or circumstances change.

## Organization Isolation

Every organization-owned record must be associated with an organization.

Users must only be able to access records belonging to organizations they are authorized to access.

## Stable Identifiers

Entities must use stable unique identifiers.

Names, addresses, and other changeable values must not be used as primary identifiers.

## Auditability

Important changes must create audit events.

Examples include:

- Client changes
- Property changes
- Eligibility changes
- Appointment changes
- Team assignments
- User changes
- Terminology changes
- Integration changes

## Configuration

Organization-specific configuration should be stored separately from core entity records where appropriate.

This includes:

- Terminology
- Scheduling rules
- Zone definitions
- Integration settings
- Notification preferences
- Service configuration
