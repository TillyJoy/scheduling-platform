const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");

function source(){return fs.readFileSync("src/app.js","utf8");}

test("browser application entry parses as valid JavaScript",()=>{assert.doesNotThrow(()=>new vm.Script(source()));});

test("development login failure remains visible in the unauthenticated shell",async()=>{
  let loginHandler;
  const root={innerHTML:""};
  const button={disabled:false,addEventListener:(event,handler)=>{if(event==="click")loginHandler=handler;}};
  const document={
    getElementById(id){
      if(id==="root") return root;
      if(id==="development-login") return button;
      return null;
    },
    querySelectorAll(){return[]}
  };
  const shell={
    renderLoading(){},
    renderUnauthenticated(target,message){target.innerHTML=message||"Sign in to access the protected application.";},
    renderAuthenticated(){},
    renderError(){}
  };
  class AuthenticationError extends Error{}
  const auth={
    AuthenticationError,
    getSession:async()=>null,
    developmentLogin:async()=>{throw new Error("Development authentication failed");},
    logout(){}
  };
  const context={window:{},document,SchedulingAppShell:shell,SchedulingAuth:auth,console};
  vm.runInNewContext(source(),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof loginHandler,"function");
  await loginHandler({currentTarget:button});
  assert.equal(button.disabled,true);
  assert.equal(root.innerHTML,"Development authentication failed");
});


test("scheduler uses selected jobs and work orders instead of hard-coded appointment context", () => {
  const source = fs.readFileSync("src/app.js", "utf8");
  assert.match(source, /\/api\/work-orders\?jobId=/);
  assert.match(source, /workOrderId/);
  assert.match(source, /selectedJob\.clientId/);
  assert.match(source, /selectedJob\.metadata\?\.propertyId/);
  assert.doesNotMatch(source, /clientId:"client-1"/);
  assert.doesNotMatch(source, /propertyId:"property-1"/);
});
