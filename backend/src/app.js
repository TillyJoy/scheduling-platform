const fs = require("node:fs");
const path = require("node:path");
const { SchedulingService } = require("./services/schedulingService");
const { AppointmentService } = require("./services/appointmentService");
const { AuthenticationService } = require("./services/authenticationService");
const { Resource } = require("./models/resource");
const { Job } = require("./models/job");

const MAX_BODY_BYTES = 1024 * 1024;
const FRONTEND_FILES = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" }
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
  const jobs = seed.jobs || [new Job({
    id: "job-1",
    organizationId: "demo-org",
    title: "Demo Client — 123 Main St",
    clientId: "client-1",
    serviceIds: ["AMP", "WX"],
    statusCode: "ready_to_schedule"
  })];

  const appointmentStore = new Map(
    appointments.map(appointment => [
      JSON.stringify([appointment.organizationId, appointment.id]),
      appointment
    ])
  );
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

  const appointmentService = new AppointmentService({
    appointmentStore,
    holdStore: new Map(),
    schedulingHolds: holds,
    schedulingService
  });

  return {
    resources,
    availabilities,
    assignments,
    holds,
    appointments,
    jobs,
    demoAvailability,
    schedulingService,
    appointmentService,
    authenticationService: seed.authenticationService || null
  };
}

function principal() {
  return {
    userId: "demo-user",
    organizationId: "demo-org",
    permissions: ["appointment:create", "appointment:read", "appointment:confirm", "appointment:cancel"]
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

      if (req.method === "GET" && path === "/api/jobs") {
        return json(res, 200, state.jobs.filter(job => job.organizationId === p.organizationId));
      }
      if (req.method === "GET" && path === "/api/resources") {
        return json(res, 200, state.resources.filter(resource => resource.active !== false));
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
      if (req.method === "POST" && path === "/api/appointments") {
        const input = await readBody(req);
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return json(res, 400, { error: "Request body must be a JSON object" });
        }
        if (input.organizationId && input.organizationId !== p.organizationId) {
          return json(res, 403, { error: "Not authorized for the requested organization" });
        }
        const appointment = state.appointmentService.create({
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
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (status >= 500) {
        console.error("Unhandled application error", error);
        return json(res, 500, { error: "Internal server error" });
      }
      return json(res, status, { error: error.message });
    }
  };
}

module.exports = { createAppState, createHandler };
