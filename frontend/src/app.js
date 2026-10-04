const root = document.getElementById("root");

async function api(path, options = {}) {
  const response = await SchedulingAuth.authenticatedFetch(path, options);
  let data = {};
  try { data = await response.json(); } catch { data = { error: "The server returned an invalid response." }; }
  if (!response.ok) throw new Error(data.error || "Request failed");
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

window.SchedulingScheduler = Object.freeze({load});

async function boot() {
  SchedulingAppShell.renderLoading(root);
  try {
    const session = await SchedulingAuth.getSession();
    if (!session) { bindUnauthenticated(); return; }
    SchedulingAppShell.renderAuthenticated(root, session);
    document.getElementById("logout")?.addEventListener("click", () => {
      SchedulingAuth.logout();
      bindUnauthenticated("You have been signed out.");
    });
    await load();
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
  SchedulingAppShell.renderUnauthenticated(root, message);
  document.getElementById("development-login")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try {
      const session = await SchedulingAuth.developmentLogin();
      if (!session) throw new Error("Authentication did not establish a valid session.");
      SchedulingAppShell.renderAuthenticated(root, session);
      document.getElementById("logout")?.addEventListener("click", () => {
        SchedulingAuth.logout();
        bindUnauthenticated("You have been signed out.");
      });
      await load();
    } catch (error) {
      bindUnauthenticated(error.message);
    }
  });
}

boot();
