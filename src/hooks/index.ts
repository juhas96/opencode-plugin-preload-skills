import type { PluginContext } from "../types.js"
import { createSystemPromptHook } from "./system-prompt.js"
import { createChatMessageHook } from "./chat-message.js"
import { createToolExecuteHooks } from "./tool-execute.js"
import { createLifecycleHooks } from "./lifecycle.js"
import { createLoadedSkillsTool } from "../tools/loaded-skills.js"

export function createHooks(ctx: PluginContext): Record<string, unknown> {
  const { before, after } = createToolExecuteHooks(ctx)
  const { compacting, event } = createLifecycleHooks(ctx)
  const useSystemPromptInjection = ctx.config.injectionMethod === "systemPrompt"
  const enableTools = ctx.config.enableTools !== false

  return {
    ...(useSystemPromptInjection && {
      "experimental.chat.system.transform": createSystemPromptHook(ctx),
    }),
    "chat.message": createChatMessageHook(ctx),
    "tool.execute.before": before,
    "tool.execute.after": after,
    "experimental.session.compacting": compacting,
    event,
    ...(enableTools && {
      tool: {
        loaded_skills: createLoadedSkillsTool(ctx.sessionManager, ctx.toast),
      },
    }),
  }
}
