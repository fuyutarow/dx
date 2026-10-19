// Read-only verification of the saved experiment; never calls Jev.
const root=import.meta.dir;
const result=await Bun.file(`${root}/results.json`).json();
const inputs=await Bun.file(`${root}/inputs.json`).json();
const raw=await Bun.file(`${root}/measurements.json`).json();
const provenance=await Bun.file(`${root}/provenance.json`).json();
function check(ok:boolean,message:string){if(!ok)throw new Error(message);}
check(result.rows.length===35,"33 measured + 2 historical rows");
check(raw.length===33&&result.progress.jev_calls===33,"call count");
check(result.additional_experiment.additional_calls===12,"extension count");
check(result.progress.remaining.length===0,"unfinished cells");
check(result.p2_table.length===7,"seven variants");
const modelNames=new Set<string>();
for(const input of inputs){
  const group=result.rows.filter((r:{variant:string;record:string})=>r.variant===input.variant&&r.record===input.record);
  check(group.length===3,"three repetitions per cell");
  check(new Set(group.map((r:{run:number})=>r.run)).size===3,"unique repetition IDs");
  for(const file of input.contents){
    const hash=new Bun.CryptoHasher("sha256").update(file.content).digest("hex");
    check(hash===file.sha256&&file.semantic_equal,"input digest and semantics");
    const sent=input.request.state.files.find((f:{path:string})=>f.path===file.path);
    check(sent?.content===file.content&&sent.sha256===hash,"request uses intended bytes");
  }
  const base=inputs.find((i:{variant:string;record:string})=>i.variant==="V1"&&i.record===input.record);
  if(!["V4","V5","V6"].includes(input.variant))check(input.questions===base.questions,"unmodified questions");
  if(input.variant==="V4"){
    const prefix=`審査対象は ${input.args[1]}。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。`;
    check(input.questions===base.questions.replaceAll('text = "',`text = "${prefix}`),"only target-identification prefix changes");
  }
  if(input.variant==="V3")check(input.contents.length===1,"link removed");
  if(["V5","V6"].includes(input.variant)){
    const original=Bun.TOML.parse(base.questions).question;
    const questions=Bun.TOML.parse(input.questions).question;
    const target=`審査対象は ${input.args[1]}。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。`;
    for(let i=0;i<3;i++){
      const expected=[target,provenance.criteria_origin.prefix,original[i].text,`はい: ${provenance.criteria_origin.criteria.true}`,`いいえ: ${provenance.criteria_origin.criteria.false}`].join("\n");
      check(questions[i].id===original[i].id&&questions[i].text===expected,"five-line question uses exact V0 wording and original rubric question");
      check(input.request.questions[questions[i].id].instructions===expected,"five-line question reached Jev request");
    }
    const bytesReference=inputs.find((j:{variant:string;record:string})=>j.variant===(input.variant==="V5"?"V1":"V2")&&j.record===input.record);
    check(input.contents.every((f:{path:string;content:string})=>bytesReference.contents.find((b:{path:string})=>b.path===f.path)?.content===f.content),"V5 JSON / V6 original TOML bytes");
  }
}
for(const call of raw){
  check(call.exit===0||call.exit===1,"successful judgement process");
  const response=JSON.parse(call.stdout);
  modelNames.add(response.model);
  const row=result.rows.find((r:{variant:string;record:string;run:number})=>r.variant===call.variant&&r.record===call.record&&r.run===call.run);
  check(JSON.stringify(response.bits.map((b:{p:number})=>b.p))===JSON.stringify(row.p),"raw probability correspondence");
  check(row.p.length===3&&row.p.every((p:number)=>Number.isFinite(p)&&p>=0&&p<=1),"valid probabilities");
  check(row.pass===row.p.every((p:number)=>p>=0.5),"dx threshold");
}
for(const summary of result.summary){
  const rows=result.rows.filter((r:{variant:string;record:string})=>r.variant===summary.variant&&r.record===summary.record);
  for(let i=0;i<3;i++){
    check(Math.abs(summary.mean[i]-rows.reduce((s:number,r:{p:number[]})=>s+r.p[i],0)/rows.length)<1e-12,"mean");
    check(summary.min[i]===Math.min(...rows.map((r:{p:number[]})=>r.p[i])),"minimum");
    check(summary.max[i]===Math.max(...rows.map((r:{p:number[]})=>r.p[i])),"maximum");
  }
}
check(modelNames.size===1,"single observed Jev model");
process.stdout.write(`PASS: 33 real judgements, 11 cells x 3 runs; 2 historical rows; input bytes, exact five-line V5/V6 questions, raw p, pass and summaries verified; model=${[...modelNames].join(",")}\n`);
