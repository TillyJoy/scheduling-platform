# Release Management

The product must support centralized releases without requiring organizations to install updates manually.

## Application Versioning

Every release must have a unique application version.

The current version must be visible to administrators.

## Centralized Deployment

A new release should be deployed once and become available to organizations through the central platform.

## Feature Flags

Features may be controlled through feature flags.

Feature flags may support:

- Gradual rollout
- Testing
- Emergency disabling
- Plan-based features
- Organization configuration

## Safe Rollouts

New releases should be capable of controlled rollout.

The system should allow problematic features to be disabled without requiring a full application rollback where practical.

## Database Changes

Database migrations must be versioned and coordinated with application releases.

## Backward Compatibility

Releases should preserve compatibility with existing organization data.

## Release Diagnostics

System Health should display the application and database versions.

## Rollback

The deployment architecture should support safe rollback where practical.

Rollback procedures must protect customer data.

## Product Owner Independence

Organizations must not need to manually update or reinstall the application.
