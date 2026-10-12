const root = document.getElementById("root");

async function api(path, options = {}) {
  const response = await SchedulingAuth.authenticatedFetch(path, options);
  let data = {};
  try { data = await response.json(); } catch { data = { error: "The server returned an invalid response." }; }
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[character]));
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { timeZone:"UTC", hour:"numeric", minute:"2-digit" });
}

function dateWindow(dateValue) {
  const day = new Date(`${dateValue}T00:00:00Z`);
  return {
    start: day.toISOString(),
    end: new Date(day.getTime() + 24 * 60 * 60000).toISOString()
  };
}

let selectedJobId = null;
let currentSession = null;

async function load(dateValue = new Date().toISOString().slice(0,10), requestedJobId = selectedJobId) {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  workspace.innerHTML = '<section class="panel"><p>Loading scheduler…</p></section>';

  try {
    const window = dateWindow(dateValue);
    const [jobs, resources, appointments] = await Promise.all([
      api("/api/jobs"),
      api("/api/resources"),
      api("/api/appointments")
    ]);

    if (jobs.length === 0) {
      workspace.innerHTML = '<section class="panel"><h2>No jobs ready to schedule</h2><p>The organization has no jobs available to this scheduler.</p></section>';
      return;
    }

    selectedJobId = jobs.some(job => job.id === requestedJobId)
      ? requestedJobId
      : jobs[0].id;

    const selectedJob = jobs.find(job => job.id === selectedJobId);
    const workOrders = await api(`/api/work-orders?jobId=${encodeURIComponent(selectedJobId)}`);
    const serviceIds = Array.isArray(selectedJob.serviceIds) && selectedJob.serviceIds.length
      ? selectedJob.serviceIds
      : ["AMP"];
    const slots = await api(
      `/api/availability?durationMinutes=90&services=${encodeURIComponent(serviceIds.join(","))}&start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`
    );

    const clientId = selectedJob.clientId || "";
    const propertyId = selectedJob.metadata?.propertyId || "";
    const selectedWorkOrderId = workOrders[0]?.id || "";
    const canSchedule = Boolean(clientId && propertyId && selectedWorkOrderId);

    workspace.innerHTML = `
      <main class="scheduler-existing">
        <header>
          <div><h1>Scheduling Platform</h1><p>Scheduler MVP</p></div>
          <span class="status">API online</span>
        </header>
        <section class="panel">
          <h2>Schedule a job</h2>
          <div class="grid">
            <label>Job
              <select id="job-select">${jobs.map(job =>
                `<option value="${escapeHtml(job.id)}" ${job.id === selectedJobId ? "selected" : ""}>${escapeHtml(job.title)}</option>`
              ).join("")}</select>
            </label>
            <label>Work order
              <select id="work-order-select">
                ${workOrders.map(order =>
                  `<option value="${escapeHtml(order.id)}">${escapeHtml(order.number)} — ${escapeHtml(order.title || "Untitled work order")}</option>`
                ).join("")}
              </select>
            </label>
            <label>Schedule date
              <input id="schedule-date" type="date" value="${escapeHtml(dateValue)}">
            </label>
          </div>
          <p class="muted">Client: ${escapeHtml(clientId || "Not linked")} · Property: ${escapeHtml(propertyId || "Not linked")}</p>
          ${workOrders.length ? "" : '<button id="create-work-order" type="button">Create work order for this job</button>'}
          ${!canSchedule ? '<p class="error">This job needs client, property, and work-order context before an appointment can be scheduled.</p>' : ""}
        </section>
        <section class="grid">
          <article><h2>Scheduling Queue</h2><div id="jobs"></div></article>
          <article><h2>Available Times</h2><div id="slots"></div></article>
          <article><h2>Appointments</h2><div id="appointments"></div></article>
        </section>
      </main>`;

    document.getElementById("jobs").innerHTML = jobs.map(job =>
      `<div class="row ${job.id === selectedJobId ? "selected" : ""}"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.statusCode || "—")}</span></div>`
    ).join("");

    document.getElementById("slots").innerHTML = slots.slice(0, 12).map(slot =>
      `<button class="slot" data-start="${escapeHtml(slot.startTime)}" data-end="${escapeHtml(slot.endTime)}" data-resource="${escapeHtml(slot.resourceId)}" ${canSchedule ? "" : "disabled"}>${escapeHtml(formatTime(slot.startTime))} – ${escapeHtml(formatTime(slot.endTime))} · ${escapeHtml(resources.find(resource => resource.id === slot.resourceId)?.name || slot.resourceId)}</button>`
    ).join("") || "<p>No available times.</p>";

    document.getElementById("appointments").innerHTML = appointments.map(appointment =>
      `<div class="row"><strong>${escapeHtml(formatTime(appointment.startTime))} – ${escapeHtml(formatTime(appointment.endTime))}</strong><span>${escapeHtml(appointment.status)}</span></div>`
    ).join("") || "<p>No appointments yet.</p>";

    document.getElementById("job-select").addEventListener("change", event => {
      selectedJobId = event.target.value;
      load(dateValue, selectedJobId);
    });

    document.getElementById("schedule-date").addEventListener("change", event => load(event.target.value, selectedJobId));

    document.getElementById("create-work-order")?.addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        await api("/api/work-orders", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            id: crypto.randomUUID(),
            jobId: selectedJobId,
            title: `${selectedJob.title} work order`
          })
        });
        await load(dateValue, selectedJobId);
      } catch (error) {
        alert(error.message);
        event.currentTarget.disabled = false;
      }
    });

    document.querySelectorAll(".slot").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const workOrderId = document.getElementById("work-order-select")?.value;
        await api("/api/appointments", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            id: crypto.randomUUID(),
            clientId,
            propertyId,
            workOrderId,
            unitIds: [],
            serviceIds,
            memberIds: [button.dataset.resource],
            startTime: button.dataset.start,
            endTime: button.dataset.end
          })
        });
        await load(document.getElementById("schedule-date")?.value || dateValue, selectedJobId);
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    }));
  } catch (error) {
    if (error instanceof SchedulingAuth.AuthenticationError) throw error;
    workspace.innerHTML = `<section class="panel"><p class="error">Unable to connect to the API: ${escapeHtml(error.message)}</p></section>`;
  }
}

async function loadAssignmentWorkspace(session, options = {}) {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;
  const workflow = SchedulingAssignmentWorkflow;
  const controller = workflow.createController(api);
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canRead = permissions.includes("assignment:read");
  workspace.innerHTML = '<section class="panel" aria-busy="true"><p>Loading assignments…</p></section>';

  let assignments = [];
  let jobs = [];
  let resources = [];
  let workOrders = [];
  let canReadWorkOrders = false;
  let selectedJobId = options.selectedJobId || "";
  let selectedAssignment = null;
  let listError = "";
  let referenceError = "";
  let detailError = "";
  let createBlockedMessage = "";

  if (canRead) {
    try {
      assignments = await controller.list(session);
    } catch (error) {
      if (error instanceof SchedulingAuth.AuthenticationError) throw error;
      listError = workflow.errorMessage(error);
    }
  }

  try {
    const references = await controller.references(session);
    if (references.available) {
      jobs = references.jobs;
      resources = references.resources;
      canReadWorkOrders = references.canReadWorkOrders;
      if (!jobs.some(job => job.id === selectedJobId)) selectedJobId = jobs[0]?.id || "";
      if (selectedJobId && canReadWorkOrders) workOrders = await controller.workOrders(session, selectedJobId);
    } else if (permissions.includes("assignment:create")) {
      createBlockedMessage = `Assignment creation requires these additional permissions: ${references.missing.join(", ")}.`;
    }
  } catch (error) {
    if (error instanceof SchedulingAuth.AuthenticationError) throw error;
    referenceError = workflow.errorMessage(error);
    createBlockedMessage = referenceError;
  }

  if (options.selectedAssignmentId && canRead) {
    try {
      selectedAssignment = await controller.get(session, options.selectedAssignmentId);
    } catch (error) {
      if (error instanceof SchedulingAuth.AuthenticationError) throw error;
      detailError = workflow.errorMessage(error);
    }
  }

  function render() {
    workspace.innerHTML = workflow.renderWorkspace({
      canRead,
      assignments,
      canCreate: !referenceError && jobs.length > 0 && resources.length > 0 && permissions.includes("assignment:create"),
      createBlockedMessage,
      jobs,
      resources,
      workOrders,
      canReadWorkOrders,
      selectedJobId,
      selectedAssignment,
      listError,
      referenceError,
      detailError,
      notice: options.notice || ""
    });

    document.getElementById("refresh-assignments")?.addEventListener("click", () => {
      void loadAssignmentWorkspace(session, { selectedJobId, selectedAssignmentId: selectedAssignment?.id });
    });

    document.getElementById("assignment-job")?.addEventListener("change", async event => {
      selectedJobId = event.currentTarget.value;
      referenceError = "";
      try {
        workOrders = selectedJobId ? await controller.workOrders(session, selectedJobId) : [];
      } catch (error) {
        if (error instanceof SchedulingAuth.AuthenticationError) {
          bindUnauthenticated("Your session has expired. Sign in again.");
          return;
        }
        referenceError = workflow.errorMessage(error);
      }
      render();
    });

    document.querySelectorAll(".assignment-detail").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          selectedAssignment = await controller.get(session, button.dataset.assignmentId);
          detailError = "";
        } catch (error) {
          if (error instanceof SchedulingAuth.AuthenticationError) {
            bindUnauthenticated("Your session has expired. Sign in again.");
            return;
          }
          selectedAssignment = null;
          detailError = workflow.errorMessage(error);
        }
        render();
      });
    });

    document.getElementById("assignment-create-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const feedback = document.getElementById("assignment-feedback");
      form.querySelector('button[type="submit"]').disabled = true;
      if (feedback) feedback.textContent = "Creating assignment…";
      try {
        const created = await controller.create(session, values);
        await loadAssignmentWorkspace(session, {
          selectedJobId,
          selectedAssignmentId: created.id,
          notice: "Assignment created successfully."
        });
      } catch (error) {
        if (error instanceof SchedulingAuth.AuthenticationError) {
          bindUnauthenticated("Your session has expired. Sign in again.");
          return;
        }
        if (feedback) feedback.textContent = workflow.errorMessage(error);
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }

  render();
}

async function routeCurrentView() {
  if (!currentSession) return;
  try {
    if (window.location.hash === "#/assignments") {
      await loadAssignmentWorkspace(currentSession);
    } else {
      await load();
    }
  } catch (error) {
    if (error instanceof SchedulingAuth.AuthenticationError) {
      bindUnauthenticated("Your session has expired. Sign in again.");
      return;
    }
    SchedulingAppShell.renderError(root, error.message);
    document.getElementById("retry-application")?.addEventListener("click", routeCurrentView);
  }
}

function showAuthenticated(session) {
  currentSession = session;
  SchedulingAppShell.renderAuthenticated(root, session);
  document.getElementById("logout")?.addEventListener("click", () => {
    SchedulingAuth.logout();
    currentSession = null;
    bindUnauthenticated("You have been signed out.");
  });
  window.onhashchange = routeCurrentView;
  return routeCurrentView();
}

window.SchedulingScheduler = Object.freeze({load});

async function boot() {
  SchedulingAppShell.renderLoading(root);
  try {
    const session = await SchedulingAuth.getSession();
    if (!session) { bindUnauthenticated(); return; }
    await showAuthenticated(session);
  } catch (error) {
    if (error instanceof SchedulingAuth.AuthenticationError) {
      bindUnauthenticated("Your session has expired. Sign in again.");
      return;
    }
    SchedulingAppShell.renderError(root, error.message);
    document.getElementById("retry-application")?.addEventListener("click", boot);
  }
}

function bindUnauthenticated(message) {
  currentSession = null;
  window.onhashchange = null;
  SchedulingAppShell.renderUnauthenticated(root, message);
  document.getElementById("development-login")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try {
      const session = await SchedulingAuth.developmentLogin();
      if (!session) throw new Error("Authentication did not establish a valid session.");
      await showAuthenticated(session);
    } catch (error) {
      bindUnauthenticated(error.message);
    }
  });
}

boot();
