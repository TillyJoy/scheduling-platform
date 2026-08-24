CREATE TABLE availability (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    zone_id TEXT,
    available BOOLEAN NOT NULL DEFAULT TRUE,

    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    FOREIGN KEY (zone_id) REFERENCES zones(id)
);

CREATE TABLE scheduling_holds (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    scheduler_id TEXT NOT NULL,
    zone_id TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',

    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (scheduler_id) REFERENCES users(id),
    FOREIGN KEY (zone_id) REFERENCES zones(id)
);
