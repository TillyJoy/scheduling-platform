# Organization Terminology and Glossary

The platform must allow each organization to define the terminology displayed throughout the application.

Internal system concepts should remain stable while displayed terminology may be customized by each organization.

## Custom Labels

Organizations may rename system concepts.

Examples:

- Auditor → Technician
- Scheduler → Coordinator
- Client → Customer
- Property → Site
- Contractor → Vendor
- Zone → Service Area

Custom labels must be used consistently throughout the organization's interfaces.

## Definitions

Organizations may provide their own definitions for system concepts.

A definition may include:

- Display name
- Description
- Optional internal guidance
- Singular form
- Plural form

## Glossary

The application should provide an administrative glossary.

Authorized administrators can:

- View terms
- Edit terms
- Add organization-specific terms
- Define terminology
- Restore default terminology

## Default Terminology

The platform should provide sensible default terminology.

Organizations may change the displayed terminology without changing the underlying system architecture.

## Internal Identifiers

Custom terminology must not change stable internal identifiers.

For example, the internal concept may remain:

`auditor`

while an organization displays:

`technician`

## Role Terminology

Role names should be configurable.

Examples:

- Auditor
- Technician
- Inspector
- Assessor
- Crew Lead

The underlying permissions remain independent from the displayed name.

## Service Terminology

Organizations may define their own service names and descriptions.

## Zone Terminology

The organization may rename "Zone" to another term.

Examples:

- Service Area
- Territory
- District
- Region
- Route Area

## Zone Definition

The system must not assume that a zone is defined by a town.

Organizations may define zones using:

- Town
- City
- ZIP code
- County
- Geographic boundary
- Custom service area
- Manual assignment
- Combination of geographic criteria

## Geographic Rules

Organizations may configure rules that determine whether an address belongs to a geographic area.

## Manual Overrides

Authorized administrators should be able to manually assign or override a geographic assignment when necessary.

## Scheduling Impact

Zone terminology and definitions must integrate with scheduling.

The Scheduling Engine should use the organization's configured geographic rules rather than assuming a specific definition of a zone.

## User Interface

Customized terminology should appear consistently in:

- Web application
- Mobile application
- Client portal where appropriate
- Notifications
- Reports
- Dashboards
- Calendar interfaces

## External Integrations

Internal identifiers should be mapped to external terminology when integrating with systems such as Monday.com.

External field names should not determine the platform's internal terminology.

## Organization Isolation

Terminology is organization-specific.

One organization may use:

`Auditor`

while another uses:

`Technician`

without affecting other organizations.

## Permissions

Only authorized administrators may change organization terminology.

Changes should be recorded in the Audit Log.

## Localization

The terminology system should be designed so that future language translation can be supported.

The platform should eventually allow organizations to select their preferred application language.

Custom terminology should be able to exist within each supported language.

## Future Translation

The architecture should support:

- Multiple languages
- Organization-specific terminology
- Language-specific definitions
- Translated system messages
- Translated notifications

## Glossary Search

Users should eventually be able to access a glossary or help function showing organization-defined terminology and definitions.

## Implementation Principle

Business logic must use stable internal concepts.

Displayed terminology must be configurable independently.

Changing the word used for a concept must never require rewriting the Scheduling Engine.
