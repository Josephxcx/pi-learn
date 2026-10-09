import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMudalMasterIndex, parseSasMasterDashboard, parseMudalPYQs, resolveActiveExamTaxonomy } from "../extensions/prioritization/prioritization-parser.ts";
import { buildDependencyGraph, prioritizeTaxonomy, calculateFoundationScore, calculateExamPriority } from "../extensions/prioritization/prioritization-engine.ts";
import { renderSubtopicDossier } from "../extensions/prioritization/prioritization-presenter.ts";
import type { ExamTaxonomy, PYQItem, PYQDataset } from "../extensions/prioritization/prioritization-types.ts";

function taxonomy(): ExamTaxonomy {
  return {examId:"sample",examTitle:"Sample",totalMarks:100,vaultRelativeDir:"sample",units:[{id:"u",unitNumber:1,title:"Computing",paper:"Paper II",officialMarks:0,subtopics:[
    {id:"keys",title:"Database keys",prerequisites:[],masteryStatus:"pending",cognitiveFriction:2.5},
    {id:"sql",title:"SQL",prerequisites:["keys"],masteryStatus:"pending",cognitiveFriction:2.5},
    {id:"joins",title:"Joins",prerequisites:["sql"],masteryStatus:"pending",cognitiveFriction:2.5},
  ]}]};
}
function question(id:string, paperName:string, subtopicId="keys"):PYQItem {return {id,examId:"sample",paperName,year:2025,marks:1,unitId:"u",subtopicId,questionText:`Question ${id}`};}

test("Paper II remains Paper II and missing official marks remain unknown",()=>{
  const result=parseMudalMasterIndex("### Technical Paper II\n#### Unit II – Databases\n- [ ] **1. Keys (primary, candidate)**");
  assert.equal(result.units[0]!.paper,"Technical Paper II");
  assert.equal(result.units[0]!.officialMarks,undefined);
  assert.match(result.units[0]!.subtopics[0]!.title,/primary, candidate/);
  assert.equal(result.totalMarks,undefined);
});
test("SAS wiki aliases and empty cells do not shift table columns or fabricate marks",()=>{
 const result=parseSasMasterDashboard("## Paper III\n### 1. Soil Science (40 Marks)\n| Module | Scope | PYQs | Note | Status |\n| --- | --- | --- | --- | --- |\n| **01. Soil fertility** | | 20 | [[Notes/Soil|Soil notes]] | Mastered |\n");
 const sub=result.units[0]!.subtopics[0]!;
 assert.equal(sub.notePath,"Notes/Soil");assert.equal(sub.masteryStatus,"mastered");assert.equal(sub.syllabusScope,"");assert.equal(sub.officialMarks,undefined);
});
test("legacy PYQs preserve missing year and marks and leave unmatched questions unassigned",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pi-pyq-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,"Paper_II.md"),"### Q1. What is the capital of Mizoram?\n**Source:** unknown\n");
 const result=parseMudalPYQs(dir,taxonomy());assert.equal(result.length,1);assert.equal(result[0]!.year,undefined);assert.equal(result[0]!.marks,undefined);assert.equal(result[0]!.subtopicId,undefined);assert.equal(result[0]!.unitId,undefined);
});
test("unknown preferred exam never silently selects another exam",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pi-exam-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,"MUDAL-System-Manager"));fs.writeFileSync(path.join(dir,"MUDAL-System-Manager","00_Master_Index.md"),"");
 assert.equal(resolveActiveExamTaxonomy(dir,"unrelated"),null);
});
test("multiple available exams require an explicit selection",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pi-exam-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const [folder,name] of [["MUDAL-System-Manager","00_Master_Index.md"],["SAS-I","00 - Syllabus & Mastery Dashboard.md"]] as const) {fs.mkdirSync(path.join(dir,folder));fs.writeFileSync(path.join(dir,folder,name),"");}
 assert.throws(()=>resolveActiveExamTaxonomy(dir),/multiple|ambiguous/i);
});
test("dependency graph rejects unknown prerequisites and cycles",()=>{
 const data=taxonomy();data.units[0]!.subtopics[0]!.prerequisites=["missing"];
 assert.throws(()=>buildDependencyGraph(data.units),/unknown|missing/i);
 data.units[0]!.subtopics[0]!.prerequisites=["joins"];
 assert.throws(()=>buildDependencyGraph(data.units),/cycle/i);
});
test("scores preserve true zero and count transitive prerequisites",()=>{
 const result=prioritizeTaxonomy(taxonomy(),[]);
 assert.equal(result.find(x=>x.subtopic.id==="joins")?.score.examPriorityScore,0);
 assert.equal(result.find(x=>x.subtopic.id==="joins")?.score.metrics.transitivePrereqCount,2);
 assert.ok(result.every(x=>!x.score.evidenceBadges.includes("New Syllabus")));
});
test("paper coverage counts separate papers within the same year",()=>{
 const result=prioritizeTaxonomy(taxonomy(),[question("q1","Paper I"),question("q2","Paper II"),question("q3","Paper III","sql")]);
 const score=result.find(x=>x.subtopic.id==="keys")!.score;
 assert.equal(score.metrics.consistencyPct,66.7);assert.equal(score.metrics.yearsCovered,1);
});
test("repeated years without a measured increase never imply a rising trend",()=>{
 const questions=[question("a","Paper I"),question("b","Paper I"),{...question("c","Paper I"),year:2024}];
 const result=prioritizeTaxonomy(taxonomy(),questions);
 assert.ok(!result[0]!.score.evidenceBadges.includes("Rising Trend"));
});
test("zero dependent priority is not replaced with 50",()=>{
 const map=new Map([["keys",[{id:"sql",distance:1}]]]);
 assert.equal(calculateFoundationScore("keys",map,new Map([["sql",0]]),2).downstreamMarks,0);
});
test("presentation does not describe score units as marks or predict hourly returns",()=>{
 const result=renderSubtopicDossier(prioritizeTaxonomy(taxonomy(),[])[0]!);
 assert.doesNotMatch(result,/Expected Score Return per Hour|\d+ marks|exam sittings/);
 assert.match(result,/heuristic|Heuristic/);
});

test("JSON taxonomy loader validates profile dimensions and dependency references",async()=>{
 const parser=await import("../extensions/prioritization/prioritization-parser.ts");
 assert.equal(typeof parser.parseExamTaxonomyJson,"function");
 const data={...taxonomy(),schemaVersion:1,profile:{post:"Assistant",authority:"Commission",group:"B",gazettedStatus:"unknown",recruitmentRoute:"Direct",syllabusVersion:"2026",difficultyGuidance:"Use the paper's stated syllabus."}};
 const result=parser.parseExamTaxonomyJson(JSON.stringify(data));assert.equal(result.profile?.group,"B");assert.equal(result.profile?.gazettedStatus,"unknown");
 assert.throws(()=>parser.parseExamTaxonomyJson(JSON.stringify({...data,totalMarks:-1})),/totalMarks/);
 data.units[0]!.subtopics[0]!.prerequisites=["missing"];
 assert.throws(()=>parser.parseExamTaxonomyJson(JSON.stringify(data)),/missing/);
});
test("JSON questions validate taxonomy mapping and preserve unknown evidence",async()=>{
 const parser=await import("../extensions/prioritization/prioritization-parser.ts");assert.equal(typeof parser.parsePYQDatasetJson,"function");
 const dataset={schemaVersion:1,examId:"sample",papers:[{id:"p2025",paperName:"Paper II",year:2025,complete:true}],questions:[{id:"q",paperId:"p2025",questionText:"What are keys?",subtopicId:"keys"},{id:"u",questionText:"Unmapped"}]};
 const parsed=parser.parsePYQDatasetJson(JSON.stringify(dataset),taxonomy());
 assert.equal(parsed.questions[0]!.year,2025);assert.equal(parsed.questions[0]!.unitId,"u");assert.equal(parsed.questions[0]!.marks,undefined);assert.equal(parsed.questions[1]!.subtopicId,undefined);assert.ok(parsed.diagnostics.length>0);
 assert.throws(()=>parser.parsePYQDatasetJson(JSON.stringify({...dataset,examId:"different"}),taxonomy()),/examId/);
 assert.throws(()=>parser.parsePYQDatasetJson(JSON.stringify({...dataset,questions:[{...dataset.questions[0]!,subtopicId:"nonexistent"}]}),taxonomy()),/nonexistent|subtopic/);
});
test("source duplicates are removed but repeat questions in different sittings survive",async()=>{
 const parser=await import("../extensions/prioritization/prioritization-parser.ts");assert.equal(typeof parser.parsePYQDatasetJson,"function");
 const q={id:"q1",sourceQuestionId:"canonical-7",paperId:"p1",marks:2,questionText:"What are keys?",subtopicId:"keys"};
 const data={schemaVersion:1,examId:"sample",papers:[{id:"p1",paperName:"II",year:2024,complete:true},{id:"p2",paperName:"II",year:2025,complete:true}],questions:[q,{...q,id:"copy"},{...q,id:"repeat",paperId:"p2"}]};
 const result=parser.parsePYQDatasetJson(JSON.stringify(data),taxonomy());assert.equal(result.questions.length,2);assert.match(result.diagnostics.map(d=>d.message).join(" "),/duplicate/i);
 const scores=prioritizeTaxonomy(taxonomy(),result);assert.equal(scores.find(s=>s.subtopic.id==="keys")!.score.metrics.totalPYQs,2);
});
test("analyzed paper manifest includes papers with no matching question",async()=>{
 const parser=await import("../extensions/prioritization/prioritization-parser.ts");assert.equal(typeof parser.parsePYQDatasetJson,"function");
 const data={schemaVersion:1,examId:"sample",papers:[{id:"p1",paperName:"I",year:2025,complete:true},{id:"p2",paperName:"II",year:2025,complete:true}],questions:[{id:"q1",paperId:"p1",marks:0,questionText:"Keys",subtopicId:"keys"}]};
 const score=prioritizeTaxonomy(taxonomy(),parser.parsePYQDatasetJson(JSON.stringify(data),taxonomy())).find(s=>s.subtopic.id==="keys")!.score;
 assert.equal(score.metrics.consistencyPct,50);assert.equal(score.metrics.decayedMarks,0);assert.equal(score.metrics.analyzedPapers,2);
});
test("unassigned or ambiguous questions never inflate topic scores",async()=>{
 const parser=await import("../extensions/prioritization/prioritization-parser.ts");assert.equal(typeof parser.parsePYQDatasetJson,"function");
 const data={schemaVersion:1,examId:"sample",papers:[],questions:[{id:"q",questionText:"Keys",mappingStatus:"ambiguous",candidateSubtopicIds:["keys","sql"]}]};
 const parsed=parser.parsePYQDatasetJson(JSON.stringify(data),taxonomy());assert.equal(parsed.questions[0]!.subtopicId,undefined);
 assert.ok(prioritizeTaxonomy(taxonomy(),parsed).every(s=>s.score.metrics.totalPYQs===0));
});

test("unknown marks, years, and paper identity contribute no invented evidence",()=>{
 const q:PYQItem={id:"unknown",examId:"sample",subtopicId:"keys",questionText:"Keys"};
 const score=prioritizeTaxonomy(taxonomy(),[q]).find(s=>s.subtopic.id==="keys")!.score;
 assert.equal(score.metrics.decayedMarks,0);assert.equal(score.metrics.yearsCovered,0);
 assert.equal(score.metrics.analyzedPapers,0);assert.equal(score.metrics.knownMarksQuestions,0);
 assert.equal(score.metrics.missingPaperIdentityQuestions,1);assert.equal(score.examPriorityScore,0);
 assert.match(score.metrics.evidenceLimitations.join(" "),/unknown year or marks/);
 assert.ok(Number.isFinite(score.compositeScore));
});
test("known zero marks stay known and only dated known marks enter decay",()=>{
 const data=taxonomy(), unit=data.units[0]!, sub=unit.subtopics[0]!;
 const questions=[{...question("zero","II"),marks:0},{...question("undated","II"),year:undefined,marks:100},{...question("unmarked","II"),marks:undefined}];
 const score=calculateExamPriority(sub,unit,data,questions,1,2025);
 assert.equal(score.metrics.decayedMarks,0);assert.equal(score.metrics.knownMarksQuestions,2);
 assert.equal(score.metrics.knownYearQuestions,2);assert.equal(score.metrics.yearsCovered,1);
});
test("adding the first PYQ never removes the unit weight contribution",()=>{
 const data=taxonomy();data.units[0]!.officialMarks=50;
 const before=prioritizeTaxonomy(data,[]).find(s=>s.subtopic.id==="keys")!.score.examPriorityScore;
 const after=prioritizeTaxonomy(data,[question("first","II")]).find(s=>s.subtopic.id==="keys")!.score.examPriorityScore;
 assert.ok(after>=before);
});
test("diamond dependencies count unique ancestors and shortest downstream distance",()=>{
 const data=taxonomy();
 data.units[0]!.subtopics.push({id:"other",title:"Other",prerequisites:["keys"],masteryStatus:"pending"});
 data.units[0]!.subtopics.find(s=>s.id==="joins")!.prerequisites=["sql","other","keys"];
 const graph=buildDependencyGraph(data.units);
 assert.equal(graph.get("keys")!.filter(d=>d.id==="joins").length,1);
 assert.equal(graph.get("keys")!.find(d=>d.id==="joins")!.distance,1);
 assert.equal(prioritizeTaxonomy(data,[]).find(s=>s.subtopic.id==="joins")!.score.metrics.transitivePrereqCount,3);
});
function richDataset(): PYQDataset {
 const papers=Array.from({length:5},(_,index)=>({id:`paper-${index}`,paperName:"Paper II",year:2020+index,complete:true}));
 return {schemaVersion:1,examId:"sample",papers,diagnostics:[],questions:papers.flatMap(paper=>[0,1].map(index=>({id:`${paper.id}-${index}`,examId:"sample",paperId:paper.id,marks:2,subtopicId:"keys",questionText:"Keys",mappingStatus:"explicit"})))};
}
test("inferred mappings or missing marks cannot acquire high evidence sufficiency from counts",()=>{
 for(const mode of ["inferred","missing-marks"] as const){
  const dataset=richDataset();
  for(const q of dataset.questions) {if(mode==="inferred")q.mappingStatus="inferred";else q.marks=undefined;}
  const score=prioritizeTaxonomy(taxonomy(),dataset).find(s=>s.subtopic.id==="keys")!.score;
  assert.equal(score.confidence,"speculative");assert.ok(!score.evidenceBadges.includes("Frequent Anchor"));
 }
});
test("incomplete paper imports and unassigned questions limit evidence for every topic",()=>{
 for(const mode of ["partial","unassigned"] as const){
  const dataset=richDataset();
  if(mode==="partial")dataset.papers[0]!.complete=false;
  else dataset.questions.push({id:"unassigned",examId:"sample",paperId:"paper-0",questionText:"Unknown",mappingStatus:"unmatched"});
  for(const item of prioritizeTaxonomy(taxonomy(),dataset)) {
   assert.notEqual(item.score.confidence,"high");assert.ok(!item.score.evidenceBadges.includes("Frequent Anchor"));
   assert.match(item.score.metrics.evidenceLimitations.join(" "),/partial|unassigned/);
  }
 }
});
test("complete attributable evidence supports frequency but never implies growth",()=>{
 const score=prioritizeTaxonomy(taxonomy(),richDataset()).find(s=>s.subtopic.id==="keys")!.score;
 assert.equal(score.confidence,"high");assert.ok(score.evidenceBadges.includes("Frequent Anchor"));
 assert.ok(!score.evidenceBadges.includes("Rising Trend"));
});
test("the public scoring boundary rejects inconsistent records and impossible denominators",()=>{
 assert.throws(()=>prioritizeTaxonomy(taxonomy(),[{...question("wrong","II"),examId:"other"}]),/examId/);
 assert.throws(()=>prioritizeTaxonomy(taxonomy(),[{...question("invalid","II"),marks:-1}]),/marks/);
 assert.throws(()=>prioritizeTaxonomy(taxonomy(),[question("paper","II")],0),/identified papers/);
 assert.throws(()=>prioritizeTaxonomy(taxonomy(),[{...question("ambiguous","II"),mappingStatus:"ambiguous"}]),/unassigned/);
});
test("conflicting duplicate source questions fail rather than picking one record",async()=>{
 const {parsePYQDatasetJson}=await import("../extensions/prioritization/prioritization-parser.ts");
 const dataset=richDataset(), q=dataset.questions[0]!;q.sourceQuestionId="same-question";
 dataset.questions.push({...q,id:"copy",marks:8});
 assert.throws(()=>parsePYQDatasetJson(JSON.stringify(dataset),taxonomy()),/conflicting duplicate/);
});

test("canonical paper IDs and unique legacy aliases do not double-count the same paper",()=>{
 const dataset:PYQDataset={schemaVersion:1,examId:"sample",papers:[{id:"p",paperName:"Paper II",year:2025,complete:true}],diagnostics:[],questions:[question("legacy","Paper II"),{...question("canonical","Paper II"),paperId:"p"}]};
 const metrics=prioritizeTaxonomy(taxonomy(),dataset).find(s=>s.subtopic.id==="keys")!.score.metrics;
 assert.equal(metrics.analyzedPapers,1);assert.equal(metrics.papersWithTopic,1);
 assert.equal(metrics.consistencyPct,100);
});
test("a name and year cannot disambiguate two sittings of the same paper",()=>{
 const dataset:PYQDataset={schemaVersion:1,examId:"sample",papers:[{id:"morning",paperName:"II",year:2025,complete:true},{id:"evening",paperName:"II",year:2025,complete:true}],diagnostics:[],questions:[question("ambiguous-paper","II")]};
 const metrics=prioritizeTaxonomy(taxonomy(),dataset).find(s=>s.subtopic.id==="keys")!.score.metrics;
 assert.equal(metrics.analyzedPapers,2);assert.equal(metrics.papersWithTopic,0);
 assert.equal(metrics.missingPaperIdentityQuestions,1);
});
test("legacy arrays accept canonical IDs without fabricating names or conflicting with later known metadata",()=>{
 const questions=[{...question("unknown-name","Paper II"),paperId:"canonical",paperName:undefined},{...question("known-name","Paper II"),paperId:"canonical"}];
 const score=prioritizeTaxonomy(taxonomy(),questions).find(s=>s.subtopic.id==="keys")!.score;
 assert.equal(score.metrics.analyzedPapers,1);assert.equal(score.metrics.totalPYQs,2);
 assert.equal(questions[0]!.paperName,undefined);
});

test('canonical paper aliases deduplicate source questions before counting marks', async()=>{
 const {parsePYQDatasetJson}=await import('../extensions/prioritization/prioritization-parser.ts');
 const q={...question('canonical','Paper II'),sourceQuestionId:'q-1',paperId:'p'};
 const dataset:PYQDataset={schemaVersion:1,examId:'sample',papers:[{id:'p',paperName:'Paper II',year:2025,complete:true}],diagnostics:[],questions:[q,{...q,id:'legacy',paperId:undefined}]};
 const normalized=parsePYQDatasetJson(JSON.stringify(dataset),taxonomy());
 assert.equal(normalized.questions.length,1);
 assert.ok(normalized.diagnostics.some(d=>d.code==='duplicate-question'));
 assert.equal(prioritizeTaxonomy(taxonomy(),dataset).find(s=>s.subtopic.id==='keys')!.score.metrics.totalPYQs,1);
 dataset.questions[1]!.marks=9;
 assert.throws(()=>parsePYQDatasetJson(JSON.stringify(dataset),taxonomy()),/conflicting duplicate/);
});

test('an empty or unparsed syllabus produces an actionable import failure',()=>{
 const empty=taxonomy(); empty.units=[];
 assert.throws(()=>prioritizeTaxonomy(empty,[]),/no.*unit|empty.*syllabus/i);
 const missingTopics=taxonomy();missingTopics.units[0]!.subtopics=[];
 assert.throws(()=>prioritizeTaxonomy(missingTopics,[]),/no.*subtopic|empty.*unit/i);
});

test('case-insensitive paper aliases remain valid through repeated parsing and scoring', async()=>{
 const {parsePYQDatasetJson}=await import('../extensions/prioritization/prioritization-parser.ts');
 const parsed=parsePYQDatasetJson(JSON.stringify({schemaVersion:1,examId:'sample',papers:[{id:'p',paperName:'Paper II',year:2025,complete:true}],questions:[{...question('legacy','paper ii'),sourceQuestionId:'q-1'}]}),taxonomy());
 assert.equal(parsed.questions[0]!.paperName,'Paper II');
 const again=parsePYQDatasetJson(JSON.stringify(parsed),taxonomy());
 assert.equal(prioritizeTaxonomy(taxonomy(),again).find(s=>s.subtopic.id==='keys')!.score.metrics.totalPYQs,1);
});
