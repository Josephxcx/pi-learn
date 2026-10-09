import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { learningContext, registerTool } from './shared.ts';
import { assembleCompanion, companionLink, validateVisualFilename } from '../visuals/companions.ts';
import { verifyCompanion } from '../visuals/verify.ts';
import type { VisualVerification } from '../visuals/verify.ts';
import { atomicWriteFile, fileHash, readOptional, withFileLock } from '../learning/files.ts';

export function registerVisualTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name:'get_visual_design_guidance',label:'Visual Design Guidance',
    description:'Read the bundled frontend-design skill and teaching constraints once per session before designing lesson art, diagrams, HTML, Mermaid or quizzes.',
    parameters:Type.Object({},{additionalProperties:false}),
  },async()=>{
    const sources=['../../skills/frontend-design/SKILL.md','../../skills/pi-learn/references/visual-design.md'];
    return (await Promise.all(sources.map(source=>fs.readFile(new URL(source,import.meta.url),'utf8')))).join('\n\n');
  });
  registerTool(pi, {
    name:'get_visual_components',label:'HTML Visual Components',
    description:'Read offline HTML component contracts after get_visual_design_guidance. Adapt layouts to the concept.',
    parameters:Type.Object({},{additionalProperties:false}),
  },async()=>fs.readFile(new URL('../../skills/pi-learn/references/html-visuals.md',import.meta.url),'utf8'));
  registerTool(pi, {
    name:'save_visual_html',label:'Save HTML Visual Companion',
    description:'Save a standalone HTML companion for the active note. Browser checks are optional and do not establish factual accuracy. Inspect returned screenshots before linking.',
    parameters:Type.Object({
      filename:Type.String({minLength:1,maxLength:124}),
      title:Type.String({minLength:1,maxLength:500}),
      htmlContent:Type.String({minLength:1,maxLength:2_000_000}),
      includeMath:Type.Optional(Type.Boolean()),verify:Type.Optional(Type.Boolean()),
    },{additionalProperties:false}),
  },async(params,ctx,_id,signal)=>{
    const {store,sessionId}=learningContext(ctx,signal);
    const active=await store.status(sessionId);
    if(!active)throw new Error('No active learning note. Call init_learning_session before saving a visual.');
    validateVisualFilename(params.filename);
    const html=assembleCompanion(params.htmlContent,params.title,params.includeMath);
    const htmlPath=path.join(active.assetsDir,params.filename);
    await withFileLock(htmlPath,async()=>{
      const previous=await readOptional(htmlPath);
      (signal ?? ctx.signal)?.throwIfAborted();
      await atomicWriteFile(htmlPath,html,previous===null?null:fileHash(previous));
    },signal ?? ctx.signal);
    let verification:VisualVerification={status:'skipped',screenshots:[],errors:[],checks:[]};
    if(params.verify!==false) {
      const previewDir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-learn-visual-'));
      verification=await verifyCompanion(htmlPath,previewDir);
    }
    return {status:'saved',htmlPath,assetsDir:active.assetsDir,verification,noteLink:companionLink(active.notePath,htmlPath,params.title)};
  });
}
