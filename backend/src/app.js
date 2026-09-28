const { SchedulingService } = require("./services/schedulingService");
const { AppointmentService } = require("./services/appointmentService");
const { Resource } = require("./models/resource");
const { Job } = require("./models/job");

function createAppState(seed = {}) {
  const resources = seed.resources || [new Resource({ id:"auditor-1", name:"Demo Auditor", role:"auditor", qualifications:["AMP","WX","ASHP","HS"] })];
  const availabilities = seed.availabilities || [{ resourceId:"auditor-1", startTime:"2026-10-01T08:00:00Z", endTime:"2026-10-01T17:00:00Z", available:true }];
  const assignments = seed.assignments || [], holds = seed.holds || [], appointments = seed.appointments || [];
  const jobs = seed.jobs || [new Job({ id:"job-1", organizationId:"demo-org", title:"Demo Client — 123 Main St", clientId:"client-1", serviceIds:["AMP","WX"], statusCode:"ready_to_schedule" })];
  const schedulingService = new SchedulingService({ resources, availabilities, assignments, holds, appointments });
  const appointmentService = new AppointmentService({
    appointmentStore:new Map(appointments.map(a=>[JSON.stringify([a.organizationId,a.id]),a])),
    holdStore:new Map(), schedulingHolds:holds, schedulingService
  });
  return { resources, availabilities, assignments, holds, appointments, jobs, schedulingService, appointmentService };
}
function principal(){return {userId:"demo-user",organizationId:"demo-org",permissions:["appointment:create","appointment:read","appointment:confirm","appointment:cancel"]};}
function json(res,status,body){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(body));}
async function readBody(req){let body="";for await(const chunk of req)body+=chunk;if(!body)return{};try{return JSON.parse(body)}catch{throw new Error("Request body must be valid JSON")}}
function createHandler(state){return async(req,res)=>{try{
 const url=new URL(req.url,"http://localhost"),path=url.pathname,p=principal();
 if(req.method==="GET"&&path==="/api/jobs")return json(res,200,state.jobs.filter(j=>j.organizationId===p.organizationId));
 if(req.method==="GET"&&path==="/api/resources")return json(res,200,state.resources.filter(r=>r.active!==false));
 if(req.method==="GET"&&path==="/api/appointments")return json(res,200,state.appointmentService.list({principal:p}).map(a=>({...a,startTime:a.startTime.toISOString(),endTime:a.endTime.toISOString()})));
 if(req.method==="GET"&&path==="/api/availability"){const duration=Number(url.searchParams.get("durationMinutes")||90),start=url.searchParams.get("start")||"2026-10-01T08:00:00Z",end=url.searchParams.get("end")||"2026-10-01T17:00:00Z";const slots=state.schedulingService.findAvailableSlots({organizationId:p.organizationId,serviceIds:(url.searchParams.get("services")||"AMP").split(",").filter(Boolean),startTime:start,endTime:end,durationMinutes:duration});return json(res,200,slots.map(s=>({...s,startTime:s.startTime.toISOString(),endTime:s.endTime.toISOString()})));}
 if(req.method==="POST"&&path==="/api/appointments"){const input=await readBody(req),a=state.appointmentService.create({principal:p,...input});return json(res,201,{...a,startTime:a.startTime.toISOString(),endTime:a.endTime.toISOString()});}
 if(req.method==="GET"&&path==="/health")return json(res,200,{status:"ok",service:"scheduling-platform"});
 return json(res,404,{error:"Route not found"});
}catch(error){const status=/authorized|principal/i.test(error.message)?403:/required|valid|after|available|overlapping/i.test(error.message)?400:500;return json(res,status,{error:error.message});}}}
module.exports={createAppState,createHandler};
