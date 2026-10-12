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
const DEMO_RESOURCE_ID = "auditor-1";
const DEMO_JOB_ID = "job-1";

async function availablePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startApplication(databaseUrl) {
  const port = await availablePort();
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      NODE_ENV: "development",
      ALLOW_DEVELOPMENT_AUTH_BYPASS: "false",
      AUTH_SECRET: process.env.AUTH_SECRET,
      TZ: "UTC"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  let spawnError = null;
  child.stdout.setEncoding("utf8").on("data", chunk => { logs += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { logs += chunk; });
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
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  throw new Error(`Application did not become healthy within 60 seconds.\n${logs}`);
}

async function stopApplication(application) {
  if (!application || application.child.exitCode !== null) return;
  const child = application.child;
  const exitResult = new Promise(resolve => {
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
  if (await exitResult) return;
  child.kill("SIGKILL");
  if (child.exitCode === null) await once(child, "exit");
}

function localDateTime(date) {
  return date.toISOString().slice(0, 16);
}

test("staff can list, inspect, and create an assignment through the authenticated browser workflow", async ({ page }) => {
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
  let application = null;
  try {
    const identity = await pool.query(
      "SELECT current_database() AS database_name, current_setting('server_version_num') AS server_version"
    );
    expect(identity.rows[0].database_name).toBe(TEST_DATABASE_NAME);
    expect(Math.floor(Number(identity.rows[0].server_version) / 10_000)).toBe(16);

    application = await startApplication(databaseUrl.toString());

    const bootstrap = await pool.query(
      `SELECT
         (SELECT count(*) FROM resources WHERE organization_id=$1 AND id=$2) AS resources,
         (SELECT count(*) FROM jobs WHERE organization_id=$1 AND id=$3) AS jobs,
         (SELECT count(*) FROM assignments WHERE organization_id=$1) AS assignments`,
      [DEMO_ORGANIZATION_ID, DEMO_RESOURCE_ID, DEMO_JOB_ID]
    );
    expect(Number(bootstrap.rows[0].resources)).toBe(1);
    expect(Number(bootstrap.rows[0].jobs)).toBe(1);
    expect(Number(bootstrap.rows[0].assignments)).toBe(0);

    await page.goto(application.baseUrl);

    await expect(page.getByRole("button", { name: "Development sign in" })).toBeVisible();
    await page.getByRole("button", { name: "Development sign in" }).click();
    await expect(page.getByText(DEMO_ORGANIZATION_ID, { exact: true })).toBeVisible();
    const listResponsePromise = page.waitForResponse(response =>
      response.request().method() === "GET" && new URL(response.url()).pathname === "/api/assignments"
    );
    await page.getByRole("link", { name: /Assignments/ }).click();
    const listResponse = await listResponsePromise;
    expect(listResponse.status()).toBe(200);
    expect(await listResponse.json()).toEqual([]);
    await expect(page.getByRole("heading", { name: "Assignments", exact: true })).toBeVisible();
    await expect(page.getByText("No assignments are available in your organization.", { exact: true })).toBeVisible();

    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    start.setUTCHours(16, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const startInput = localDateTime(start);
    const endInput = localDateTime(end);

    await page.locator('select[name="resourceId"]').selectOption(DEMO_RESOURCE_ID);
    await expect(page.locator('select[name="jobId"]')).toHaveValue(DEMO_JOB_ID);
    await page.locator('input[name="startTime"]').fill(startInput);
    await page.locator('input[name="endTime"]').fill(endInput);

    const createResponsePromise = page.waitForResponse(response =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/assignments"
    );
    await page.getByRole("button", { name: "Create assignment" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const posted = createResponse.request().postDataJSON();
    expect(posted.resourceId).toBe(DEMO_RESOURCE_ID);
    expect(posted.jobId).toBe(DEMO_JOB_ID);
    expect(posted.organizationId).toBeUndefined();
    const assignment = await createResponse.json();
    expect(assignment.organizationId).toBe(DEMO_ORGANIZATION_ID);
    expect(assignment.resourceId).toBe(DEMO_RESOURCE_ID);
    expect(assignment.jobId).toBe(DEMO_JOB_ID);
    expect(assignment.startTime).toBe(start.toISOString());
    expect(assignment.endTime).toBe(end.toISOString());

    await expect(page.getByText("Assignment created successfully.", { exact: true })).toBeVisible();
    const row = page.locator(`.assignment-row:has(.assignment-detail[data-assignment-id="${assignment.id}"])`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Demo Auditor");
    await expect(row).toContainText("Demo Client — 123 Main St");

    const detailResponsePromise = page.waitForResponse(response =>
      response.request().method() === "GET" && new URL(response.url()).pathname === `/api/assignments/${assignment.id}`
    );
    await row.locator(".assignment-detail").click();
    const detailResponse = await detailResponsePromise;
    expect(detailResponse.status()).toBe(200);
    expect((await detailResponse.json()).id).toBe(assignment.id);
    const details = page.locator(".assignment-detail-panel");
    await expect(details).toContainText(assignment.id);
    // The staff UI remains read-only; lifecycle transitions are handled by the API.
    await expect(details).toContainText("Status is read-only in this workspace.");
    await expect(details).toContainText("Lifecycle transitions are handled by the assignment status API.");
    await expect(details).toContainText("Status not set");
    await expect(details.locator("button, input, select")).toHaveCount(0);

    await page.locator('select[name="resourceId"]').selectOption(DEMO_RESOURCE_ID);
    await expect(page.locator('select[name="jobId"]')).toHaveValue(DEMO_JOB_ID);
    await page.locator('input[name="startTime"]').fill(startInput);
    await page.locator('input[name="endTime"]').fill(endInput);
    const conflictResponsePromise = page.waitForResponse(response =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/assignments"
    );
    await page.getByRole("button", { name: "Create assignment" }).click();
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    await expect(page.getByText(
      "This resource is already assigned during that time. Choose another resource or time.",
      { exact: true }
    )).toBeVisible();
    await expect(page.locator(".assignment-row")).toHaveCount(1);

    const persisted = await pool.query(
      `SELECT id, organization_id, resource_id, job_id, start_time, end_time
       FROM assignments WHERE organization_id=$1 AND id=$2`,
      [DEMO_ORGANIZATION_ID, assignment.id]
    );
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0].resource_id).toBe(DEMO_RESOURCE_ID);
    expect(persisted.rows[0].job_id).toBe(DEMO_JOB_ID);
    expect(new Date(persisted.rows[0].start_time).toISOString()).toBe(start.toISOString());
    expect(new Date(persisted.rows[0].end_time).toISOString()).toBe(end.toISOString());
    const assignmentCount = await pool.query(
      "SELECT count(*) AS count FROM assignments WHERE organization_id=$1",
      [DEMO_ORGANIZATION_ID]
    );
    expect(Number(assignmentCount.rows[0].count)).toBe(1);
  } finally {
    await stopApplication(application);
    await pool.end();
  }
});
