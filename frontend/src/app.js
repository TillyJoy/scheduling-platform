const root = document.getElementById("root");

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function load() {
  root.innerHTML = "<main><h1>Scheduling Platform</h1><p>Loading…</p></main>";
  try {
    const [jobs, resources, appointments, slots] = await Promise.all([
      api("/api/jobs"), api("/api/resources"), api("/api/appointments"),
      api("/api/availability?durationMinutes=90&start=2026-10-01T08:00:00Z&end=2026-10-01T17:00:00Z")
    ]);
    root.innerHTML = `
      <main class="shell">
        <header><div><h1>Scheduling Platform</h1><p>Scheduler MVP</p></div><span class="status">API online</span></header>
        <section class="grid">
          <article><h2>Scheduling Queue</h2><div id="jobs"></div></article>
          <article><h2>Available Times</h2><div id="slots"></div></article>
          <article><h2>Today's Appointments</h2><div id="appointments"></div></article>
        </section>
      </main>`;
    document.getElementById("jobs").innerHTML = jobs.map(j => `<div class="row"><strong>${j.title}</strong><span>${j.statusCode || "—"}</span></div>`).join("");
    document.getElementById("slots").innerHTML = slots.slice(0, 12).map(s => `
      <button class="slot" data-start="${s.startTime}" data-end="${s.endTime}" data-resource="${s.resourceId}">
        ${formatTime(s.startTime)} – ${formatTime(s.endTime)} · ${resources.find(r => r.id === s.resourceId)?.name || s.resourceId}
      </button>`).join("") || "<p>No available times.</p>";
    document.getElementById("appointments").innerHTML = appointments.map(a =>
      `<div class="row"><strong>${formatTime(a.startTime)} – ${formatTime(a.endTime)}</strong><span>${a.status}</span></div>`
    ).join("") || "<p>No appointments yet.</p>";
    document.querySelectorAll(".slot").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api("/api/appointments", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ id:"appointment-"+Date.now(), organizationId:"demo-org", clientId:"client-1",
            propertyId:"property-1", serviceIds:["AMP"], memberIds:[button.dataset.resource],
            startTime:button.dataset.start, endTime:button.dataset.end }) });
        await load();
      } catch (error) { alert(error.message); button.disabled = false; }
    }));
  } catch (error) {
    root.innerHTML = `<main><h1>Scheduling Platform</h1><p class="error">Unable to connect to the API: ${error.message}</p></main>`;
  }
}
load();
