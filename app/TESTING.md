# Testing Requirements

The platform must be tested throughout development.

## Unit Testing

Test individual functions and business rules.

Important areas include:

- Eligibility calculations
- Service duration
- Funding rules
- Priority sorting
- Zone rules
- Travel calculations
- Appointment conflict detection
- Scheduling holds
- Status changes

## Scheduling Engine Testing

Test combinations of:

- Services
- Units
- Properties
- Auditors
- Contractors
- Zones
- Availability
- Travel time
- Funding
- Priority

The engine must not offer appointments that violate configured rules.

## Multi-Unit Testing

Test:

- Single-unit properties
- Multi-unit properties
- Selected-unit scheduling
- Whole-property scheduling
- Different eligibility by unit
- 50% eligibility rules
- Different funding by unit

## Integration Testing

Test:

- Monday.com → Scheduling Platform
- Scheduling Platform → Monday.com
- Outlook → Scheduling Platform
- Scheduling Platform → Outlook
- SMS
- Email
- Mapping services

## Synchronization Testing

Test:

- Successful synchronization
- Failed synchronization
- Duplicate events
- Conflicting changes
- Retry
- Offline changes
- Reconnection

## Permission Testing

Verify that users cannot access information outside their authorized:

- Organization
- Department
- Role
- Records

## Mobile Testing

Test on:

- Android
- iOS
- Mobile browsers
- Offline mode
- Reconnection
- Push notifications
- Widget actions
- Driving mode

## Cross-Platform MVP Client Verification

The MVP has two client surfaces sharing the same backend/API and authoritative data model: one responsive web application for Chromebook, Windows PC, and macOS, plus functional native/mobile applications for Android phone/tablet, iPhone, and iPad.

### Acceptance criteria

"Cross-platform MVP verified" requires:

1. The deployed web application is reachable through a normal supported browser on Chromebook, Windows PC, and macOS.
2. Production authentication works for the applicable client surfaces.
3. The core MVP workflow works through the applicable client surface.
4. The web application is responsive and usable on desktop form factors.
5. Functional native/mobile clients exist and are usable on Android phone/tablet, iPhone, and iPad.
6. The practical MVP workflow has been interactively verified on each required platform/client surface.
7. Native/mobile clients use the shared backend/API and authoritative data model rather than separate business-rule implementations.
8. No platform-specific blocker prevents normal MVP use.
9. Interactive client verification is distinguished from HTTP/API smoke testing.

The eventual verification scope should cover, as applicable:

- **Chromebook / Windows PC / macOS:** open deployed web application → authenticate → reach application → load organization/user context → access jobs/work orders → access resources/scheduling data → select date/time → view availability → create appointment → view resulting appointment → navigate the application → verify responsive layout and interaction.
- **Android / iPhone / iPad:** launch native/mobile application → authenticate → reach application → load organization/user context → access jobs/work orders → access resources/scheduling data → select date/time → view availability → create appointment → view resulting appointment → navigate the application → verify touch interaction and applicable mobile behavior.

No platform may be marked VERIFIED without actual interactive evidence for that platform. This testing requirement does not establish that any platform is currently verified. Production deployment, authentication implementation, native/mobile client implementation, feature completeness, and platform verification remain separate status dimensions.

## Client Portal Testing

Test:

- Scheduling
- Rescheduling
- Cancellation
- Notes
- Expired links
- Invalid links

## Calendar Testing

Test:

- Auditor conflicts
- Contractor conflicts
- Travel time
- Buffer time
- Zone compatibility
- Scheduling holds
- Concurrent Schedulers

## Notification Testing

Test:

- Client confirmations
- Client cancellations
- Client rescheduling
- Auditor alerts
- Scheduler alerts
- Failed notifications

## Security Testing

Test:

- Authentication
- Authorization
- Organization isolation
- API security
- Session security
- Invalid requests
- Secret handling

## Regression Testing

Previously working functionality must be retested after significant changes.

## Production Data

Real client information must not be used for ordinary development or testing.

## Automated Testing

Important business rules should eventually have automated tests that run before production deployment.
