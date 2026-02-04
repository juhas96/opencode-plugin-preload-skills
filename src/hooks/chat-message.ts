import type { UserMessage, Part } from "@opencode-ai/sdk"
import type { PluginContext } from "../types.js"
import { formatSkillsForInjection } from "../skills/loader.js"
import { textContainsKeyword } from "../utils.js"

interface ChatMessageInput {
  sessionID: string
  agent?: string
}

interface ChatMessageOutput {
  message: UserMessage
  parts: Part[]
}

export function createChatMessageHook(ctx: PluginContext) {
  const { config, sessionManager, skillResolver, initialSkills, initialFormattedContent, log } = ctx
  const useSystemPromptInjection = config.injectionMethod === "systemPrompt"

  return async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
    if (!input.sessionID) return

    const state = sessionManager.getState(input.sessionID)
    const firstTextPart = output.parts.find((p) => p.type === "text")
    if (!firstTextPart || !("text" in firstTextPart)) return

    const messageText = firstTextPart.text

    if (input.agent && config.agentSkills?.[input.agent]) {
      const result = skillResolver.loadWithBudget(
        config.agentSkills[input.agent]!,
        state.totalTokensUsed,
        input.sessionID,
        "agent"
      )
      if (result.skills.length > 0) {
        sessionManager.queueSkills(input.sessionID, result.skills, "agent")
      }
    }

    if (config.contentTriggers) {
      for (const [keyword, skillNames] of Object.entries(config.contentTriggers)) {
        if (textContainsKeyword(messageText, [keyword])) {
          const result = skillResolver.loadWithBudget(
            skillNames,
            state.totalTokensUsed,
            input.sessionID,
            "content"
          )
          if (result.skills.length > 0) {
            sessionManager.queueSkills(input.sessionID, result.skills, "content")
          }
        }
      }
    }

    if (!useSystemPromptInjection) {
      const contentToInject: string[] = []

      if (!state.initialSkillsInjected && initialFormattedContent) {
        contentToInject.push(initialFormattedContent)
        state.initialSkillsInjected = true
        log("info", "Injected initial preloaded skills", {
          sessionID: input.sessionID,
          skills: initialSkills.map((s) => s.name),
        })
      }

      const pending = sessionManager.getPendingSkills(input.sessionID)
      if (pending && pending.length > 0) {
        const formatted = formatSkillsForInjection(pending, {
          useSummaries: config.useSummaries,
          useMinification: config.useMinification,
          skillSettings: config.skillSettings,
        })
        if (formatted) {
          contentToInject.push(formatted)
          log("info", "Injected triggered skills", {
            sessionID: input.sessionID,
            skills: pending.map((s) => s.name),
          })
        }
        sessionManager.clearPendingSkills(input.sessionID)
      }

      if (contentToInject.length > 0) {
        firstTextPart.text = `${contentToInject.join("\n\n")}\n\n---\n\n${firstTextPart.text}`
      }
    }
  }
}
