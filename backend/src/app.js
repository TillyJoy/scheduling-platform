const fs = require("node:fs");
const path = require("node:path");
const { SchedulingService } = require("./services/schedulingService");
const { AppointmentService } = require("./services/appointmentService");
const { AuthenticationService } = require("./services/authenticationService");
const { Resource } = require("./models/resource");
const { Job } = require("./models/job");
const { JobService } = require("./services/jobService");
const { WorkOrderService } = require("./services/workOrderService");
const { FieldVisitService } = require("./services/fieldVisitService");
const { ActualWorkService } = require("./services/actualWorkService");
const { DomainEventService } = require("./services/domainEventService");
const { FieldExecutionSyncService } = require("./services/fieldExecutionSyncService");
const { FieldVisitRepository } = require("./repositories/fieldVisitRepository");
const { ActualWorkRepository } = require("./repositories/actualWorkRepository");
const { FieldExecutionOperationRepository } = require("./repositories/fieldExecutionOperationRepository");
const { JobRepository } = require("./repositories/jobRepository");
const { WorkOrderRepository } = require("./repositories/workOrderRepository");
const { ResourceRepository } = require("./repositories/resourceRepository");
const { QualificationRepository } = require("./repositories/qualificationRepository");
const { ResourceQualificationRepository } = require("./repositories/resourceQualificationRepository");
const { AvailabilityRepository } = require("./repositories/availabilityRepository");
const { AppointmentRepository } = require("./repositories/appointmentRepository");
const { SchedulingHoldRepository } = require("./repositories/schedulingHoldRepository");
const { AssignmentRepository } = require("./repositories/assignmentRepository");
const { ResourceService } = require("./services/resourceService");
const { QualificationService } = require("./services/qualificationService");
const { ResourceQualificationService } = require("./services/resourceQualificationService");
const { AvailabilityService } = require("./services/availabilityService");
const { StatusConfigurationService } = require("./services/statusConfigurationService");
const { AssignmentService } = require("./services/assignmentService");
const { withTransaction } = require("./database");

const MAX_BODY_BYTES = 1024 * 1024;
const FRONTEND_FILES = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
  "/auth.js": { file: "auth.js", contentType: "text/javascript; charset=utf-8" },
  "/appShell.js": { file: "appShell.js", contentType: "text/javascript; charset=utf-8" }
};
const FRONTEND_DIR = path.resolve(__dirname, "../../frontend/src");

function createAppState(seed = {}) {
  const resources = seed.resources || [new Resource({
    id: "auditor-1",
    name: "Demo Auditor",
    role: "auditor",
    qualifications: ["AMP", "WX", "ASHP", "HS"]
  })];
  const demoAvailability = !seed.availabilities;
  const availabilities = seed.availabilities || [];
  const assignments = seed.assignments || [];
  const holds = seed.holds || [];
  const appointments = seed.appointments || [];
  const workOrders = seed.workOrders || [];
  const fieldVisits = seed.fieldVisits || [];
  const actualWork = seed.actualWork || [];
  const auditEvents = seed.auditEvents || [];
  const domainEvents = seed.domainEvents || [];
  const offlineOperations = seed.offlineOperations || new Map();
  const jobs = seed.jobs || [new Job({
    id: "job-1",
    organizationId: "demo-org",
    title: "Demo Client — 123 Main St",
    clientId: "client-1",
    serviceIds: ["AMP", "WX"],
    statusCode: "ready_to_schedule",
    metadata: { propertyId: "property-1" }
  })];

  const appointmentStore = new Map(
    appointments.map(appointment => [
      JSON.stringify([appointment.organizationId, appointment.id]),
      appointment
    ])
  );
  const jobStore = new Map(jobs.map(job => [JSON.stringify([job.organizationId, job.id]), job]));
  const workOrderStore = new Map(workOrders.map(order => [JSON.stringify([order.organizationId, order.id]), order]));
  const domainEventService = new DomainEventService({ eventStore: domainEvents, auditStore: auditEvents });
  const databasePool = seed.databasePool || null;
  const statusConfigurationService = seed.statusConfigurationService || new StatusConfigurationService({
    statusStore: seed.statusStore || new Map(),
    auditStore: auditEvents
  });
  const transaction = databasePool
    ? (principal, action, work) => withTransaction(databasePool, { organizationId: principal.organizationId, userId: principal.userId, action }, work)
    : null;
  const jobRepository = databasePool ? new JobRepository({ pool: databasePool }) : null;
  const workOrderRepository = databasePool ? new WorkOrderRepository({ pool: databasePool }) : null;
  const resourceRepository = databasePool ? new ResourceRepository({ pool: databasePool }) : null;
  const qualificationRepository = databasePool ? new QualificationRepository({ pool: databasePool }) : null;
  const resourceQualificationRepository = databasePool ? new ResourceQualificationRepository({ pool: databasePool }) : null;
  const availabilityRepository = databasePool ? new AvailabilityRepository({ pool: databasePool }) : null;
  const appointmentRepository = databasePool ? new AppointmentRepository({ pool: databasePool }) : null;
  const schedulingHoldRepository = databasePool ? new SchedulingHoldRepository({ pool: databasePool }) : null;
  const assignmentRepository = databasePool ? new AssignmentRepository({ pool: databasePool }) : null;
  const resourceStore = new Map(resources.map(resource => [JSON.stringify([resource.organizationId || "demo-org", resource.id]), resource]));
  const qualificationStore = new Map();
  const resourceQualificationStore = new Map();
  const availabilityStore = new Map(
    availabilities.filter(availability => availability.id).map(availability => [
      JSON.stringify([availability.organizationId || "demo-org", availability.id]),
      availability
    ])
  );
  const jobService = new JobService({ jobStore, jobRepository, transaction });
  const workOrderService = new WorkOrderService({ workOrderStore, workOrderRepository, transaction, jobService });
  const resourceService = new ResourceService({ resourceStore, resourceRepository, transaction });
  const qualificationService = new QualificationService({ qualificationStore, qualificationRepository, transaction });
  const resourceQualificationService = new ResourceQualificationService({
    resourceQualificationStore,
    resourceQualificationRepository,
    resourceRepository,
    qualificationRepository,
    transaction
  });
  const availabilityService = new AvailabilityService({
    availabilityStore,
    availabilityRepository,
    resourceRepository,
    transaction
  });
  const assignmentStatusResolver = ({ organizationId, entityType, statusCode }) => {
    if (!organizationId || !entityType || !statusCode) return null;
    return statusConfigurationService.statusStore.get(
      [organizationId, entityType, statusCode].join(":")
    ) || null;
  };
  const assignmentService = new AssignmentService({
    assignmentStore: new Map(assignments.map(assignment => [
      JSON.stringify([assignment.organizationId || "demo-org", assignment.id]),
      assignment
    ])),
    assignmentRepository,
    resourceRepository,
    jobRepository,
    workOrderRepository,
    transaction,
    statusResolver: assignmentStatusResolver
  });
  const fieldVisitRepository = databasePool ? new FieldVisitRepository({ pool: databasePool }) : null;
  const actualWorkRepository = databasePool ? new ActualWorkRepository({ pool: databasePool }) : null;
  const fieldExecutionOperationRepository = databasePool ? new FieldExecutionOperationRepository({ pool: databasePool }) : null;

  const schedulingService = new SchedulingService({
    resources,
    availabilities,
    assignments,
    holds,
    appointments
  });
  const originalSet = appointmentStore.set.bind(appointmentStore);
  appointmentStore.set = (key, value) => {
    const existing = appointmentStore.get(key);
    const result = originalSet(key, value);
    if (existing) {
      const index = appointments.indexOf(existing);
      if (index >= 0) appointments[index] = value;
    } else {
      appointments.push(value);
    }
    return result;
  };

  const appointmentStatusResolver = ({ organizationId, entityType, statusCode }) => {
    if (!organizationId || !entityType || !statusCode) return null;
    return statusConfigurationService.statusStore.get(
      [organizationId, entityType, statusCode].join(":")
    ) || null;
  };

  const appointmentService = new AppointmentService({
    appointmentStore,
    holdStore: new Map(),
    schedulingHolds: holds,
    schedulingService,
    statusResolver: appointmentStatusResolver,
    appointmentRepository,
    schedulingHoldRepository,
    transaction
  });

  const fieldVisitStore = new Map(fieldVisits.map(visit => [JSON.stringify([visit.organizationId, visit.id]), visit]));
  const actualWorkStore = new Map(actualWork.map(work => [JSON.stringify([work.organizationId, work.id]), work]));
  const fieldVisitService = new FieldVisitService({
    fieldVisitStore,
    appointmentStore,
    workOrderService,
    fieldVisitRepository,
    transaction,
    auditStore: auditEvents,
    domainEventService
  });
  const actualWorkService = new ActualWorkService({
    actualWorkStore,
    fieldVisitStore,
    fieldVisitRepository,
    actualWorkRepository,
    transaction,
    auditStore: auditEvents,
    domainEventService
  });
  const fieldExecutionSyncService = new FieldExecutionSyncService({
    fieldVisitService,
    actualWorkService,
    operationStore: offlineOperations,
    operationRepository: fieldExecutionOperationRepository,
    transaction
  });

  return {
    resources,
    availabilities,
    assignments,
    holds,
    appointments,
    jobs,
    workOrders,
    fieldVisits,
    actualWork,
    auditEvents,
    domainEvents,
    jobService,
    workOrderService,
    resourceService,
    qualificationService,
    resourceQualificationService,
    availabilityService,
    assignmentService,
    assignmentStatusResolver,
    fieldVisitService,
    actualWorkService,
    fieldExecutionSyncService,
    domainEventService,
    demoAvailability,
    schedulingService,
    statusConfigurationService,
    appointmentStatusResolver,
    appointmentService,
    authenticationService: seed.authenticationService || null,
    databasePool
  };
}

function principal() {
  return {
    userId: "demo-user",
    organizationId: "demo-org",
    permissions: ["job:create", "job:read", "workOrder:create", "workOrder:read", "appointment:create", "appointment:read", "appointment:update", "appointment:confirm", "appointment:cancel", "fieldVisit:create", "fieldVisit:read", "fieldVisit:update", "actualWork:create", "actualWork:read", "fieldExecution:sync"]
  };
}

async function ensureDurableDemoData(state) {
  if (!state.databasePool || process.env.NODE_ENV !== "development") return;
  const demoPrincipal = principal();
  await state.transaction(demoPrincipal, "demo.bootstrap", async db => {
    await db.query(
      "INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      ["demo-org", "Demo Organization"]
    );
  });
  const existing = await state.jobService.getForOrganization({
    organizationId: "demo-org",
    jobId: "job-1"
  });
  if (!existing) {
    await state.jobService.create({
      principal: demoPrincipal,
      id: "job-1",
      title: "Demo Client — 123 Main St",
      clientId: "client-1",
      serviceIds: ["AMP", "WX"],
      statusCode: "ready_to_schedule",
      metadata: { propertyId: "property-1" }
    });
  }
}

function serializeFieldVisit(visit) {
  return {
    ...visit,
    arrivedAt: visit.arrivedAt?.toISOString() ?? null,
    actualStartTime: visit.actualStartTime?.toISOString() ?? null,
    actualEndTime: visit.actualEndTime?.toISOString() ?? null,
    completedAt: visit.completedAt?.toISOString() ?? null,
    closedAt: visit.closedAt?.toISOString() ?? null
  };
}

function serializeActualWork(work) {
  return {
    ...work,
    actualStartTime: work.actualStartTime?.toISOString() ?? null,
    actualEndTime: work.actualEndTime?.toISOString() ?? null
  };
}

function staticFile(res, fileConfig) {
  const filePath = path.resolve(FRONTEND_DIR, fileConfig.file);
  if (!filePath.startsWith(FRONTEND_DIR + path.sep)) {
    return json(res, 404, { error: "Route not found" });
  }
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": fileConfig.contentType,
      "Cache-Control": "no-cache"
    });
    res.end(body);
    return true;
  } catch {
    return json(res, 404, { error: "Frontend asset not found" });
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    body += chunk;
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function ensureDemoAvailability(state, startTime) {
  if (!state.demoAvailability) return;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return;
  const day = new Date(start);
  day.setUTCHours(0, 0, 0, 0);
  const dayStart = day.getTime();
  const hasAvailability = state.availabilities.some(availability => {
    const existingStart = new Date(availability.startTime).getTime();
    return existingStart >= dayStart && existingStart < dayStart + 24 * 60 * 60000 && availability.resourceId === "auditor-1";
  });
  if (hasAvailability) return;
  state.availabilities.push({
    resourceId: "auditor-1",
    startTime: new Date(day.getTime() + 8 * 60 * 60000).toISOString(),
    endTime: new Date(day.getTime() + 17 * 60 * 60000).toISOString(),
    available: true
  });
}

function createHandler(state, {
  authenticationService = state.authenticationService,
  allowDevelopmentBypass =
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS === "true"
} = {}) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;

      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { status: "ok", service: "scheduling-platform" });
      }
      if (req.method === "GET" && FRONTEND_FILES[path]) {
        return staticFile(res, FRONTEND_FILES[path]);
      }
      if (req.method === "POST" && path === "/api/auth/dev-login") {
        if (process.env.NODE_ENV !== "development") {
          return json(res, 404, { error: "Route not found" });
        }
        if (!(authenticationService instanceof AuthenticationService)) {
          const error = new Error("Authentication is not configured");
          error.statusCode = 500;
          throw error;
        }
        return json(res, 200, {
          token: authenticationService.issueToken(principal()),
          userId: "demo-user",
          organizationId: "demo-org"
        });
      }

      let p;
      if (allowDevelopmentBypass) {
        p = principal();
      } else {
        if (!(authenticationService instanceof AuthenticationService)) {
          const error = new Error("Authentication is not configured");
          error.statusCode = 500;
          throw error;
        }
        p = authenticationService.authenticateAuthorizationHeader(req.headers.authorization);
      }

      if (req.method === "GET" && path === "/api/auth/me") {
        return json(res, 200, {
          userId: p.userId,
          organizationId: p.organizationId,
          permissions: p.permissions,
          authenticatedAt: p.authenticatedAt?.toISOString?.() || null,
          expiresAt: p.expiresAt?.toISOString?.() || null,
          authMethod: p.authMethod || "bearer"
        });
      }

      if (req.method === "GET" && path === "/api/jobs") {
        return json(res, 200, await state.jobService.list({ principal: p }));
      }
      if (req.method === "GET" && path === "/api/work-orders") {
        return json(res, 200, await state.workOrderService.list({
          principal: p,
          jobId: url.searchParams.get("jobId")
        }));
      }
      if (req.method === "POST" && path === "/api/work-orders") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return json(res, 400, { error: "Request body must be a JSON object" });
        }
        if (input.organizationId && input.organizationId !== p.organizationId) {
          return json(res, 403, { error: "Not authorized for the requested organization" });
        }
        const workOrder = await state.workOrderService.create({
          ...input,
          principal: p,
          organizationId: p.organizationId
        });
        return json(res, 201, workOrder);
      }
      if (req.method === "GET" && path === "/api/resources") {
        return json(res, 200, (await state.resourceService.list({ principal: p })).filter(resource => resource.active !== false));
      }
      if (req.method === "GET" && path === "/api/appointments") {
        return json(res, 200, state.appointmentService.list({ principal: p }).map(appointment => ({
          ...appointment,
          startTime: appointment.startTime.toISOString(),
          endTime: appointment.endTime.toISOString()
        })));
      }
      if (req.method === "GET" && path === "/api/availability") {
        const duration = Number(url.searchParams.get("durationMinutes") || 90);
        if (!Number.isInteger(duration) || duration <= 0) {
          return json(res, 400, { error: "durationMinutes must be a positive integer" });
        }
        const start = url.searchParams.get("start") || new Date().toISOString();
        const end = url.searchParams.get("end") || new Date(new Date(start).getTime() + 9 * 60 * 60000).toISOString();
        ensureDemoAvailability(state, start);
        const slots = state.schedulingService.findAvailableSlots({
          organizationId: p.organizationId,
          serviceIds: (url.searchParams.get("services") || "AMP").split(",").filter(Boolean),
          startTime: start,
          endTime: end,
          durationMinutes: duration
        });
        return json(res, 200, slots.map(slot => ({
          ...slot,
          startTime: slot.startTime.toISOString(),
          endTime: slot.endTime.toISOString()
        })));
      }
      if (req.method === "POST" && path === "/api/field-execution/sync") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return json(res, 400, { error: "Request body must be a JSON object" });
        }
        const results = await state.fieldExecutionSyncService.sync({
          principal: p,
          operations: input.operations
        });
        return json(res, 200, {
          results,
          summary: {
            applied: results.filter(result => result.status === "applied").length,
            duplicate: results.filter(result => result.status === "duplicate").length,
            conflicts: results.filter(result => result.status === "conflict").length,
            rejected: results.filter(result => result.status === "rejected").length
          }
        });
      }
      if (req.method === "GET" && path === "/api/field-visits") {
        const visits = await state.fieldVisitService.list({
          principal: p,
          appointmentId: url.searchParams.get("appointmentId"),
          workOrderId: url.searchParams.get("workOrderId"),
          resourceId: url.searchParams.get("resourceId")
        });
        return json(res, 200, visits.map(serializeFieldVisit));
      }
      if (req.method === "GET" && path.startsWith("/api/field-visits/")) {
        const id = path.slice("/api/field-visits/".length);
        return json(res, 200, serializeFieldVisit(await state.fieldVisitService.get({ principal: p, fieldVisitId: id })));
      }
      if (req.method === "POST" && path === "/api/field-visits") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) return json(res, 400, { error: "Request body must be a JSON object" });
        const visit = await state.fieldVisitService.create({ ...input, principal: p, organizationId: p.organizationId });
        return json(res, 201, serializeFieldVisit(visit));
      }
      const fieldVisitAction = path.match(/^\/api\/field-visits\/([^/]+)\/(arrive|start|stop|complete|close-incomplete)$/);
      if (req.method === "POST" && fieldVisitAction) {
        const input = await readBody(req);
        const fieldVisitId = fieldVisitAction[1];
        const action = fieldVisitAction[2];
        const payload = { principal: p, fieldVisitId, ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}) };
        const visit = action === "arrive"
          ? await state.fieldVisitService.arrive(payload)
          : action === "start"
            ? await state.fieldVisitService.start(payload)
            : action === "stop"
              ? await state.fieldVisitService.stop(payload)
              : action === "complete"
                ? await state.fieldVisitService.complete(payload)
                : await state.fieldVisitService.closeIncomplete(payload);
        return json(res, 200, serializeFieldVisit(visit));
      }
      if (req.method === "GET" && path === "/api/actual-work") {
        const work = await state.actualWorkService.list({
          principal: p,
          fieldVisitId: url.searchParams.get("fieldVisitId"),
          workOrderId: url.searchParams.get("workOrderId")
        });
        return json(res, 200, work.map(serializeActualWork));
      }
      if (req.method === "GET" && path.startsWith("/api/actual-work/")) {
        const id = path.slice("/api/actual-work/".length);
        return json(res, 200, serializeActualWork(await state.actualWorkService.get({ principal: p, actualWorkId: id })));
      }
      if (req.method === "POST" && path === "/api/actual-work") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) return json(res, 400, { error: "Request body must be a JSON object" });
        const work = await state.actualWorkService.create({ ...input, principal: p, organizationId: p.organizationId });
        return json(res, 201, serializeActualWork(work));
      }
      if (req.method === "POST" && path === "/api/appointments") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return json(res, 400, { error: "Request body must be a JSON object" });
        }
        if (input.organizationId && input.organizationId !== p.organizationId) {
          return json(res, 403, { error: "Not authorized for the requested organization" });
        }
        const appointment = await state.appointmentService.create({
          ...input,
          principal: p,
          organizationId: p.organizationId,
          enforceAvailability: true
        });
        return json(res, 201, {
          ...appointment,
          startTime: appointment.startTime.toISOString(),
          endTime: appointment.endTime.toISOString()
        });
      }
      return json(res, 404, { error: "Route not found" });
    } catch (error) {
      if (error.statusCode === 413) return json(res, 413, { error: error.message });
      if (error.message === "Not authorized") return json(res, 403, { error: error.message });
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (status >= 500) {
        console.error("Unhandled application error", error);
        return json(res, 500, { error: "Internal server error" });
      }
      return json(res, status, { error: error.message });
    }
  };
}

module.exports = { createAppState, createHandler, ensureDurableDemoData };
