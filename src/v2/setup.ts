import type { Context } from "@opencode/plugin/promise/plugin"
import type { ToolEditor } from "@opencode/plugin/promise/tool"
import { createPluginRuntime } from "../core/runtime.js"
import {
  createSystemPromptHook,
  createPromptHook,
  createToolExecuteAfterHook,
  createCompactionHook,
} from "../hooks/index.js"
import { registerLoadedSkillsTool } from "../tools/loaded-skills.js"

export async function setup(ctx: Context): Promise<(() => void) | void> {
  const projectDir = ctx.location.directory
  const pluginContext = createPluginRuntime({ projectDir })
  const { config, sessionManager, toast } = pluginContext

  await ctx.session.hook("context", createSystemPromptHook(pluginContext))
  await ctx.session.hook("prompt", createPromptHook(pluginContext))
  await ctx.tool.hook("execute.after", createToolExecuteAfterHook(pluginContext))
  await ctx.session.hook("compaction", createCompactionHook(pluginContext))

  if (config.enableTools !== false) {
    await ctx.tool.transform((editor: ToolEditor) => {
      registerLoadedSkillsTool(editor, sessionManager, toast)
    })
  }

  const controller = new AbortController()
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.deleted") {
          sessionManager.cleanup(event.data.sessionID)
        }
      }
    } catch {
      // Aborted on cleanup
    }
  })()

  return () => controller.abort()
}
