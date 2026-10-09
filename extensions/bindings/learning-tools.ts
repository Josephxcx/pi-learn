import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { saveDiagram } from '../learning/diagrams.ts';
import { learningContext, registerTool } from './shared.ts';

const text = (description?: string, maxLength = 100_000) => Type.String({minLength: 1, maxLength, ...(description ? {description} : {})});
const optionalText = (description?: string) => Type.Optional(text(description));
const examProfile = Type.Object({
  id: optionalText('Stable exam ID; do not infer from topic words.'),
  post: optionalText(), authority: optionalText(), group: optionalText(),
  gazetted: Type.Optional(Type.Union([Type.Boolean(), Type.Literal('unknown')])),
  recruitmentRoute: optionalText(), syllabusVersion: optionalText(), paper: optionalText(),
  difficultyGuidance: optionalText('Question standard established by the selected syllabus and PYQs.'),
}, {additionalProperties: false});

export function registerLearningTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: 'init_learning_session', label: 'Start or Resume Learning',
    description: 'Start or resume a note without replacing existing content. Select an explicit exam profile or use general learning.',
    parameters: Type.Object({topic: text(undefined, 500), goal: text(undefined, 5000), customPath: optionalText(), examId: optionalText(), examProfile: Type.Optional(examProfile)}, {additionalProperties: false}),
  }, async (params, ctx, _id, signal) => {
    const {store,sessionId} = learningContext(ctx,signal);
    if (params.examId && params.examProfile?.id && params.examId !== params.examProfile.id) throw new Error('examId and examProfile.id must agree.');
    const profile = params.examId ? {...params.examProfile,id:params.examId} : params.examProfile;
    return store.init(sessionId,{topic:params.topic,goal:params.goal,customPath:params.customPath,examProfile:profile});
  });
  registerTool(pi, {
    name:'update_learning_plan',label:'Update Learning Plan',
    description:'Update the managed roadmap while preserving surrounding personal notes. Initialize a note first.',
    parameters:Type.Object({mermaidDiagram:Type.String({maxLength:100_000}),planSummary:text()},{additionalProperties:false}),
  },async(params,ctx,id,signal)=>{ const {store,sessionId}=learningContext(ctx,signal); return store.updatePlan(sessionId,params,id); });
  registerTool(pi, {
    name:'append_lesson_node',label:'Save Lesson Step',
    description:'Save one concept, optional concise revision summary, sources and a diagram. Reuse nodeId for retries. A supplied activeRecallQuiz records one immediate attempt.',
    parameters:Type.Object({
      nodeTitle:text(undefined,500),explanationMarkdown:text(),nodeId:optionalText(),diagramFilename:optionalText(),
      revisionSummary:optionalText(),mnemonic:optionalText(),sources:Type.Optional(Type.Array(text(),{maxItems:50})),
      activeRecallQuiz:Type.Optional(Type.Object({question:text(),chosenAnswer:text(),isCorrect:Type.Boolean(),keyTakeaway:text()},{additionalProperties:false})),
    },{additionalProperties:false}),
  },async(params,ctx,id,signal)=>{ const {store,sessionId}=learningContext(ctx,signal); return store.appendNode(sessionId,params,id); });
  registerTool(pi, {
    name:'record_review_attempt',label:'Record Retrieval Practice',
    description:'Record a learner answer for a saved node. Delayed recall needs a gap of at least 24 hours. Do not log a quiz twice using this and append_lesson_node.',
    parameters:Type.Object({nodeId:text(),question:optionalText(),chosenAnswer:optionalText(),isCorrect:Type.Boolean(),keyTakeaway:optionalText(),kind:Type.Union([Type.Literal('immediate'),Type.Literal('delayed')]),attemptId:optionalText()},{additionalProperties:false}),
  },async(params,ctx,id,signal)=>{const {store,sessionId}=learningContext(ctx,signal);return store.recordReview(sessionId,params,id);});
  registerTool(pi, {
    name:'get_learning_status',label:'Learning Status',description:'Read the active note, saved concepts, exam profile and retrieval history for this Pi session.',
    parameters:Type.Object({},{additionalProperties:false}),
  },async(_params,ctx,_id,signal)=>{const {store,sessionId}=learningContext(ctx,signal);return {active:await store.status(sessionId)};});
  registerTool(pi, {
    name:'get_due_reviews',label:'Due Reviews',description:'List concepts due for recall in the active learning note. This is a simple review schedule, not a mastery prediction.',
    parameters:Type.Object({},{additionalProperties:false}),
  },async(_params,ctx,_id,signal)=>{const {store,sessionId}=learningContext(ctx,signal);return {reviews:await store.dueReviews(sessionId)};});
  registerTool(pi, {
    name:'save_diagram_svg',label:'Save Learning Diagram',
    description:'Save a static SVG and render a local PNG preview. Requires an active note. Inspect the preview before embedding; rendering alone does not verify a diagram.',
    parameters:Type.Object({filename:text(undefined,124),svgContent:text(undefined,1_000_000)},{additionalProperties:false}),
  },async(params,ctx,_id,signal)=>{
    const {store,sessionId}=learningContext(ctx,signal);
    const active=await store.status(sessionId);
    if(!active)throw new Error('No active learning note. Call init_learning_session before saving a diagram.');
    return saveDiagram(active.assetsDir,params.filename,params.svgContent,signal);
  });
}
