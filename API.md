# API Architecture

The Scheduling Platform must expose a secure API so that the web application, mobile applications, external systems, and future integrations can communicate with the platform.

## Core Principle

The API must be independent from the user interface.

The Scheduling Engine and database must not depend on a specific frontend.

This allows the same backend to support:

- Web application
- Android application
- iOS application
- Future desktop application
- Monday.com
- Outlook
- Other external systems
- Future customer integrations

## API Security

All API access must require appropriate authentication and authorization.

The API must enforce:

- User permissions
- Organization isolation
- Department permissions
- Role permissions
- Resource permissions

The API must never rely on frontend restrictions alone.

## Organization Isolation

Every request must be evaluated against the authenticated user's organization.

A user must not be able to access another organization's data by changing an ID or request parameter.

## API Versioning

The API should be versioned.

Example:

```text
/api/v1/
