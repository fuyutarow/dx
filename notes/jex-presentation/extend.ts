// Fixed V5/V6 extension. Retain all earlier measurements; no CLI arguments.
import { mkdtempSync, mkdirSync } from "node:fs";
const root=import.meta.dir;
const result=await Bun.file(`${root}/results.json`).json();
const inputs=await Bun.file(`${root}/inputs.json`).json();
const raw=await Bun.file(`${root}/measurements.json`).json();
const provenance=await Bun.file(`${root}/provenance.json`).json();
if(result.rows.some((r:{variant:string})=>["V5","V6"].includes(r.variant)))throw new Error("extension already exists; refusing duplicate calls");
const scratch=mkdtempSync("/tmp/dx-jex-extension-");
const capture="/tmp/claude-1000/-home-fuyu-Workspace-research-record-v2/0d1c7e39-934e-4582-afa6-faafa2c963a6/scratchpad/dx015-prediction-capture";
const started=Date.now();
const oldCount=raw.length;
let count=0;
const jobs:{variant:string;record:string;run:number;cwd:string;args:string[]}[]=[];
const fixed=provenance.historical_request.questions["exclusive-outcomes"];
const firstBase=inputs.find((i:{variant:string;record:string})=>i.variant==="V1"&&i.record==="prediction");
const firstQuestion=Bun.TOML.parse(firstBase.questions).question[0].text;
const prefix=fixed.instructions.slice(0,-firstQuestion.length).trimEnd();
if(!fixed.instructions.endsWith(firstQuestion))throw new Error("V0 question suffix mismatch");
const command=Bun.spawnSync(["git","show","88b0dfc2:src/review-request.ts"],{cwd:root,timeout:10000});
if(command.exitCode!==0)throw new Error(command.stderr.toString());
provenance.criteria_origin={path:"88b0dfc2:src/review-request.ts",function:"assembleRequest",source:command.stdout.toString(),finding:"true/false and prefix are fixed strings added by dx 0.1.4 assembleRequest; research-record-v2 review-format.ts supplies linked evidence only",review_old_fallback:"No review-old V0 request in supplied capture. Borrow prediction generic wording unchanged for all statement question IDs; no custom wording added.",prefix,criteria:fixed.criteria};
await Bun.write(`${root}/provenance.json`,JSON.stringify(provenance,null,2)+"\n");
for(const variant of ["V5","V6"])for(const record of ["prediction","review-old"]){
  const base=inputs.find((i:{variant:string;record:string})=>i.variant==="V1"&&i.record===record);
  const source=Bun.TOML.parse(base.questions);
  const target=base.args[1];
  const targetLine=`審査対象は ${target}。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。`;
  const assembled=source.question.map((q:{id:string;text:string})=>{
    const original=provenance.historical_request.questions[q.id]??fixed;
    const lines=[targetLine,prefix,q.text,`はい: ${original.criteria.true}`,`いいえ: ${original.criteria.false}`];
    return {id:q.id,lines,text:lines.join("\n"),fallback:!provenance.historical_request.questions[q.id]};
  });
  const questions="schema = 1\n\n"+assembled.map((q:{id:string;text:string})=>`[[question]]\nid = ${JSON.stringify(q.id)}\ntext = ${JSON.stringify(q.text)}\n`).join("\n");
  const cwd=`${scratch}/${variant}/${record}`;
  mkdirSync(cwd,{recursive:true});
  await Bun.write(`${cwd}/questions.toml`,questions);
  const contents=[];
  for(const original of base.contents){
    const content=variant==="V6"?await Bun.file(`${capture}/repo/${original.path}`).text():original.content;
    const canonical=(value:Record<string,unknown>)=>JSON.stringify(Object.keys(value).sort().map(k=>[k,value[k]]));
    const semantic_equal=canonical(JSON.parse(original.content))===canonical(variant==="V6"?Bun.TOML.parse(content):JSON.parse(content));
    if(!semantic_equal)throw new Error("record semantics changed");
    mkdirSync(`${cwd}/${original.path.slice(0,original.path.lastIndexOf("/"))}`,{recursive:true});
    await Bun.write(`${cwd}/${original.path}`,content);
    contents.push({...original,content,semantic_equal,sha256:new Bun.CryptoHasher("sha256").update(content).digest("hex")});
  }
  const req=Bun.spawnSync(["jex","--request",...base.args],{cwd,timeout:10000});
  if(req.exitCode!==0)throw new Error(req.stderr.toString());
  inputs.push({variant,record,cwd,args:base.args,questions,contents,assembled,request:JSON.parse(req.stdout.toString())});
  for(let run=1;run<=3;run++)jobs.push({variant,record,run,cwd,args:base.args});
}
jobs.sort((a,b)=>a.run-b.run||a.variant.localeCompare(b.variant)||a.record.localeCompare(b.record));
await Bun.write(`${root}/inputs.json`,JSON.stringify(inputs,null,2)+"\n");
const tasks=jobs.slice();
let next=0;
function aggregate(){
 result.summary=[...new Set(result.rows.map((r:{variant:string;record:string})=>`${r.variant}/${r.record}`))].map(key=>{
  const group=result.rows.filter((r:{variant:string;record:string;p:number[]})=>`${r.variant}/${r.record}`===key&&r.p);
  const min=[0,1,2].map(i=>Math.min(...group.map((r:{p:number[]})=>r.p[i])));
  const max=[0,1,2].map(i=>Math.max(...group.map((r:{p:number[]})=>r.p[i])));
  return {variant:group[0].variant,record:group[0].record,n:group.length,mean:[0,1,2].map(i=>group.reduce((s:number,r:{p:number[]})=>s+r.p[i],0)/group.length),min,max,range:max.map((v,i)=>v-min[i]),source:group[0].status};
 });
 result.p2_table=["V0","V1","V2","V3","V4","V5","V6"].map(variant=>({variant,...Object.fromEntries(["prediction","review-old"].map(record=>{const s=result.summary.find((s:{variant:string;record:string})=>s.variant===variant&&s.record===record);return [record,s?{p2:result.rows.filter((r:{variant:string;record:string})=>r.variant===variant&&r.record===record).sort((a:{run:number},b:{run:number})=>a.run-b.run).map((r:{p:number[]})=>r.p[1]),mean:s.mean[1],min:s.min[1],max:s.max[1],range:s.range[1],n:s.n}:null];}))}));
 result.extension_comparisons=result.summary.filter((s:{variant:string})=>["V5","V6"].includes(s.variant)).map((s:{variant:string;record:string;mean:number[];range:number[]})=>{
 const base=result.summary.find((b:{variant:string;record:string})=>b.variant==="V1"&&b.record===s.record);
 const v4=result.summary.find((b:{variant:string;record:string})=>b.variant==="V4"&&b.record===s.record);
 const v0=result.summary.find((b:{variant:string;record:string})=>b.variant==="V0"&&b.record===s.record);
 return {variant:s.variant,record:s.record,mean:s.mean,range:s.range,p2_delta_from_V1:s.mean[1]-base.mean[1],p2_delta_from_V4:s.mean[1]-v4.mean[1],p2_delta_exceeds_V1_and_self_ranges:Math.abs(s.mean[1]-base.mean[1])>Math.max(base.range[1],s.range[1]),p2_delta_exceeds_V4_and_self_ranges:Math.abs(s.mean[1]-v4.mean[1])>Math.max(v4.range[1],s.range[1]),delta_from_V0:v0?s.mean.map((v,i)=>v-v0.mean[i]):null};
 });
}
async function save(status:string){
 aggregate();
 result.additional_experiment={...result.additional_experiment,status,previous_blocker_resolved:"coordinator authorizes saved V0 wording",additional_calls:count,remaining:tasks.filter(t=>!result.rows.some((r:{variant:string;record:string;run:number})=>r.variant===t.variant&&r.record===t.record&&r.run===t.run)),criteria_origin:"88b0dfc2:src/review-request.ts assembleRequest fixed strings",review_old_fallback:"prediction generic prefix/true/false borrowed unchanged; IDs do not match",started_at:new Date(started).toISOString()};
 result.progress={...result.progress,completed:raw.length,jev_calls:oldCount+count,remaining:result.additional_experiment.remaining};
 result.status=status;
 result.updated_at=new Date().toISOString();
 await Bun.write(`${root}/measurements.json`,JSON.stringify(raw,null,2)+"\n");
 await Bun.write(`${root}/results.json`,JSON.stringify(result,null,2)+"\n");
}
await save("extension_running");
const timer=setTimeout(()=>{void save("extension_five_minute");},300000);
try{
 await Promise.all(Array.from({length:3},async()=>{
  while(next<jobs.length){
   const job=jobs[next++];
   if(count>=12||Date.now()-started>510000)throw new Error("extension budget reached");
   count++;
   const child=Bun.spawn(["jex",...job.args],{cwd:job.cwd,stdout:"pipe",stderr:"pipe",signal:AbortSignal.timeout(90000)});
   const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
   const response=JSON.parse(stdout);
   const p=response.bits.map((b:{p:number})=>b.p);
   if(p.length!==3||p.some((v:number)=>!Number.isFinite(v)||v<0||v>1))throw new Error("invalid p");
   raw.push({...job,stdout,stderr,exit,finished_at:new Date().toISOString()});
   result.rows.push({variant:job.variant,record:job.record,run:job.run,p,pass:p.every((v:number)=>v>=0.5),status:"measured",exit});
   process.stdout.write(JSON.stringify({variant:job.variant,record:job.record,run:job.run,p,exit})+"\n");
   await save("extension_running");
  }
 }));
}finally{clearTimeout(timer);await save("extension_finished");}
