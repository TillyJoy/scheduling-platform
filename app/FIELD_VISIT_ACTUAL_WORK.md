# Field Visit and Actual Work Foundation

## Decision

The platform separates scheduled work from field execution.

The lifecycle is:

**Job → Work Order → Appointment → Field Visit → Actual Work → Completion**

An Appointment represents scheduled time and assignment. A Field Visit represents an execution occurrence tied to that appointment and work order. Actual Work records what was actually performed during or in relation to that visit.

Completing a Field Visit does **not** complete the Appointment, Work Order, or Job automatically.

## Field Visit

A Field Visit is organization-scoped and requires:

- Appointment reference
- Work Order reference
- Configurable status code
- Optional resource snapshot
- Actual start time
- Actual end time
- Completion timestamp and trusted completing user
- Organization-defined metadata

The service validates that the Appointment and Work Order belong to the same organization and that the Appointment is linked to the requested Work Order.

Scheduled start/end times remain on the Appointment. Actual start/end times remain on the Field Visit.

## Actual Work

Actual Work is a separate organization-scoped record linked to:

- Field Visit
- Work Order
- Optional Resource
- Description
- Optional actual start/end time
- Optional quantity/unit
- Organization-defined metadata

Actual Work is intentionally not the same thing as a Service Definition. It records execution evidence rather than what the organization offers.

## Return visits

A return visit should remain separately identifiable rather than overwriting the historical execution record. The existing Work Order can therefore have multiple Appointments and corresponding Field Visits. This preserves the distinction between scheduled instances and execution history.

This pattern is consistent with mature field-service systems that keep planned/scheduled times separate from actual execution times and support multiple visits against the same work requirement. OCA Field Service, for example, exposes scheduled and actual start/end fields separately, while its ecosystem includes distinct activities and timesheet extensions. See the research record for this layer before adopting any vendor-specific workflow.

## Security

Field Visit and Actual Work services require a trusted principal and explicit organization-scoped permissions. Lookups are keyed by organization plus stable identifier. Cross-organization records are not returned.

The services support optional domain-event and audit integration. Integration code is downstream of the core execution records.

## Current implementation boundary

This is an in-memory domain/service foundation consistent with the repository's current service layer. Durable persistence, mobile/offline synchronization, evidence/file storage, configurable QA/inspection workflows, and rework automation remain subsequent layers.

## Integration

Monday.com is not required. The platform can record field execution natively.

When an integration is configured, Field Visit and Actual Work events can become integration inputs. The integration adapter remains responsible for mapping platform events to external fields/statuses and for respecting configured source-of-truth/authority rules.

## Explicit non-decisions

This layer does not hard-code:

- technician terminology
- service-specific completion fields
- agency-specific statuses
- funding rules
- Monday column names
- QA rules
- rework rules

Those belong to organization configuration or later workflow layers.


## Execution foundation

The field execution foundation supports the minimum lifecycle needed to turn a scheduled appointment into recorded execution:

**scheduled → arrived → started → stopped → completed**

A visit may instead be closed as incomplete/failed with an organization-defined outcome code, reason, and status.

### Execution data

Field Visits retain:

- appointment and work-order linkage
- assigned resource snapshot derived from the appointment
- arrival timestamp
- actual start/end timestamps
- configurable status code
- notes
- structured observations
- organization-defined completion data
- completion actor/timestamp
- incomplete/failed outcome code and reason
- organization metadata

Actual Work remains a separate record tied to the Field Visit and Work Order.

### API boundary

The authenticated API exposes Field Visit creation, retrieval, listing, arrival, start, stop, completion, and incomplete closure operations, plus Actual Work creation/retrieval/listing.

All operations require a trusted authenticated principal and explicit organization-scoped permissions.

### Completion requirements

The service accepts an injected completion validator so organizations can later configure required completion information without hard-coding service-specific fields into the platform. The current foundation requires non-empty completion data.

### Attachments

No attachment/document-reference subsystem exists in the current architecture, so this foundation does not invent one. Evidence files and attachment references remain a subsequent capability.

### Downstream consumption

Field Visit lifecycle changes and Actual Work creation emit domain events through the existing domain-event service. Audit records are created for execution changes. Monday.com remains downstream of these platform events and is not part of the execution transaction.

### Current persistence boundary

The implementation remains in-memory, consistent with the repository's current service architecture. Durable persistence and transactional event/outbox coupling remain later infrastructure work.
