import type { SessionContext } from "@opencode/plugin/promise/session"
import type { PluginContext, ParsedSkill } from "../types.js"
import { formatSkillsForInjection } from "../skills/loader.js"

export function createSystemPromptHook(ctx: PluginContext) {
  const { config, sessionManager, skillResolver, initialSkills, log, toast } = ctx

  return async (event: SessionContext): Promise<void> => {
    if (!event.sessionID) return

    const state = sessionManager.getState(event.sessionID)

    if (event.agent && config.agentSkills?.[event.agent]) {
      const result = skillResolver.loadWithBudget(
        config.agentSkills[event.agent]!,
        state.totalTokensUsed,
        event.sessionID,
        "agent"
      )
      if (result.skills.length > 0) {
        sessionManager.queueSkills(event.sessionID, result.skills, "agent")
      }
    }

    const skillsToInject: ParsedSkill[] = []

    if (initialSkills.length > 0) {
      skillsToInject.push(...initialSkills)
    }

    for (const name of state.loadedSkills) {
      const skill = sessionManager.getCachedSkill(name)
      if (skill && !skillsToInject.find((s) => s.name === name)) {
        skillsToInject.push(skill)
      }
    }

    const pending = sessionManager.getPendingSkills(event.sessionID)
    if (pending && pending.length > 0) {
      for (const skill of pending) {
        if (!skillsToInject.find((s) => s.name === skill.name)) {
          skillsToInject.push(skill)
        }
      }
      sessionManager.clearPendingSkills(event.sessionID)
    }

    if (skillsToInject.length > 0) {
      const formatted = formatSkillsForInjection(skillsToInject, {
        useSummaries: config.useSummaries,
        useMinification: config.useMinification,
        skillSettings: config.skillSettings,
      })
      event.system.push({ type: "text", text: formatted })

      if (!state.initialSkillsInjected && initialSkills.length > 0) {
        state.initialSkillsInjected = true
        const names = initialSkills.map((s) => s.name)
        log("info", "Injected skills into system prompt", {
          sessionID: event.sessionID,
          skills: names,
        })
        toast(`Loaded ${names.length} skill${names.length === 1 ? "" : "s"}: ${names.join(", ")}`)
      }

      if (pending && pending.length > 0) {
        const pendingNames = pending.map((s) => s.name)
        toast(`Triggered skill${pendingNames.length === 1 ? "" : "s"}: ${pendingNames.join(", ")}`)
      }
    }
  }
}
