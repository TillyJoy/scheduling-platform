const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
function load(token,fetchImpl){let t=token;const c={window:{localStorage:{getItem:()=>t,setItem:(_,v)=>t=v,removeItem:()=>t=null},fetch:fetchImpl}};vm.runInNewContext(fs.readFileSync("src/auth.js","utf8"),c);return{auth:c.window.SchedulingAuth,get:()=>t}}
function res(status,body){return{status,ok:status>=200&&status<300,json:async()=>body}}
test("no token means unauthenticated",async()=>{let n=0;const{auth}=load(null,async()=>n++);assert.equal(await auth.getSession(),null);assert.equal(n,0)});
test("trusted context is loaded with bearer token",async()=>{const{auth}=load("t",async(p,o)=>{assert.equal(p,"/api/auth/me");assert.equal(o.headers.Authorization,"Bearer t");return res(200,{userId:"u",organizationId:"o",permissions:["job:read"]})});const s=await auth.getSession();assert.equal(s.userId,"u");assert.equal(s.organizationId,"o");assert.deepEqual(s.permissions,["job:read"])});
test("401 clears stale session",async()=>{const{auth,get}=load("expired",async()=>res(401,{}));assert.equal(await auth.getSession(),null);assert.equal(get(),null)});
test("logout clears state",()=>{const{auth,get}=load("t",async()=>res(200,{}));auth.logout();assert.equal(get(),null)});
test("401 from authenticated request clears token",async()=>{const{auth,get}=load("t",async(_p,o)=>{assert.equal(o.headers.Authorization,"Bearer t");return res(401,{})});await assert.rejects(()=>auth.authenticatedFetch("/api/x"),e=>e.status===401);assert.equal(get(),null)});
