import type { SessionCompaction } from "@opencode/plugin/promise/session"
import type { PluginContext } from "../types.js"
import { formatSkillsForInjection } from "../skills/loader.js"

export function createCompactionHook(ctx: PluginContext) {
  const { config, sessionManager, log } = ctx

  return async (event: SessionCompaction): Promise<void> => {
    if (!config.persistAfterCompaction) return
    if (!event.sessionID) return

    const allLoadedSkills = sessionManager.getAllLoadedSkills(event.sessionID)
    if (allLoadedSkills.length === 0) return

    const formatted = formatSkillsForInjection(allLoadedSkills, {
      useSummaries: config.useSummaries,
      useMinification: config.useMinification,
      skillSettings: config.skillSettings,
    })

    const persistentText = `## Preloaded Skills\n\nThe following skills were loaded during this session and should persist:\n\n${formatted}`
    event.system.push({ type: "text", text: persistentText })

    sessionManager.markInitialSkillsInjected(event.sessionID)

    log("info", "Added all loaded skills to compaction context", {
      sessionID: event.sessionID,
      skillCount: allLoadedSkills.length,
    })

    sessionManager.saveAnalytics()
  }
}
