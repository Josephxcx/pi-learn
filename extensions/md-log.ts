import type {ExtensionAPI,ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {registerVisualTools} from './bindings/visual-tools.ts';
import {registerLearningTools} from './bindings/learning-tools.ts';
import {registerSyllabusTools} from './bindings/syllabus-tools.ts';
import {learningContext} from './bindings/shared.ts';
import {openNote} from './learning/open-note.ts';

/** Every operation obtains the current Pi session from its context, including after /new or /resume. */
export default function piLearn(pi:ExtensionAPI):void {
  registerLearningTools(pi);
  registerVisualTools(pi);
  registerSyllabusTools(pi);
  function message(ctx:ExtensionCommandContext,text:string,error=false):void {
    if(ctx.hasUI)ctx.ui.notify(text,error?'error':'info');
    else pi.sendMessage({customType:'pi-learn',content:text,display:true},{triggerTurn:false});
  }
  function command(name:string,description:string,handler:(args:string,ctx:ExtensionCommandContext)=>Promise<void>):void {
    pi.registerCommand(name,{description,async handler(args,ctx){
      try {await handler(args.trim(),ctx);}catch(error){message(ctx,error instanceof Error?error.message:String(error),true);}
    }});
  }
  command('pi-teach','Start personal tutoring using the pi-learn skill',async(args,_ctx)=>{
    pi.sendUserMessage(`/skill:pi-learn${args?` ${args}`:''}`,{expandPromptTemplates:true,deliverAs:'followUp'});
  });
  command('md-log','Create or resume a learning note for a topic',async(args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    if(!args){
      const active=await store.status(sessionId);
      message(ctx,active?`Active note: ${active.notePath}`:'Use /md-log followed by a topic, or /pi-teach to begin.');
      return;
    }
    const active=await store.init(sessionId,{topic:args,goal:`Understand ${args}`});
    message(ctx,`${active.resumed?'Resumed':'Created'} note: ${active.notePath}`);
  });
  command('md-view','Open the active learning note in Obsidian',async(_args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    const active=await store.status(sessionId);
    if(!active)throw new Error('No active note. Start with /pi-teach or /md-log <topic>.');
    await openNote(active.notePath);
    message(ctx,`Sent an open request to Obsidian: ${active.notePath}`);
  });
  command('learn-status','Show the active note and saved learning progress',async(_args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    const active=await store.status(sessionId);
    if(!active){message(ctx,'No active learning note. Start with /pi-teach or resume with /md-log <topic>.');return;}
    const due=await store.dueReviews(sessionId);
    message(ctx,`${active.topic}\nExam: ${active.examId}\nSaved concepts: ${active.progress.nodes.length}\nDue reviews: ${due.length}\nNote: ${active.notePath}`);
  });
  command('learn-review','Start retrieval practice for due concepts in the active note',async(_args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    if(!await store.status(sessionId))throw new Error('No active learning note. Resume the note first with /md-log <topic> or init_learning_session.');
    const due=await store.dueReviews(sessionId);
    if(!due.length){message(ctx,'No reviews are due for this note yet. Use /pi-teach to keep learning.');return;}
    pi.sendUserMessage('/skill:pi-learn Review the due concepts in the active note. Use get_due_reviews, ask one neutral recall question at a time, and record each answer with record_review_attempt. Do not reveal the answer before I respond.',{expandPromptTemplates:true,deliverAs:'followUp'});
  });
  command('learn-recover','Explicitly link the note from the old global pi-learn session file',async(_args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    const active=await store.recoverLegacy(sessionId);
    message(ctx,`Linked legacy note without replacing its content: ${active.notePath}`);
  });
  command('learn-repair','Back up an edited note and rebuild its managed content from saved progress',async(_args,ctx)=>{
    const {store,sessionId}=learningContext(ctx);
    const repaired=await store.recoverManaged(sessionId);
    message(ctx,`Rebuilt managed content. Your complete edited note is preserved at: ${repaired.backupPath}`);
  });
}
