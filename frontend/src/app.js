const root = document.getElementById("root");

async function api(path, options = {}) {
  const response = await SchedulingAuth.authenticatedFetch(path, options);
  let data = {};
  try { data = await response.json(); } catch { data = { error: "The server returned an invalid response." }; }
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character])); }
function formatTime(value) { return new Date(value).toLocaleTimeString([], { timeZone:"UTC", hour:"numeric", minute:"2-digit" }); }
function dateWindow(dateValue) { const day=new Date(`${dateValue}T00:00:00Z`); return {start:day.toISOString(),end:new Date(day.getTime()+24*60*60000).toISOString()}; }
async function load(dateValue = new Date().toISOString().slice(0,10)) {
  const workspace=document.getElementById("workspace");
  if(!workspace) return;
  workspace.innerHTML="<section class="panel"><p>Loading scheduler…</p></section>";
  try {
    const window=dateWindow(dateValue);
    const [jobs,resources,appointments,slots]=await Promise.all([
      api("/api/jobs"),api("/api/resources"),api("/api/appointments"),
      api(`/api/availability?durationMinutes=90&start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`)
    ]);
    workspace.innerHTML=`<main class="scheduler-existing"><header><div><h1>Scheduling Platform</h1><p>Scheduler MVP</p></div><span class="status">API online</span></header><label class="date-control">Schedule date <input id="schedule-date" type="date" value="${escapeHtml(dateValue)}"></label><section class="grid"><article><h2>Scheduling Queue</h2><div id="jobs"></div></article><article><h2>Available Times</h2><div id="slots"></div></article><article><h2>Appointments</h2><div id="appointments"></div></article></section></main>`;
    document.getElementById("jobs").innerHTML=jobs.map(job=>`<div class="row"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.statusCode||"—")}</span></div>`).join("");
    document.getElementById("slots").innerHTML=slots.slice(0,12).map(slot=>`<button class="slot" data-start="${escapeHtml(slot.startTime)}" data-end="${escapeHtml(slot.endTime)}" data-resource="${escapeHtml(slot.resourceId)}">${escapeHtml(formatTime(slot.startTime))} – ${escapeHtml(formatTime(slot.endTime))} · ${escapeHtml(resources.find(resource=>resource.id===slot.resourceId)?.name||slot.resourceId)}</button>`).join("")||"<p>No available times.</p>";
    document.getElementById("appointments").innerHTML=appointments.map(appointment=>`<div class="row"><strong>${escapeHtml(formatTime(appointment.startTime))} – ${escapeHtml(formatTime(appointment.endTime))}</strong><span>${escapeHtml(appointment.status)}</span></div>`).join("")||"<p>No appointments yet.</p>";
    document.getElementById("schedule-date").addEventListener("change",event=>load(event.target.value));
    document.querySelectorAll(".slot").forEach(button=>button.addEventListener("click",async()=>{
      button.disabled=true;
      try {
        await api("/api/appointments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:crypto.randomUUID(),clientId:"client-1",propertyId:"property-1",serviceIds:["AMP"],memberIds:[button.dataset.resource],startTime:button.dataset.start,endTime:button.dataset.end})});
        await load(document.getElementById("schedule-date")?.value||dateValue);
      } catch(error) { alert(error.message); button.disabled=false; }
    }));
  } catch(error) {
    if(error instanceof SchedulingAuth.AuthenticationError) throw error;
    workspace.innerHTML=`<section class="panel"><p class="error">Unable to connect to the API: ${escapeHtml(error.message)}</p></section>`;
  }
}
window.SchedulingScheduler=Object.freeze({load});
async function boot() {
  SchedulingAppShell.renderLoading(root);
  try {
    const session=await SchedulingAuth.getSession();
    if(!session){ bindUnauthenticated(); return; }
    SchedulingAppShell.renderAuthenticated(root,session);
    document.getElementById("logout")?.addEventListener("click",()=>{SchedulingAuth.logout();bindUnauthenticated("You have been signed out.");});
    await load();
  } catch(error) {
    if(error instanceof SchedulingAuth.AuthenticationError){ bindUnauthenticated("Your session has expired. Sign in again."); return; }
    SchedulingAppShell.renderError(root,error.message);
    document.getElementById("retry-application")?.addEventListener("click",boot);
  }
}
function bindUnauthenticated(message) {
  SchedulingAppShell.renderUnauthenticated(root,message);
  document.getElementById("development-login")?.addEventListener("click",async event=>{
    event.currentTarget.disabled=true;
    try { const session=await SchedulingAuth.developmentLogin(); if(!session) throw new Error("Authentication did not establish a valid session."); SchedulingAppShell.renderAuthenticated(root,session); document.getElementById("logout")?.addEventListener("click",()=>{SchedulingAuth.logout();bindUnauthenticated("You have been signed out.");}); await load(); }
    catch(error){ SchedulingAppShell.renderUnauthenticated(root,error.message); bindUnauthenticated(); }
  });
}
boot();
