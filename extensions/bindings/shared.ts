import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { Static, TSchema } from 'typebox';
import { LearningStore } from '../learning/store.ts';
import { resolveLearningConfig } from '../learning/config.ts';

export function learningContext(ctx: ExtensionContext, signal?: AbortSignal) {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) throw new Error('Pi did not provide a session ID. Start a Pi session before using pi-learn.');
  return {store: new LearningStore({...resolveLearningConfig(), signal: signal ?? ctx.signal}), sessionId};
}

/** Preserve schema inference and the actual Pi AgentToolResult contract. */
export function registerTool<T extends TSchema>(
  pi: ExtensionAPI,
  definition: Pick<ToolDefinition<T>, 'name' | 'label' | 'description' | 'parameters'>,
  execute: (params: Static<T>, ctx: ExtensionContext, id: string, signal?: AbortSignal) => Promise<unknown>,
): void {
  pi.registerTool({
    ...definition,
    executionMode: 'sequential',
    async execute(id, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const details = await execute(params, ctx, id, signal);
      return {content: [{type: 'text', text: typeof details === 'string' ? details : JSON.stringify(details, null, 2)}], details};
    },
  });
}
