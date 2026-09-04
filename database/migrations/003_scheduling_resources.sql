CREATE TABLE resources (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE team_members (
    team_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,

    PRIMARY KEY (team_id, resource_id),

    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id)
);

CREATE TABLE zones (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    definition_type TEXT NOT NULL DEFAULT 'custom',
    definition TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
