const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const http = require("node:http");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const TEST_DATABASE_NAME = "scheduling_platform_test";
const TEST_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEMO_ORGANIZATION_ID = "demo-org";
const DEMO_JOB_ID = "job-1";
const DEMO_RESOURCE_ID = "auditor-1";

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function getAvailablePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startApplication({ port, databaseUrl }) {
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      NODE_ENV: "development",
      ALLOW_DEVELOPMENT_AUTH_BYPASS: "false",
      AUTH_SECRET: process.env.AUTH_SECRET
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { logs += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { logs += chunk; });
  let spawnError = null;
  child.once("error", error => { spawnError = error; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Application could not start: ${spawnError.message}\n${logs}`);
    if (child.exitCode !== null) throw new Error(`Application exited during startup (${child.exitCode}).\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return { child, baseUrl, getLogs: () => logs };
    } catch {}
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error(`Application did not become healthy within 60 seconds.\n${logs}`);
}

async function stopApplication(application) {
  if (!application || application.child.exitCode !== null) return;
  const child = application.child;
  const exited = new Promise(resolve => {
    if (child.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, 10_000);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    child.once("exit", onExit);
  });
  child.kill("SIGTERM");
  if (await exited) return;
  child.kill("SIGKILL");
  if (child.exitCode === null) await once(child, "exit");
}

async function signIn(page) {
  await expect(page.getByRole("button", { name: "Development sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Development sign in" }).click();
  await expect(page.getByText(DEMO_ORGANIZATION_ID, { exact: true })).toBeVisible();
  await expect(page.locator("#job-select")).toHaveValue(DEMO_JOB_ID);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function assertDemoBootstrap(pool) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*) FROM resources WHERE organization_id=$1 AND id=$2) AS resources,
       (SELECT count(*) FROM properties WHERE organization_id=$1 AND id='property-1') AS properties,
       (SELECT count(*) FROM jobs WHERE organization_id=$1 AND id=$3) AS jobs`,
    [DEMO_ORGANIZATION_ID, DEMO_RESOURCE_ID, DEMO_JOB_ID]
  );
  expect(Number(result.rows[0].resources)).toBe(1);
  expect(Number(result.rows[0].properties)).toBe(1);
  expect(Number(result.rows[0].jobs)).toBe(1);
}

test("browser-created appointment remains durable after application restart", async ({ page }) => {
  expect(process.env.CI).toBe("true");
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  expect(process.env.RUN_POSTGRES_TESTS).toBe("1");
  expect(process.env.NODE_ENV).toBe("development");
  expect(process.env.ALLOW_DEVELOPMENT_AUTH_BYPASS).toBe("false");
  expect(process.env.AUTH_SECRET).toBeTruthy();

  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  expect(databaseUrl.pathname).toBe(`/${TEST_DATABASE_NAME}`);
  expect(TEST_DATABASE_HOSTS.has(databaseUrl.hostname)).toBe(true);
  expect(databaseUrl.username).toBe("postgres");

  const pool = new Pool({ connectionString: databaseUrl.toString(), ssl: false });
  const identity = await pool.query(
    "SELECT current_database() AS database_name, current_setting('server_version_num') AS server_version"
  );
  expect(identity.rows[0].database_name).toBe(TEST_DATABASE_NAME);
  expect(Math.floor(Number(identity.rows[0].server_version) / 10_000)).toBe(16);

  const port = await getAvailablePort();
  let application = null;
  let appointmentId = null;
  let workOrderId = null;
  let expectedStart = null;
  let expectedEnd = null;

  try {
    application = await startApplication({ port, databaseUrl: databaseUrl.toString() });
    await assertDemoBootstrap(pool);

    const existingAppointments = await pool.query(
      "SELECT count(*) AS count FROM appointments WHERE organization_id=$1",
      [DEMO_ORGANIZATION_ID]
    );
    expect(Number(existingAppointments.rows[0].count)).toBe(0);

    await page.goto(application.baseUrl);
    await signIn(page);

    const job = page.locator("#job-select");
    await job.selectOption(DEMO_JOB_ID);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    const scheduledDate = date.toISOString().slice(0, 10);
    await page.locator("#schedule-date").fill(scheduledDate);

    const createWorkOrder = page.getByRole("button", { name: "Create work order for this job" });
    if (await createWorkOrder.isVisible()) {
      const workOrderResponsePromise = page.waitForResponse(response =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/work-orders"
      );
      await createWorkOrder.click();
      const workOrderResponse = await workOrderResponsePromise;
      expect(workOrderResponse.status()).toBe(201);
      const workOrder = await workOrderResponse.json();
      workOrderId = workOrder.id;
    }

    const workOrderSelect = page.locator("#work-order-select");
    await expect(workOrderSelect).toBeVisible();
    // The create-work-order click handler reloads the scheduler asynchronously
    // after the POST completes. Wait for that UI refresh before reading the value.
    if (workOrderId) {
      await expect(workOrderSelect).toHaveValue(workOrderId);
    } else {
      await expect(workOrderSelect).toHaveValue(/.+/);
    }
    const selectedWorkOrderId = await workOrderSelect.inputValue();
    expect(selectedWorkOrderId).toBeTruthy();

    const scheduleDate = page.locator("#schedule-date");
    await expect(scheduleDate).toHaveValue(scheduledDate);
    // Creating a work order can refresh the scheduler using its previous date.
    // Explicitly dispatch the UI's change event and wait for availability for
    // the requested date before choosing a slot.
    await scheduleDate.dispatchEvent("change");
    const slot = page.locator("#slots .slot").first();
    await expect(slot).toBeVisible();
    await expect.poll(async () => (await slot.getAttribute("data-start"))?.slice(0, 10))
      .toBe(scheduledDate);
    const slotStart = await slot.getAttribute("data-start");
    const slotEnd = await slot.getAttribute("data-end");
    expect(slotStart.slice(0, 10)).toBe(scheduledDate);
    expectedStart = new Date(slotStart).toISOString();
    expectedEnd = new Date(slotEnd).toISOString();

    const appointmentResponsePromise = page.waitForResponse(response =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/appointments"
    );
    await slot.click();
    const appointmentResponse = await appointmentResponsePromise;
    expect(appointmentResponse.status()).toBe(201);
    const appointment = await appointmentResponse.json();
    appointmentId = appointment.id;
    expect(appointmentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(appointment.startTime).toBe(expectedStart);
    expect(appointment.endTime).toBe(expectedEnd);
    expect(appointment.workOrderId).toBe(selectedWorkOrderId);

    const expectedRowText = `${scheduledDate} · ${formatTime(expectedStart)} – ${formatTime(expectedEnd)}`;
    const appointmentRow = page.locator(`#appointments [data-appointment-id="${appointmentId}"]`);
    await expect(appointmentRow).toHaveCount(1);
    await expect(appointmentRow).toContainText(expectedRowText);
    await expect(appointmentRow).toContainText("scheduled");

    const storedAppointment = await pool.query(
      `SELECT id, organization_id, work_order_id, start_time, end_time, status_code
       FROM appointments WHERE organization_id=$1 AND id=$2`,
      [DEMO_ORGANIZATION_ID, appointmentId]
    );
    expect(storedAppointment.rowCount).toBe(1);
    expect(storedAppointment.rows[0].work_order_id).toBe(selectedWorkOrderId);
    expect(new Date(storedAppointment.rows[0].start_time).toISOString()).toBe(expectedStart);
    expect(new Date(storedAppointment.rows[0].end_time).toISOString()).toBe(expectedEnd);
    expect(storedAppointment.rows[0].status_code).toBe("scheduled");

    await page.reload();
    await expect(page.locator(`#appointments [data-appointment-id="${appointmentId}"]`)).toContainText(expectedRowText);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Development sign in" })).toBeVisible();
    await stopApplication(application);
    application = await startApplication({ port, databaseUrl: databaseUrl.toString() });
    await assertDemoBootstrap(pool);

    await page.goto(application.baseUrl);
    await signIn(page);
    const persistedAppointment = page.locator(`#appointments [data-appointment-id="${appointmentId}"]`);
    await expect(persistedAppointment).toHaveCount(1);
    await expect(persistedAppointment).toContainText(expectedRowText);
    await expect(persistedAppointment).toContainText("scheduled");

    const countsAfterRestart = await pool.query(
      `SELECT
         (SELECT count(*) FROM appointments WHERE organization_id=$1) AS appointments,
         (SELECT count(*) FROM appointments WHERE organization_id=$1 AND id=$2) AS matching_appointment,
         (SELECT count(*) FROM resources WHERE organization_id=$1 AND id=$3) AS resources,
         (SELECT count(*) FROM work_orders WHERE organization_id=$1 AND id=$4) AS work_orders`,
      [DEMO_ORGANIZATION_ID, appointmentId, DEMO_RESOURCE_ID, selectedWorkOrderId]
    );
    expect(Number(countsAfterRestart.rows[0].appointments)).toBe(1);
    expect(Number(countsAfterRestart.rows[0].matching_appointment)).toBe(1);
    expect(Number(countsAfterRestart.rows[0].resources)).toBe(1);
    expect(Number(countsAfterRestart.rows[0].work_orders)).toBe(1);

    console.log(JSON.stringify({
      appointmentId,
      organizationId: DEMO_ORGANIZATION_ID,
      jobId: DEMO_JOB_ID,
      workOrderId: selectedWorkOrderId,
      startTime: expectedStart,
      endTime: expectedEnd,
      database: TEST_DATABASE_NAME,
      persistedAfterRestart: true
    }));
  } finally {
    await stopApplication(application);
    await pool.end();
  }
});
