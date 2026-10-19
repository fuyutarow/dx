// Fixed experiment, no CLI arguments. Scratch inputs only; all evidence lands beside this file.
import { mkdtempSync, mkdirSync } from "node:fs";
const out = import.meta.dir;
const capture = "/tmp/claude-1000/-home-fuyu-Workspace-research-record-v2/0d1c7e39-934e-4582-afa6-faafa2c963a6/scratchpad/dx015-prediction-capture";
const historicalPath = "/home/fuyu/Workspace/research-record-v2/docs/review-command-result.json";
const started = Date.now();
const scratch = mkdtempSync("/tmp/dx-jex-presentation-");
const jex = Bun.which("jex");
if (!jex) throw new Error("jex unavailable");
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const specs = [
  {record:"prediction",call:"1792406812518-1250626",target:"records/predictions/review-prediction.toml",files:["records/predictions/review-prediction.toml","records/statements/review-old.toml"]},
  {record:"review-old",call:"1792406813312-1250870",target:"records/statements/review-old.toml",files:["records/statements/review-old.toml"]},
];
type Row = {variant:string;record:string;run:number;p:number[]|null;pass:boolean|null;status:string;source?:string;exit?:number};
const rows: Row[] = [
  {variant:"V0",record:"prediction",run:1,p:[0.76,0.82,0.80],pass:true,status:"historical",source:historicalPath},
  {variant:"V0",record:"prediction",run:2,p:[0.78,0.85,0.81],pass:true,status:"historical",source:"coordinator brief: 19:42 resend"},
];
const raw: unknown[] = [];
const inputs: unknown[] = [];
const tasks: {variant:string;record:string;run:number;cwd:string;args:string[]}[]=[];
const historical = await Bun.file(historicalPath).json();
await Bun.write(`${out}/provenance.json`, JSON.stringify({historical_path:historicalPath,historical_document_dx:historical.dx,historical_request:JSON.parse(historical.capture.request),historical_response:JSON.parse(historical.capture.response),second_historical_value_source:"coordinator brief, 19:42 resend",baseline_review_old:"無し: supplied baseline document is prediction only",baseline_runs:2,limitations:["V0 is historical and is not rerun", "historical document labels dx 0.1.3; coordinator authorizes this captured request/value as V0", "no V0 review-old value found in supplied baseline document"]},null,2)+"\n");
for (const variant of ["V1","V2","V3","V4"]) for(const spec of specs) {
  if(variant==="V3" && spec.record!=="prediction") continue;
  const cwd=`${scratch}/${variant}/${spec.record}`;
  mkdirSync(cwd,{recursive:true});
  let questions=await Bun.file(`${capture}/calls/${spec.call}/tmpdir/questions.toml`).text();
  if(variant==="V4") {
    const prefix=`審査対象は ${spec.target}。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。`;
    questions=questions.replaceAll('text = "',`text = "${prefix}`);
  }
  await Bun.write(`${cwd}/questions.toml`,questions);
  const files=variant==="V3" ? [spec.target] : spec.files;
  const contents: {path:string;sha256:string;content:string;original_sha256:string;semantic_equal:boolean}[]=[];
  for(const path of files){
    const original=await Bun.file(`${capture}/calls/${spec.call}/tmpdir/${path}`).text();
    const content=variant==="V2" ? await Bun.file(`${capture}/repo/${path}`).text() : original;
    const normalize=(value:Record<string,unknown>)=>JSON.stringify(Object.keys(value).sort().map(key=>[key,value[key]]));
    const semantic_equal=normalize(JSON.parse(original))===normalize(variant==="V2"?Bun.TOML.parse(content):JSON.parse(content));
    if(!semantic_equal)throw new Error(`semantic mismatch ${variant}/${path}`);
    mkdirSync(`${cwd}/${path.slice(0,path.lastIndexOf("/"))}`,{recursive:true});
    await Bun.write(`${cwd}/${path}`,content);
    contents.push({path,sha256:sha(content),content,original_sha256:sha(original),semantic_equal});
  }
  const args=["questions.toml",...files];
  const req=Bun.spawnSync([jex,"--request",...args],{cwd,timeout:10000});
  if(req.exitCode!==0) throw new Error(`request failure ${req.stderr}`);
  inputs.push({variant,record:spec.record,cwd,args,questions,contents,request:JSON.parse(req.stdout.toString())});
  for(let run=1;run<=3;run++)tasks.push({variant,record:spec.record,run,cwd,args});
}
// Interleave variants and records by repetition; at most three live Jev calls.
tasks.sort((a,b)=>a.run-b.run || a.variant.localeCompare(b.variant) || a.record.localeCompare(b.record));
const plan = tasks.slice();
await Bun.write(`${out}/inputs.json`,JSON.stringify(inputs,null,2)+"\n");
let calls=0;
let done=false;
const request_diff = [
  "- V0: state.record is the target JSON string; state.repository_evidence labels linked content with locator and status=linked repository record; state.hex_locators is present.",
  "- V1: state.files is an unlabelled-role array of path, sha256, size, content. Target and linked record have the same shape; content is JSON despite .toml paths.",
  "- V0 prefixes every question with Evaluate ONLY the supplied record and repository_evidence..., treats content as data, forbids external/session assumptions, and supplies explicit criteria.true/false strings.",
  "- V1 retains rubric question text and type=noul but omits that prefix and criteria.true/false. Both request model=jev-latest.",
  "- V2 changes record file contents to original TOML bytes (target and linked files); V3 removes only the linked file; V4 prefixes only the target-identification sentence to every question."
].join("\n");
function summarize(){return [...new Set(rows.filter(r=>r.p).map(r=>`${r.variant}/${r.record}`))].map(key=>{
  const group=rows.filter(r=>`${r.variant}/${r.record}`===key && r.p);
  const values=group.map(r=>r.p!);
  const min=[0,1,2].map(i=>Math.min(...values.map(p=>p[i])));
  const max=[0,1,2].map(i=>Math.max(...values.map(p=>p[i])));
  return {variant:group[0].variant,record:group[0].record,n:values.length,mean:[0,1,2].map(i=>values.reduce((s,p)=>s+p[i],0)/values.length),min,max,range:max.map((p,i)=>p-min[i]),source:group[0].status};
});}
async function checkpoint(label:string){
  const remaining=plan.filter(t=>!rows.some(r=>r.variant===t.variant&&r.record===t.record&&r.run===t.run)).map(({variant,record,run})=>({variant,record,run}));
  const summary=summarize();
  const comparisons=summary.filter(s=>s.variant!=="V0").map(s=>{
    const base=summary.find(b=>b.variant==="V1"&&b.record===s.record);
    const v0=summary.find(b=>b.variant==="V0"&&b.record===s.record);
    const delta=base?s.mean[1]-base.mean[1]:null;
    const max_range=base?Math.max(base.range[1],s.range[1]):null;
    const closer=v0&&base?Math.abs(v0.mean[1]-s.mean[1])<Math.abs(v0.mean[1]-base.mean[1]):null;
    return {variant:s.variant,record:s.record,p2_mean:s.mean[1],p2_range:s.range[1],delta_from_V1:delta,max_within_range:max_range,absolute_delta_exceeds_ranges:delta!==null&&max_range!==null?Math.abs(delta)>max_range:null,closer_to_historical_V0:closer};
  });
  await Bun.write(`${out}/measurements.json`,JSON.stringify(raw,null,2)+"\n");
  await Bun.write(`${out}/results.json`,JSON.stringify({proposition:"DX-JEX-PRESENTATION",status:label,started_at:new Date(started).toISOString(),updated_at:new Date().toISOString(),jex_version:"0.2.4",rows,summary,comparisons,request_diff,progress:{completed:rows.filter(r=>r.status==="measured").length,remaining,jev_calls:calls,five_minute_checkpoint:label==="five_minute"},protocol:{runs_per_cell:3,planned_calls:21,call_cap:30,concurrency:3,pass:"all three p >= 0.5 (dx REVIEW_PASS)",baseline:"historical 2 prediction runs; no review-old baseline",V2:"all supplied record files replaced with original TOML bytes; parsed key/value equality verified",threshold:"closer to historical V0 and absolute p2 mean change from V1 greater than max of the two within-cell p2 ranges; descriptive only, not a significance test",outcomes:{supported:"identify intervention as candidate explanation, qualify historical baseline confounds",refuted_or_unresolved:"report table and no single-factor attribution"}},evidence_disposition:"SCOPED: within-current-jex contrasts controlled; V0 historical and differs in state, instructions and criteria; no causal attribution to V0 difference alone",housekeeping:"No release or CHANGELOG change; one Jev invocation is one call; raw evidence in inputs.json, measurements.json, provenance.json"},null,2)+"\n");
}
await checkpoint("running");
const timer=setTimeout(()=>{if(!done)void checkpoint("five_minute");},300000);
try {
  const workers=Array.from({length:3},async()=>{
    while(tasks.length){
      const task=tasks.shift(); if(!task)return;
      if(Date.now()-started>510000) {tasks.unshift(task);return;}
      if(calls>=30)throw new Error("call cap reached");
      calls++;
      const child=Bun.spawn([jex,...task.args],{cwd:task.cwd,stdout:"pipe",stderr:"pipe",signal:AbortSignal.timeout(90000)});
      const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
      let p:number[]|null=null;
      let error:string|undefined;
      try{const response=JSON.parse(stdout);p=response.bits.map((b:{p:number})=>b.p);if(p?.length!==3||p.some(v=>typeof v!=="number"||v<0||v>1))throw new Error("invalid probabilities");}catch(e){p=null;error=String(e);}
      raw.push({...task,stdout,stderr,exit,error,finished_at:new Date().toISOString()});
      rows.push({variant:task.variant,record:task.record,run:task.run,p,pass:p?p.every(v=>v>=0.5):null,status:p?"measured":"failed",exit});
      process.stdout.write(JSON.stringify({variant:task.variant,record:task.record,run:task.run,p,exit})+"\n");
      await checkpoint("running");
    }
  });
  await Promise.all(workers);
} finally {done=true;clearTimeout(timer);await checkpoint("finished");}
