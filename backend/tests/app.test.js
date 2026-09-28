const test=require("node:test");const assert=require("node:assert/strict");const http=require("http");const{createAppState,createHandler}=require("../src/app");
function request(server,method,path,body){return new Promise((resolve,reject)=>{const req=http.request(server,{method,path,headers:{"Content-Type":"application/json"}},res=>{let data="";res.on("data",c=>data+=c);res.on("end",()=>resolve({status:res.statusCode,body:JSON.parse(data)}));});req.on("error",reject);if(body)req.write(JSON.stringify(body));req.end()})}
test("application exposes jobs, availability, and appointment conflict protection",async()=>{const server=http.createServer(createHandler(createAppState()));await new Promise(r=>server.listen(0,r));
const jobs=await request(server,"GET","/api/jobs");assert.equal(jobs.status,200);assert.equal(jobs.body.length,1);
const slots=await request(server,"GET","/api/availability?durationMinutes=90&start=2026-10-01T08:00:00Z&end=2026-10-01T17:00:00Z");assert.equal(slots.status,200);assert.ok(slots.body.length>0);
const s=slots.body[0];const input={organizationId:"demo-org",clientId:"client-1",propertyId:"property-1",serviceIds:["AMP"],memberIds:[s.resourceId],startTime:s.startTime,endTime:s.endTime};
const created=await request(server,"POST","/api/appointments",{...input,id:"appointment-1"});assert.equal(created.status,201);
const list=await request(server,"GET","/api/appointments");assert.equal(list.body.length,1);
const conflict=await request(server,"POST","/api/appointments",{...input,id:"appointment-2",clientId:"client-2"});assert.equal(conflict.status,400);
await new Promise(r=>server.close(r));});
