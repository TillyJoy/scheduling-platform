# Project Structure

The repository should separate documentation, application code, shared code, infrastructure, and tests.

The initial project should remain understandable to a developer who joins the project later.

## Top-Level Structure

The intended structure is:

```text
scheduling-platform/
│
├── README.md
│
├── docs/
│   ├── REQUIREMENTS.md
│   ├── DATA_MODEL.md
│   └── SCHEDULING_ENGINE.md
│
├── app/
│   ├── config.md
│   ├── USER_ROLES.md
│   ├── AUDIT_LOG.md
│   ├── MONDAY_INTEGRATION.md
│   ├── CLIENT_PORTAL.md
│   ├── AUDITOR_MOBILE.md
│   ├── CALENDAR_ROUTING.md
│   ├── DATABASE.md
│   ├── UI_SCREENS.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── REPORTING.md
│   ├── ARCHITECTURE.md
│   └── PROJECT_STRUCTURE.md
│
├── frontend/
│
├── backend/
│
├── shared/
│
├── database/
│
├── integrations/
│
├── mobile/
│
├── infrastructure/
│
└── tests/
