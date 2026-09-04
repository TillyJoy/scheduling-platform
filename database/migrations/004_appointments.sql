CREATE TABLE appointments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE TABLE appointment_units (
    appointment_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,

    PRIMARY KEY (appointment_id, unit_id),

    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (unit_id) REFERENCES units(id)
);

CREATE TABLE appointment_services (
    appointment_id TEXT NOT NULL,
    service_id TEXT NOT NULL,

    PRIMARY KEY (appointment_id, service_id),

    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE appointment_resources (
    appointment_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,

    PRIMARY KEY (appointment_id, resource_id),

    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id)
);

CREATE TABLE appointment_teams (
    appointment_id TEXT NOT NULL,
    team_id TEXT NOT NULL,

    PRIMARY KEY (appointment_id, team_id),

    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (team_id) REFERENCES teams(id)
);
