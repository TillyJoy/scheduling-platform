(function (w) {
  const referencePermissions = ["job:read", "resource:read"];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function hasPermissions(session, permissions) {
    const granted = Array.isArray(session?.permissions) ? session.permissions : [];
    return permissions.every(permission => granted.includes(permission));
  }

  function permissionError() {
    const error = new Error("Your account does not have permission to manage assignments.");
    error.status = 403;
    return error;
  }

  function createController(api, idFactory = () => w.crypto.randomUUID()) {
    return Object.freeze({
      list(session) {
        if (!hasPermissions(session, ["assignment:read"])) throw permissionError();
        return api("/api/assignments");
      },

      get(session, assignmentId) {
        if (!hasPermissions(session, ["assignment:read"])) throw permissionError();
        return api(`/api/assignments/${encodeURIComponent(assignmentId)}`);
      },

      async references(session) {
        if (!hasPermissions(session, ["assignment:create", ...referencePermissions])) {
          return {
            available: false,
            missing: ["assignment:create", ...referencePermissions]
              .filter(permission => !session?.permissions?.includes(permission))
          };
        }
        const [jobs, resources] = await Promise.all([
          api("/api/jobs"),
          api("/api/resources")
        ]);
        return { available: true, jobs, resources, canReadWorkOrders: hasPermissions(session, ["workOrder:read"]) };
      },

      workOrders(session, jobId) {
        if (!hasPermissions(session, ["workOrder:read"])) throw permissionError();
        return api(`/api/work-orders?jobId=${encodeURIComponent(jobId)}`);
      },

      async create(session, input) {
        if (!hasPermissions(session, ["assignment:create", ...referencePermissions])) throw permissionError();
        if (!input.resourceId || !input.jobId && !input.workOrderId) {
          const error = new Error("Choose a resource and a job or work order.");
          error.status = 400;
          throw error;
        }
        const startTime = new Date(input.startTime);
        const endTime = new Date(input.endTime);
        if (!input.startTime || !input.endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
          const error = new Error("Enter a valid start and end time.");
          error.status = 400;
          throw error;
        }
        if (endTime <= startTime) {
          const error = new Error("End time must be after start time.");
          error.status = 400;
          throw error;
        }

        const assignment = {
          id: idFactory(),
          resourceId: input.resourceId,
          jobId: input.workOrderId ? null : (input.jobId || null),
          workOrderId: input.workOrderId || null,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        };
        return api("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(assignment)
        });
      }
    });
  }

  function errorMessage(error) {
    const message = String(error?.message || "");
    if (/already assigned to an overlapping assignment/i.test(message)) {
      return "This resource is already assigned during that time. Choose another resource or time.";
    }
    if (error?.status === 401) return "Your session expired. Sign in again to continue.";
    if (error?.status === 403) return "Your account does not have permission to complete this action.";
    if (error?.status === 404) return "A selected resource, job, work order, or assignment is no longer available in your organization. Refresh and try again.";
    if (error?.status === 409) return "The assignment conflicts with existing data. Refresh the list and choose another resource or time.";
    if (error?.status === 400) return message || "Check the assignment details and try again.";
    return message || "The assignment request could not be completed. Try again.";
  }

  function dateTime(value) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderWorkspace({
    canRead = false,
    assignments = [],
    canCreate = false,
    createBlockedMessage = "",
    jobs = [],
    resources = [],
    workOrders = [],
    canReadWorkOrders = true,
    selectedJobId = "",
    selectedAssignment = null,
    listError = "",
    referenceError = "",
    detailError = "",
    notice = ""
  } = {}) {
    const resourceNames = new Map(resources.map(resource => [resource.id, resource.name]));
    const jobNames = new Map(jobs.map(job => [job.id, job.title || job.id]));
    const selectedJob = jobs.find(job => job.id === selectedJobId);
    const assignmentRows = assignments.map(assignment => `
      <li class="assignment-row">
        <button class="assignment-detail" type="button" data-assignment-id="${escapeHtml(assignment.id)}">
          <strong>${escapeHtml(resourceNames.get(assignment.resourceId) || assignment.resourceId)}</strong>
          <span>${escapeHtml(jobNames.get(assignment.jobId) || assignment.jobId || assignment.workOrderId || "Work order")}</span>
          <span>${escapeHtml(dateTime(assignment.startTime))} – ${escapeHtml(dateTime(assignment.endTime))}</span>
        </button>
        <span class="assignment-status">${escapeHtml(assignment.statusCode || "Status not set")}</span>
      </li>`).join("");

    return `
      <section class="panel assignment-workflow">
        <header class="assignment-heading">
          <div><p class="eyebrow">Staff workspace</p><h2>Assignments</h2></div>
          <button id="refresh-assignments" type="button">Refresh</button>
        </header>
        ${notice ? `<p class="success" role="status">${escapeHtml(notice)}</p>` : ""}
        ${canRead ? `
          <section aria-labelledby="assignment-list-heading">
            <h3 id="assignment-list-heading">Current assignments</h3>
            ${listError ? `<p class="error" role="alert">${escapeHtml(listError)}</p>` : ""}
            ${assignmentRows ? `<ul class="assignment-list">${assignmentRows}</ul>` : `<p>${canRead && !listError ? "No assignments are available in your organization." : "Assignments could not be loaded."}</p>`}
          </section>` : `<p class="muted">Your account can create assignments but does not have permission to view the assignment list.</p>`}
        ${selectedAssignment ? `
          <section class="assignment-detail-panel" aria-labelledby="assignment-detail-heading">
            <h3 id="assignment-detail-heading">Assignment details</h3>
            <dl>
              <dt>Assignment ID</dt><dd>${escapeHtml(selectedAssignment.id)}</dd>
              <dt>Resource</dt><dd>${escapeHtml(resourceNames.get(selectedAssignment.resourceId) || selectedAssignment.resourceId)}</dd>
              <dt>Job</dt><dd>${escapeHtml(jobNames.get(selectedAssignment.jobId) || selectedAssignment.jobId || "Not linked")}</dd>
              <dt>Work order</dt><dd>${escapeHtml(selectedAssignment.workOrderId || "Not linked")}</dd>
              <dt>Schedule</dt><dd>${escapeHtml(dateTime(selectedAssignment.startTime))} – ${escapeHtml(dateTime(selectedAssignment.endTime))}</dd>
              <dt>Current status</dt><dd>${escapeHtml(selectedAssignment.statusCode || "Status not set")}</dd>
            </dl>
            <p class="muted">Status is read-only in this workspace. Lifecycle transitions are handled by the assignment status API.</p>
          </section>` : detailError ? `<p class="error" role="alert">${escapeHtml(detailError)}</p>` : ""}
        <section class="assignment-create-panel" aria-labelledby="assignment-create-heading">
          <h3 id="assignment-create-heading">Create assignment</h3>
          ${canCreate ? jobs.length && resources.length ? `
            ${referenceError ? `<p class="error" role="alert">${escapeHtml(referenceError)}</p>` : ""}
            <form id="assignment-create-form">
              <div class="assignment-form-grid">
                <label>Resource
                  <select name="resourceId" required>
                    <option value="">Choose a resource</option>
                    ${resources.map(resource => `<option value="${escapeHtml(resource.id)}">${escapeHtml(resource.name || resource.id)}</option>`).join("")}
                  </select>
                </label>
                <label>Job
                  <select id="assignment-job" name="jobId" required>
                    <option value="">Choose a job</option>
                    ${jobs.map(job => `<option value="${escapeHtml(job.id)}" ${job.id === selectedJobId ? "selected" : ""}>${escapeHtml(job.title || job.id)}</option>`).join("")}
                  </select>
                </label>
                <label>Work order <span class="muted">(optional)</span>
                  <select id="assignment-work-order" name="workOrderId" ${canReadWorkOrders ? "" : "disabled"}>
                    <option value="">${canReadWorkOrders ? "No work order" : "Work-order access unavailable"}</option>
                    ${workOrders.map(order => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.number || order.id)} — ${escapeHtml(order.title || "Untitled work order")}</option>`).join("")}
                  </select>
                </label>
                <label>Start
                  <input name="startTime" type="datetime-local" required>
                </label>
                <label>End
                  <input name="endTime" type="datetime-local" required>
                </label>
              </div>
              ${selectedJob ? `<p class="muted">Selected job: ${escapeHtml(selectedJob.title || selectedJob.id)}</p>` : ""}
              <p class="muted">The organization is taken from your authenticated session. It is never selected in this form.</p>
              ${canReadWorkOrders ? "" : '<p class="muted">You can still create a job-based assignment. Work-order choices require workOrder:read access.</p>'}
              <p id="assignment-feedback" role="status" aria-live="polite"></p>
              <button type="submit" ${jobs.length && resources.length ? "" : "disabled"}>Create assignment</button>
            </form>` : `<p class="error" role="alert">No active resources or jobs are available to this organization.</p>` : `<p class="muted">${escapeHtml(createBlockedMessage || "Your account does not have the permissions needed to create assignments.")}</p>`}
        </section>
      </section>`;
  }

  w.SchedulingAssignmentWorkflow = Object.freeze({
    createController,
    errorMessage,
    renderWorkspace,
    dateTime
  });
})(window);
