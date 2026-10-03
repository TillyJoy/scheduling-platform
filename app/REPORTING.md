# Reporting and Dashboards

The platform should provide configurable reporting for Schedulers, Auditors, Department Managers, Organization Administrators, and authorized IT users.

Reports must respect organization, department, and role permissions.

## Dashboard Principles

Dashboards should provide useful operational information without exposing unnecessary client information.

Users should be able to filter reports by:

- Organization
- Department
- Date range
- Zone
- Service
- Funder
- Auditor
- Contractor
- Appointment status
- Scheduling status

## Scheduler Dashboard

The Scheduler dashboard may display:

- Clients awaiting scheduling
- Clients currently being scheduled
- Scheduling holds
- Appointments scheduled today
- Reschedules
- Cancellations
- No-shows
- Auditor alerts
- Client follow-up requests
- Average time to schedule
- Scheduling volume

## Scheduling Metrics

The system should support metrics such as:

- Number of clients scheduled
- Number awaiting scheduling
- Average days waiting
- Average time from ready-to-schedule to appointment
- Number of cancellations
- Number of reschedules
- Number of no-shows
- Number of declined services
- Number of scheduling attempts
- Number of appointments completed

## Auditor Metrics

Authorized managers may view:

- Appointments completed
- Appointments cancelled
- No-shows
- Services completed
- Services partially completed
- Additional services identified
- Client interest in additional services
- Average appointment duration
- Scheduled versus actual duration
- Travel time
- Number of appointments per day

Reports should not be designed primarily as employee surveillance.

The organization should be able to configure which metrics are visible to managers.

## Geographic Reports

The system should support geographic analysis including:

- Appointments by zone
- Appointments by municipality
- Auditor travel distance
- Estimated travel time
- Actual travel time where available
- Appointments by geographic area
- Scheduling efficiency by zone

## Travel Efficiency

The system should support analysis of:

- Average travel time
- Average distance between appointments
- Appointments per zone per day
- Cross-zone appointments
- Potentially avoidable travel
- Border-zone scheduling

## Service Reports

Reports may include:

- Appointments by service
- Services completed
- Services declined
- Services cancelled
- Services added after assessment
- Service combinations
- Average duration by service
- Average duration by service combination

## Funder Reports

Reports should support:

- Appointments by funder
- Services by funder
- Funding combinations
- Funder-specific appointment duration
- Funder-specific service volume
- Eligibility by funder
- Service completion by funder

The system should preserve the actual funding configuration applicable at the time of the appointment.

## Multi-Unit Reports

Reports should support:

- Properties by unit count
- Eligible units
- Ineligible units
- Services by unit
- Property-level eligibility
- Unit-level eligibility
- Fifty-percent rule outcomes where applicable
- Selected-unit appointments
- Whole-property appointments

## Contractor Reports

Authorized users may view:

- Contractor appointments
- Services performed
- Geographic coverage
- Availability
- Cancellations
- Reschedules
- Contractor utilization

## Client Communication Reports

Reports may include:

- Scheduling links sent
- Email delivery
- SMS delivery
- Failed messages
- Client self-scheduled appointments
- Client cancellations
- Client reschedules
- Client responses

## Integration Reports

The system should report on:

- Monday.com synchronization
- Outlook synchronization
- SMS provider status
- Email provider status
- Mapping provider status
- Failed synchronization
- Pending synchronization
- Webhook failures

## Monday.com Reconciliation

Authorized users should be able to identify records where:

- Scheduling Platform differs from Monday.com
- A synchronization failed
- A record is missing
- A field could not be updated
- A conflict requires review

## Audit Reports

Authorized administrators may report on:

- User activity
- Administrative changes
- Scheduling changes
- Eligibility changes
- Integration changes
- Security events

Audit reports must respect audit-log permissions.

## Charts and Graphs

The reporting system should eventually support visualizations such as:

### Bar Charts

Useful for:

- Appointments by service
- Appointments by Auditor
- Appointments by zone
- Appointments by month

### Line Charts

Useful for:

- Scheduling volume over time
- Average wait time
- Completed appointments over time
- Cancellation trends

### Pie or Donut Charts

Useful for:

- Appointment status
- Service distribution
- Scheduling outcomes

These should be used selectively rather than for every metric.

## Tables

Every dashboard visualization should have an underlying table or data view where practical.

Users should be able to inspect the actual records represented by a chart.

## Filters

Reports should support interactive filtering.

Changing a filter should update associated charts and tables.

## Drill-Down

Authorized users should be able to select a metric and view the underlying records.

Example:

A manager selects:

`27 No-Shows`

The system can display the appointments represented by those 27 records.

## Export

Authorized users should be able to export appropriate reports.

Potential formats:

- CSV
- Excel
- PDF

Export permissions must be configurable.

## Scheduled Reports

The system should eventually support scheduled reports.

Examples:

- Weekly scheduling report
- Monthly funder report
- Daily appointment report
- Weekly integration report

Reports may be delivered by:

- Email
- Secure application notification

## Report Builder

The architecture should eventually allow authorized administrators to create custom reports using configured fields.

The report builder must respect permissions.

## Privacy

Reports must not expose unnecessary client information.

Client names, phone numbers, emails, and other sensitive information should only appear when required and authorized.

## Historical Reporting

Historical reports must use historical data.

Changes to current configuration must not rewrite historical reporting results.

## Performance

Large reports should be generated efficiently.

Long-running reports may run asynchronously rather than blocking the application.

## Future Analytics / Read-Layer Architecture

High-volume reporting and analytics should not necessarily query transactional operational tables directly for every dashboard, metric, or analytical workload.

The future architecture may distinguish between:

`Operational transactional data → analytics/reporting read layer → dashboards and high-volume analytics`

This is a future architectural capability, not an immediate implementation requirement. The existing transactional architecture remains authoritative and unchanged.

As scale and workload characteristics justify it, the platform may introduce read-optimized, pre-aggregated, replicated, cached, or otherwise analytical structures to support reporting and analytics. A separate analytics database or read model is not required immediately and should only be introduced when the operational and performance requirements demonstrate a need.

Any future read-layer implementation must:

- Preserve organization and tenant isolation.
- Enforce the same applicable permissions and access boundaries as the authoritative operational data.
- Preserve privacy and minimum-necessary-data principles.
- Maintain auditability for relevant access and administrative operations.
- Preserve historical reporting accuracy and avoid rewriting historical results when current configuration changes.
- Maintain a clear relationship to authoritative operational records and defined consistency expectations.
- Avoid making analytical structures an independent source of truth for transactional operations.

The existing asynchronous report-generation approach remains valid. Future read-layer structures may complement asynchronous processing rather than replace it.

No specific analytics database, read model, schema, API, synchronization mechanism, or implementation pattern is mandated by this architectural consideration.

## Future Analytics

The architecture should allow future analytics such as:

- Predicted scheduling demand
- Suggested Auditor assignments
- Travel optimization
- Appointment duration prediction
- No-show trends
- Workload forecasting
- Zone demand forecasting


## Customer Survey Reporting

Future survey reporting and analytics may include authorized analysis of:

- Response rates
- Ratings
- Comments
- Survey completion
- Trends over time
- Results by service
- Results by appointment or work order where permitted
- Results by resource/contractor where permitted

Survey reporting must inherit the survey's privacy, anonymity, organization, department, role, and export permissions.

Anonymous survey responses must not be exposed through drill-downs, exports, filters, or derived analytics in a way that defeats the configured anonymity policy.

Survey analytics should use durable survey response records as source data and must not require surveys to be part of the core scheduling workflow.

