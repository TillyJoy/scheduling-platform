(() => {
  const tokenKey = "scheduling-platform-token";
  const loginCard = document.getElementById("login-card");
  const appCard = document.getElementById("app-card");
  const error = document.getElementById("error");
  const status = document.getElementById("status");
  const session = document.getElementById("session");
  const jobs = document.getElementById("jobs");
  const appointments = document.getElementById("appointments");

  function showError(message) {
    error.textContent = message;
    status.textContent = "Unable to load the authenticated workflow.";
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(tokenKey);
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Request failed (" + response.status + ")");
    return body;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function renderJobs(data) {
    jobs.innerHTML = "<h2>Jobs</h2><table><thead><tr><th>Title</th><th>Status</th></tr></thead><tbody>" +
      data.map(job => "<tr><td>" + escapeHtml(job.title) + "</td><td>" + escapeHtml(job.statusCode || "") + "</td></tr>").join("") +
      "</tbody></table>";
  }

  function renderAppointments(data) {
    appointments.innerHTML = "<h2>Appointments</h2><table><thead><tr><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>" +
      data.map(item => "<tr><td>" + escapeHtml(new Date(item.startTime).toLocaleString()) + "</td><td>" +
        escapeHtml(new Date(item.endTime).toLocaleString()) + "</td><td>" + escapeHtml(item.statusCode || "") + "</td></tr>").join("") +
      "</tbody></table>";
  }

  async function loadApp() {
    loginCard.hidden = true;
    appCard.hidden = false;
    status.textContent = "Authenticated. Loading organization data...";
    try {
      const results = await Promise.all([api("/api/jobs"), api("/api/appointments")]);
      renderJobs(results[0]);
      renderAppointments(results[1]);
      status.textContent = "Authenticated workflow verified in the browser.";
      session.textContent = "Authenticated session active";
    } catch (err) {
      showError(err.message);
    }
  }

  document.getElementById("login").addEventListener("click", async () => {
    error.textContent = "";
    try {
      const response = await fetch("/api/auth/dev-login", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Authentication failed");
      localStorage.setItem(tokenKey, body.token);
      await loadApp();
    } catch (err) {
      showError(err.message);
    }
  });

  if (localStorage.getItem(tokenKey)) loadApp();
})();
