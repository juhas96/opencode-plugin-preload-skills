import type { Event } from "@opencode-ai/sdk"
import type { PluginContext } from "../types.js"
import { formatSkillsForInjection } from "../skills/loader.js"

interface CompactingInput {
  sessionID: string
}

interface CompactingOutput {
  context: string[]
  prompt?: string
}

interface EventInput {
  event: Event
}

export function createLifecycleHooks(ctx: PluginContext) {
  const { config, sessionManager, log } = ctx

  const compacting = async (
    input: CompactingInput,
    output: CompactingOutput
  ): Promise<void> => {
    if (!config.persistAfterCompaction) return

    const allLoadedSkills = sessionManager.getAllLoadedSkills(input.sessionID)
    if (allLoadedSkills.length === 0) return

    const formatted = formatSkillsForInjection(allLoadedSkills, {
      useSummaries: config.useSummaries,
      useMinification: config.useMinification,
      skillSettings: config.skillSettings,
    })

    output.context.push(
      `## Preloaded Skills\n\nThe following skills were loaded during this session and should persist:\n\n${formatted}`
    )

    sessionManager.markInitialSkillsInjected(input.sessionID)

    log("info", "Added all loaded skills to compaction context", {
      sessionID: input.sessionID,
      skillCount: allLoadedSkills.length,
    })

    sessionManager.saveAnalytics()
  }

  const event = async ({ event }: EventInput): Promise<void> => {
    if (event.type === "session.deleted" && "sessionID" in event.properties) {
      const sessionID = event.properties.sessionID as string
      sessionManager.cleanup(sessionID)
    }
  }

  return { compacting, event }
}
