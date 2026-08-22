# Security Requirements

Security must be treated as a core system requirement rather than an optional feature.

The platform should be designed for nonprofit agencies handling sensitive client, funding, scheduling, and operational information.

## Least Privilege

Users must receive only the permissions required for their role.

Permissions must be enforced by the backend.

## Organization Isolation

Each organization's data must be isolated.

Users must not be able to access another organization's:

- Clients
- Properties
- Units
- Appointments
- Staff
- Funding information
- Audit logs
- Configuration

## Department Isolation

Organizations may optionally restrict users to specific departments.

Department restrictions must be enforced by the backend.

## Authentication

The system should support secure authentication.

Potential methods include:

- Email/password
- Single sign-on
- Microsoft authentication
- Google authentication
- Multi-factor authentication

Authentication methods should be configurable by organization.

## Multi-Factor Authentication

Administrators should be able to require MFA.

MFA requirements may differ by role.

Administrative accounts should strongly support MFA.

## Session Security

Sessions should:

- Expire after configurable inactivity
- Support secure logout
- Support remote session revocation
- Use secure tokens
- Prevent token reuse where appropriate

## Password Security

Passwords must never be stored in plain text.

The system should use modern password hashing.

## API Security

All API endpoints must enforce authentication and authorization.

Frontend restrictions must never be treated as sufficient security.

## Encryption

Sensitive information should be encrypted:

- In transit
- At rest where appropriate
- In backups where appropriate

TLS should be required for network communication.

## Secrets

The following must never be committed to GitHub:

- Passwords
- API keys
- OAuth secrets
- Access tokens
- Database passwords
- Encryption keys

Secrets must use secure secret-management mechanisms.

## Monday.com Credentials

Monday.com credentials must be stored securely.

They must never be embedded in:

- Frontend code
- Mobile applications
- Public repositories
- Configuration files committed to Git

## Outlook Credentials

Microsoft authentication credentials and tokens must be securely stored.

The system should request only required permissions.

## Mobile Security

The mobile application should use:

- Secure local storage
- Encrypted sensitive data
- Device authentication where appropriate
- Secure API communication
- Remote session revocation

## Offline Data

Offline Auditor data must be minimized.

Only necessary information should be stored locally.

Offline data should be encrypted.

## Lost Devices

Administrators should be able to revoke access from a lost or compromised device.

## Client Scheduling Links

Client scheduling links must:

- Use unpredictable tokens
- Expire according to configuration
- Be revocable
- Avoid exposing internal record IDs
- Provide only the necessary scheduling information

## Client Privacy

Clients must only access their own information.

Client-facing interfaces must never expose:

- Other clients
- Internal notes
- Internal eligibility details unless explicitly authorized
- Internal audit logs
- Staff information not necessary for scheduling
- Funding information not intended for the client

## Minimum Necessary Information

Every interface should display only the information necessary for the user's task.

This applies especially to:

- Auditors
- Contractors
- Clients
- Schedulers
- Mobile devices
- Voice mode

## Voice Mode

Driving mode must minimize spoken sensitive information.

Voice mode should not unnecessarily announce:

- Client names
- Eligibility details
- Funding information
- Internal notes
- Sensitive client information

The system may provide:

- Appointment time
- Address
- Unit information when appropriate
- Scheduled services

## Audit Logging

Security-relevant actions must be recorded.

Examples include:

- Login
- Failed login
- Permission changes
- Account changes
- API credential changes
- Integration changes
- Data access where appropriate
- Administrative changes

## Audit Protection

Normal users must not be able to alter or delete audit records.

Audit records should be protected against unauthorized modification.

## Administrative Access

Administrative permissions must be separated by responsibility where practical.

IT administrators should not automatically receive unrestricted operational client access.

## Integration Security

External integrations must use least-privilege permissions.

Each integration should have only the permissions it needs.

## Webhook Security

Inbound webhooks should be validated before processing.

Invalid or suspicious webhook requests should be rejected and logged.

## API Rate Limiting

The API should use rate limiting to reduce abuse and accidental overload.

## Input Validation

All externally supplied information must be validated.

This includes:

- Client information
- API requests
- Webhook data
- Scheduling requests
- File uploads
- Integration data

## Authorization

Every protected operation must verify that the user is authorized to perform it.

Changing a URL or API parameter must never allow unauthorized access.

## Data Backup

The production database should have secure backups.

Backups should be:

- Encrypted
- Access controlled
- Monitored
- Tested for restoration

## Disaster Recovery

The platform should have documented procedures for:

- Database failure
- Application failure
- Integration failure
- Security incident
- Data corruption
- Service outage

## Availability

The system should be designed so that temporary external-service failures do not unnecessarily prevent internal scheduling.

For example, a temporary Monday.com outage should not make the internal calendar unusable.

## Integration Failure

Integration failures must:

- Be logged
- Be visible to authorized administrators
- Retry when appropriate
- Avoid duplicate records
- Avoid silent data loss

## Data Retention

Organizations must be able to configure data-retention policies subject to applicable requirements.

Historical scheduling information should be retained when necessary.

## Archiving

Records should generally be archived rather than permanently deleted when historical records are required.

## Security Monitoring

The system should support monitoring for:

- Repeated failed logins
- Suspicious API activity
- Unauthorized access attempts
- Integration failures
- Unusual administrative activity

## Security Notifications

Authorized administrators may receive alerts for significant security events.

## Software Updates

The platform should support regular security updates to:

- Backend dependencies
- Frontend dependencies
- Mobile dependencies
- Operating environment
- Database components

## Dependency Security

Third-party dependencies should be monitored for known security vulnerabilities.

## Development Security

Developers must not use real client information in development or testing environments unless explicitly authorized and appropriately protected.

Test environments should use synthetic or de-identified data whenever possible.

## Production Access

Production access should be restricted.

Developer access to production client information should not be automatic.

## Security Review

Before production deployment, the application should undergo an appropriate security review.

The review should include:

- Authentication
- Authorization
- Data isolation
- API security
- Integration security
- Mobile security
- Audit logging
- Backup and recovery
- Vulnerability management

## Future Compliance

The architecture should allow the organization to implement additional security or compliance requirements as needed.

Potential future requirements may include:

- Formal security assessments
- Penetration testing
- Vendor security reviews
- Security questionnaires
- Funder-specific requirements
- State or federal requirements
