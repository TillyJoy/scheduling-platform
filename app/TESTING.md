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

## Cross-Platform Browser MVP Verification

The MVP is a single responsive browser-based application intended to support Chromebook, Windows PC, macOS, Android phone/tablet, iPhone, and iPad. Verification must evaluate the same deployed web application rather than separate platform-specific applications.

### Acceptance criteria

"Browser MVP verified" requires:

1. The deployed application is reachable through a normal supported browser.
2. Production authentication works.
3. The core MVP workflow works.
4. The application is responsive on desktop and mobile/tablet form factors.
5. The practical workflow has been interactively verified on representative supported platforms:
   - Chromebook
   - Windows PC
   - macOS
   - Android
   - iPhone
   - iPad
6. No platform-specific blocker prevents normal MVP use.
7. Interactive browser verification is distinguished from HTTP/API smoke testing.

The eventual interactive workflow should cover, as applicable:

**Open deployed application → authenticate → reach application → load organization/user context → access jobs/work orders → access resources/scheduling data → select date/time → view availability → create appointment → view resulting appointment → navigate the application → verify responsive layout and interaction.**

Touch interaction must be included on touch platforms where applicable.

No platform may be marked VERIFIED without actual interactive verification evidence for that platform. This testing requirement does not establish that any platform is currently verified. Production deployment, authentication implementation, feature completeness, and interactive browser verification remain separate status dimensions.

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
