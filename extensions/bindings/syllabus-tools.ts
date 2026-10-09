import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { resolveLearningConfig } from '../learning/config.ts';
import { loadExamTaxonomyJson, loadPYQDatasetJson, parseMudalPYQs, resolveActiveExamTaxonomy } from '../prioritization/prioritization-parser.ts';
import { prioritizeTaxonomy } from '../prioritization/prioritization-engine.ts';
import { renderSyllabusOverview, renderUnitSubtopicsDetail, renderSubtopicDossier } from '../prioritization/prioritization-presenter.ts';
import type { ActionAnchor, PYQDataset, PYQItem } from '../prioritization/prioritization-types.ts';
import { learningContext, registerTool } from './shared.ts';

const sources = {
  examId:Type.Optional(Type.String({minLength:1,description:'Exact exam ID. Uses the active exam when omitted.'})),
  taxonomyPath:Type.Optional(Type.String({minLength:1,description:'Explicit exam.json file, absolute or relative to the vault.'})),
  pyqPath:Type.Optional(Type.String({minLength:1,description:'Explicit PYQ dataset JSON, or a legacy MUDAL Markdown directory.'})),
};
interface SourceInput { examId?:string;taxonomyPath?:string;pyqPath?:string }
async function analyze(params:SourceInput,ctx:ExtensionContext) {
  const {vaultPath}=resolveLearningConfig();
  let examId=params.examId;
  if(!examId&&!params.taxonomyPath){
    const {store,sessionId}=learningContext(ctx);
    const active=await store.status(sessionId);
    if(active&&active.examId!=='General')examId=active.examId;
  }
  const taxonomy=params.taxonomyPath
    ?loadExamTaxonomyJson(path.resolve(vaultPath,params.taxonomyPath))
    :resolveActiveExamTaxonomy(vaultPath,examId);
  if(!taxonomy)throw new Error(`No syllabus found${examId?` for ${examId}`:''}. Supply taxonomyPath or place exam.json in an exam folder inside your vault. General teaching can continue without prioritization.`);
  if(examId&&taxonomy.examId!==examId)throw new Error(`The syllabus belongs to ${taxonomy.examId}, not ${examId}. Select matching sources.`);
  const defaultPyq=path.resolve(vaultPath,taxonomy.vaultRelativeDir,'pyqs.json');
  const pyqPath=params.pyqPath?path.resolve(vaultPath,params.pyqPath):fs.existsSync(defaultPyq)?defaultPyq:undefined;
  let evidence:PYQDataset|PYQItem[]=[];
  if(pyqPath){
    const stat=fs.statSync(pyqPath);
    if(stat.isDirectory()){
      if(taxonomy.examId!=='MUDAL-System-Manager')throw new Error('Legacy Markdown PYQ directories support MUDAL-System-Manager only. Use a validated pyqs.json dataset for other exams.');
      evidence=parseMudalPYQs(pyqPath,taxonomy);
    }else evidence=loadPYQDatasetJson(pyqPath,taxonomy);
  }
  return {taxonomy,prioritized:prioritizeTaxonomy(taxonomy,evidence),diagnostics:[...(taxonomy.diagnostics??[]),...(Array.isArray(evidence)?[]:evidence.diagnostics)],pyqPath};
}

export function registerSyllabusTools(pi:ExtensionAPI):void {
  registerTool(pi,{
    name:'prioritize_syllabus',label:'Prioritize Syllabus',
    description:'Rank syllabus topics using declared marks, mapped PYQs and prerequisites. Scores are heuristics; missing evidence and import limitations are reported.',
    parameters:Type.Object({...sources,unitNumber:Type.Optional(Type.Integer({minimum:1})),unitId:Type.Optional(Type.String({minLength:1})),minActionAnchor:Type.Optional(Type.Union([Type.Literal('Must Study'),Type.Literal('High Priority'),Type.Literal('Important'),Type.Literal('Moderate'),Type.Literal('Lower'),Type.Literal('Lower Priority')]))},{additionalProperties:false}),
  },async(params,ctx)=>{
    const {taxonomy,prioritized,diagnostics,pyqPath}=await analyze(params,ctx);
    let topics=prioritized;
    if(params.unitNumber!==undefined||params.unitId!==undefined){
      const units=taxonomy.units.filter(unit=>(params.unitId===undefined||unit.id===params.unitId)&&(params.unitNumber===undefined||unit.unitNumber===params.unitNumber));
      if(units.length!==1)throw new Error(`Unit selection matched ${units.length} units. Supply an exact unitId from the overview.`);
      topics=topics.filter(item=>item.unit.id===units[0]!.id);
    }
    const ranks:Record<ActionAnchor,number>={'Must Study':5,'High Priority':4,Important:3,Moderate:2,Lower:1};
    if(params.minActionAnchor){
      const minimum=params.minActionAnchor==='Lower Priority'?'Lower':params.minActionAnchor;
      topics=topics.filter(item=>ranks[item.score.actionAnchor]>=ranks[minimum]);
    }
    return {status:'success',examId:taxonomy.examId,examTitle:taxonomy.examTitle,profile:taxonomy.profile,totalMarks:taxonomy.totalMarks??null,pyqSource:pyqPath??null,
      guidance:'Study-order heuristics, not predicted questions or marks per hour. Verify the applicable syllabus and paper standard.',diagnostics,totalSubtopics:topics.length,
      topics:topics.map(item=>({id:item.subtopic.id,title:item.subtopic.title,unit:item.unit.title,unitNumber:item.unit.unitNumber,paper:item.unit.paper,officialUnitMarks:item.unit.officialMarks??null,actionAnchor:item.score.actionAnchor,evidenceBadges:item.score.evidenceBadges,confidence:item.score.confidence,
        scores:{examPriority:item.score.examPriorityScore,foundation:item.score.foundationScore,studyEfficiency:item.score.studyEfficiencyScore,composite:item.score.compositeScore},metrics:item.score.metrics,prerequisites:item.subtopic.prerequisites}))};
  });
  registerTool(pi,{
    name:'drill_down_syllabus',label:'Explore Syllabus',description:'Show a syllabus overview, a specific unit, or a topic dossier. Invalid or ambiguous selections are errors.',
    parameters:Type.Object({...sources,stage:Type.Union([Type.Literal('overview'),Type.Literal('unit_detail'),Type.Literal('subtopic_dossier')]),unitNumber:Type.Optional(Type.Integer({minimum:1})),unitId:Type.Optional(Type.String({minLength:1})),subtopicId:Type.Optional(Type.String({minLength:1}))},{additionalProperties:false}),
  },async(params,ctx)=>{
    const {taxonomy,prioritized,diagnostics}=await analyze(params,ctx);
    const warnings=diagnostics.length?'\n\nImport notes:\n'+diagnostics.map(item=>`- ${item.message}`).join('\n'):'';
    if(params.stage==='overview')return renderSyllabusOverview(taxonomy,prioritized)+warnings;
    if(params.stage==='unit_detail'){
      if(params.unitNumber===undefined&&!params.unitId)throw new Error('unit_detail requires unitId or unitNumber.');
      const units=taxonomy.units.filter(unit=>(params.unitId===undefined||unit.id===params.unitId)&&(params.unitNumber===undefined||unit.unitNumber===params.unitNumber));
      if(units.length!==1)throw new Error(`Unit selection matched ${units.length} units. Supply an exact unitId from the overview.`);
      const unit=units[0]!;
      return renderUnitSubtopicsDetail(unit,prioritized.filter(item=>item.unit.id===unit.id))+warnings;
    }
    if(!params.subtopicId)throw new Error('subtopic_dossier requires subtopicId.');
    const item=prioritized.find(item=>item.subtopic.id===params.subtopicId);
    if(!item)throw new Error(`Unknown subtopic: ${params.subtopicId}.`);
    return renderSubtopicDossier(item)+warnings;
  });
}
