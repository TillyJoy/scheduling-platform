const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const shouldRun = process.env.DATABASE_URL && process.env.RUN_POSTGRES_TESTS === "1";

test("durable Appointment / Hold persistence is tenant-safe, auditable, transactional, and concurrency-safe", { skip: !shouldRun }, async t => {
  const { createDatabasePool, runMigrations, withTransaction } = require("../src/database");
  const { AppointmentRepository } = require("../src/repositories/appointmentRepository");
  const { SchedulingHoldRepository } = require("../src/repositories/schedulingHoldRepository");
  const { AppointmentService } = require("../src/services/appointmentService");

  const pool = createDatabasePool();
  const suffix = randomUUID();
  const orgA = `appointment-a-${suffix}`;
  const orgB = `appointment-b-${suffix}`;
  const roleName = `appointment_app_test_${suffix.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const permissions = ["appointment:create", "appointment:read", "appointment:update", "appointment:confirm", "appointment:cancel"];

  await runMigrations(pool);

  const clientA = `client-a-${suffix}`;
  const clientB = `client-b-${suffix}`;
  const propertyA = `property-a-${suffix}`;
  const propertyB = `property-b-${suffix}`;
  const unitA = `unit-a-${suffix}`;
  const unitB = `unit-b-${suffix}`;
  const jobA = `job-a-${suffix}`;
  const jobB = `job-b-${suffix}`;
  const workOrderA = `wo-a-${suffix}`;
  const workOrderB = `wo-b-${suffix}`;
  const principalA = { userId: `user-a-${suffix}`, organizationId: orgA, permissions };
  const principalB = { userId: `user-b-${suffix}`, organizationId: orgB, permissions };
  const transaction = (principal, action, work) =>
    withTransaction(pool, { organizationId: principal.organizationId, userId: principal.userId, action }, async db => {
      await db.query(`SET LOCAL ROLE "${roleName}"`);
      return work(db);
    });

  const appointmentRepository = new AppointmentRepository({ pool });
  const schedulingHoldRepository = new SchedulingHoldRepository({ pool, clock: () => now });
  let now = new Date("2026-10-01T08:00:00Z");
  const schedulingService = {
    findAvailableSlots: ({ resourceIds, startTime, endTime }) =>
      resourceIds.map(resourceId => ({ resourceId, startTime, endTime }))
  };
  const appointmentService = new AppointmentService({
    appointmentRepository,
    schedulingHoldRepository,
    schedulingService,
    transaction,
    clock: () => now
  });

  const cleanup = async () => {
    for (const organizationId of [orgA, orgB]) {
      await withTransaction(pool, { organizationId, userId: `cleanup-${suffix}`, action: "test.cleanup" }, async db => {
        await db.query(`SET LOCAL ROLE "${roleName}"`);
        await db.query("DELETE FROM appointment_history WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM appointment_resources WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM appointment_services WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM appointment_units WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM scheduling_hold_resources WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM scheduling_holds WHERE organization_id=$1", [organizationId]);
        await db.query("DELETE FROM appointments WHERE organization_id=$1", [organizationId]);
      }).catch(() => {});
    }
    await pool.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
        EXECUTE 'DROP OWNED BY "${roleName}"';
        EXECUTE 'DROP ROLE "${roleName}"';
      END IF;
    END $$;`);
    await pool.end();
  };
  t.after(cleanup);

  await pool.query("INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)", [orgA, "Appointment Test A", orgB, "Appointment Test B"]);
  await pool.query(`INSERT INTO clients(id,organization_id,first_name,last_name) VALUES ($1,$2,'A','Client'),($3,$4,'B','Client')`, [clientA, orgA, clientB, orgB]);
  await pool.query(`INSERT INTO properties(id,organization_id,address,city,state) VALUES ($1,$2,'1 Main St','Testville','MA'),($3,$4,'2 Main St','Testville','MA')`, [propertyA, orgA, propertyB, orgB]);
  await pool.query(`INSERT INTO units(id,organization_id,property_id,unit_identifier) VALUES ($1,$2,$3,'1'),($4,$5,$6,'1')`, [unitA, orgA, propertyA, unitB, orgB, propertyB]);
  await pool.query(`INSERT INTO jobs(id,organization_id,title,client_id) VALUES ($1,$2,'Job A',$3),($4,$5,'Job B',$6)`, [jobA, orgA, clientA, jobB, orgB, clientB]);
  await pool.query(`INSERT INTO work_orders(id,organization_id,job_id,number,title) VALUES ($1,$2,$3,'WO-A','Work A'),($4,$5,$6,'WO-B','Work B')`, [workOrderA, orgA, jobA, workOrderB, orgB, jobB]);
  await pool.query(`INSERT INTO resources(id,organization_id,name,resource_type) VALUES ($1,$2,'Resource A','person'),($3,$4,'Resource B','person'),($5,$6,'Resource B Only','person')`, ["resource-1", orgA, "resource-1", orgB, "resource-b-only", orgB]);

  await pool.query(`CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, clients, properties, units, jobs, work_orders, resources, appointments, appointment_units, appointment_services, appointment_resources, appointment_history, scheduling_holds, scheduling_hold_resources TO "${roleName}"`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events TO "${roleName}"`);

  const appointment = await appointmentService.create({
    principal: principalA, id: "appointment-1", clientId: clientA, propertyId: propertyA,
    workOrderId: workOrderA, teamId: "team-opaque-1", unitIds: [unitA], serviceIds: ["service-opaque-1"], memberIds: ["resource-1"],
    startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T10:00:00Z", status: "scheduled"
  });
  assert.equal(appointment.id, "appointment-1");
  assert.equal(appointment.workOrderId, workOrderA);
  assert.deepEqual(appointment.memberIds, ["resource-1"]);

  const loaded = await appointmentService.get({ principal: principalA, appointmentId: "appointment-1" });
  assert.equal(loaded.propertyId, propertyA);
  assert.equal(loaded.teamId, "team-opaque-1");
  assert.deepEqual(loaded.unitIds, [unitA]);
  assert.deepEqual(loaded.serviceIds, ["service-opaque-1"]);

  const updated = await appointmentService.update({
    principal: principalA, id: "appointment-1",
    startTime: "2026-10-01T09:30:00Z", endTime: "2026-10-01T10:30:00Z",
    status: "scheduled", rescheduleReason: "Client requested a later time"
  });
  assert.equal(updated.status, "scheduled");
  assert.equal(updated.rescheduleReason, "Client requested a later time");

  const history = await transaction(principalA, "test.history", db =>
    db.query("SELECT event_type FROM appointment_history WHERE organization_id=$1 AND appointment_id=$2 ORDER BY occurred_at, appointment_history_id", [orgA, "appointment-1"])
  );
  assert.ok(history.rows.length >= 2);
  assert.ok(history.rows.some(row => row.event_type === "rescheduled"));

  const hold = await appointmentService.createHold({
    principal: principalA, id: "hold-1", clientId: clientA, propertyId: propertyA, workOrderId: workOrderA,
    unitIds: [unitA], serviceIds: ["service-opaque-1"], memberIds: ["resource-1"],
    startTime: "2026-10-01T11:00:00Z", endTime: "2026-10-01T12:00:00Z", expiresAt: "2026-10-01T08:15:00Z"
  });
  assert.equal(hold.status, "active");
  assert.equal(hold.schedulerId, principalA.userId);

  await assert.rejects(
    () => appointmentService.create({
      principal: principalA, id: "appointment-conflict-hold", clientId: clientA, propertyId: propertyA,
      memberIds: ["resource-1"], serviceIds: ["service-opaque-1"],
      startTime: "2026-10-01T11:30:00Z", endTime: "2026-10-01T12:30:00Z"
    }),
    /held for an overlapping scheduling hold/
  );

  const confirmed = await appointmentService.confirmHold({ principal: principalA, holdId: "hold-1", status: "confirmed" });
  assert.equal(confirmed.id, "hold-1");
  assert.equal(confirmed.status, "confirmed");
  const holdAfterConfirm = await schedulingHoldRepository.get({ principal: principalA, holdId: "hold-1" });
  assert.equal(holdAfterConfirm.status, "confirmed");

  await assert.rejects(
    () => appointmentService.create({
      principal: principalA, id: "appointment-conflict", clientId: clientA, propertyId: propertyA,
      memberIds: ["resource-1"], serviceIds: ["service-opaque-1"],
      startTime: "2026-10-01T11:15:00Z", endTime: "2026-10-01T12:15:00Z"
    }),
    /already assigned to an overlapping appointment/
  );

  const holdToCancel = await appointmentService.createHold({
    principal: principalA, id: "hold-cancel", clientId: clientA, propertyId: propertyA,
    memberIds: ["resource-1"], startTime: "2026-10-01T13:00:00Z", endTime: "2026-10-01T14:00:00Z",
    expiresAt: "2026-10-01T08:20:00Z"
  });
  assert.equal((await appointmentService.cancelHold({ principal: principalA, holdId: holdToCancel.id })).status, "cancelled");

  const holdToExpire = await appointmentService.createHold({
    principal: principalA, id: "hold-expire", clientId: clientA, propertyId: propertyA,
    memberIds: ["resource-1"], startTime: "2026-10-01T14:00:00Z", endTime: "2026-10-01T15:00:00Z",
    expiresAt: "2026-10-01T08:15:00Z"
  });
  now = new Date("2026-10-01T08:30:00Z");
  const expired = await appointmentService.expireHolds({ principal: principalA });
  assert.equal(expired.find(item => item.id === holdToExpire.id).status, "expired");

  const otherTenantAppointment = await appointmentService.create({
    principal: principalB, id: "appointment-1", clientId: clientB, propertyId: propertyB,
    memberIds: ["resource-1"], serviceIds: ["service-opaque-1"],
    startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T10:00:00Z"
  });
  assert.equal(otherTenantAppointment.id, "appointment-1");
  assert.equal((await appointmentService.list({ principal: principalB })).length, 1);
  assert.equal((await appointmentService.list({ principal: principalA })).length, 2);

  await assert.rejects(
    () => appointmentService.create({
      principal: principalA, id: "cross-tenant-client", clientId: clientA, propertyId: propertyA,
      memberIds: ["resource-b-only"], serviceIds: ["service-opaque-1"],
      startTime: "2026-10-01T16:00:00Z", endTime: "2026-10-01T17:00:00Z"
    }),
    /foreign key|violates row-level security/
  );

  const isolated = await transaction(principalB, "test.rls", async db => ({
    appointments: (await db.query("SELECT id FROM appointments ORDER BY id")).rows.map(row => row.id),
    holds: (await db.query("SELECT id FROM scheduling_holds ORDER BY id")).rows.map(row => row.id)
  }));
  assert.deepEqual(isolated.appointments, ["appointment-1"]);
  assert.deepEqual(isolated.holds, []);

  const tenantAHolds = await transaction(principalA, "test.rls", async db =>
    (await db.query("SELECT id FROM scheduling_holds ORDER BY id")).rows.map(row => row.id)
  );
  assert.deepEqual(tenantAHolds, ["hold-1", "hold-cancel", "hold-expire"]);

  const audit = await transaction(principalA, "test.audit", db =>
    db.query("SELECT action, entity_type FROM audit_events WHERE organization_id=$1 AND entity_type IN ('appointment','scheduling_hold') ORDER BY created_at,id", [orgA])
  );
  assert.ok(audit.rows.some(row => row.action === "appointment.created"));
  assert.ok(audit.rows.some(row => row.action === "appointment.rescheduled"));
  assert.ok(audit.rows.some(row => row.action === "scheduling-hold.created"));
  assert.ok(audit.rows.some(row => row.action === "scheduling-hold.cancelled"));
  assert.ok(audit.rows.some(row => row.action === "scheduling-hold.confirmed"));

  await assert.rejects(
    () => transaction(principalA, "test.history-mutation", db =>
      db.query("UPDATE appointment_history SET notes='tampered' WHERE organization_id=$1", [orgA])
    ),
    /appointment history is append-only/
  );

  await assert.rejects(
    () => transaction(principalA, "test.audit-mutation", db =>
      db.query("DELETE FROM audit_events WHERE organization_id=$1", [orgA])
    ),
    /audit events are append-only/
  );

  const countsBeforeRollback = await transaction(principalA, "test.rollback-count", async db => ({
    appointments: Number((await db.query("SELECT count(*) AS count FROM appointments WHERE organization_id=$1", [orgA])).rows[0].count),
    audits: Number((await db.query("SELECT count(*) AS count FROM audit_events WHERE organization_id=$1", [orgA])).rows[0].count)
  }));

  await assert.rejects(
    () => transaction(principalA, "test.rollback", async db => {
      await db.query(
        `INSERT INTO appointments(id,organization_id,client_id,property_id,start_time,end_time,status_code)
         VALUES ('rollback-appointment',$1,$2,$3,'2026-10-01T18:00:00Z','2026-10-01T19:00:00Z','scheduled')`,
        [orgA, clientA, propertyA]
      );
      await db.query(
        `INSERT INTO audit_events(id,organization_id,user_id,action,entity_type,entity_id)
         VALUES (gen_random_uuid()::text,$1,$2,'appointment.created','appointment','rollback-appointment')`,
        [orgA, principalA.userId]
      );
      throw new Error("force rollback");
    }),
    /force rollback/
  );

  const countsAfterRollback = await transaction(principalA, "test.rollback-count-after", async db => ({
    appointments: Number((await db.query("SELECT count(*) AS count FROM appointments WHERE organization_id=$1", [orgA])).rows[0].count),
    audits: Number((await db.query("SELECT count(*) AS count FROM audit_events WHERE organization_id=$1", [orgA])).rows[0].count)
  }));
  assert.deepEqual(countsAfterRollback, countsBeforeRollback);

  const concurrent = await Promise.allSettled([
    appointmentService.create({
      principal: principalA, id: "concurrent-a", clientId: clientA, propertyId: propertyA,
      memberIds: ["resource-1"], serviceIds: ["service-opaque-1"],
      startTime: "2026-10-01T20:00:00Z", endTime: "2026-10-01T21:00:00Z"
    }),
    appointmentService.create({
      principal: principalA, id: "concurrent-b", clientId: clientA, propertyId: propertyA,
      memberIds: ["resource-1"], serviceIds: ["service-opaque-1"],
      startTime: "2026-10-01T20:30:00Z", endTime: "2026-10-01T21:30:00Z"
    })
  ]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
  assert.match(concurrent.find(result => result.status === "rejected").reason.message, /overlapping appointment/);

  const schema = await pool.query(`SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN (
      'appointments','appointment_units','appointment_services','appointment_resources',
      'appointment_history','scheduling_holds','scheduling_hold_resources'
    )
    ORDER BY table_name, ordinal_position`);
  assert.ok(schema.rows.some(row => row.table_name === "appointments" && row.column_name === "work_order_id"));
  assert.ok(schema.rows.some(row => row.table_name === "appointment_services" && row.column_name === "service_ref"));
  assert.ok(schema.rows.some(row => row.table_name === "appointment_resources" && row.column_name === "resource_id"));
  assert.ok(schema.rows.some(row => row.table_name === "scheduling_holds" && row.column_name === "expires_at"));
});
