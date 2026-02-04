import type { Model } from "@opencode-ai/sdk"
import type { PluginContext, ParsedSkill } from "../types.js"
import { formatSkillsForInjection } from "../skills/loader.js"

interface SystemPromptInput {
  sessionID?: string
  model: Model
}

interface SystemPromptOutput {
  system: string[]
}

export function createSystemPromptHook(ctx: PluginContext) {
  const { config, sessionManager, initialSkills, log } = ctx

  return async (input: SystemPromptInput, output: SystemPromptOutput): Promise<void> => {
    if (!input.sessionID) return

    const state = sessionManager.getState(input.sessionID)
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

    const pending = sessionManager.getPendingSkills(input.sessionID)
    if (pending && pending.length > 0) {
      for (const skill of pending) {
        if (!skillsToInject.find((s) => s.name === skill.name)) {
          skillsToInject.push(skill)
        }
      }
      sessionManager.clearPendingSkills(input.sessionID)
    }

    if (skillsToInject.length > 0) {
      const formatted = formatSkillsForInjection(skillsToInject, {
        useSummaries: config.useSummaries,
        useMinification: config.useMinification,
        skillSettings: config.skillSettings,
      })
      output.system.push(formatted)

      if (!state.initialSkillsInjected && initialSkills.length > 0) {
        state.initialSkillsInjected = true
        log("info", "Injected skills into system prompt", {
          sessionID: input.sessionID,
          skills: skillsToInject.map((s) => s.name),
        })
      }
    }
  }
}
