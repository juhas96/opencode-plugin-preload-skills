import type { ToolEditor, ToolContext } from "@opencode/plugin/promise/tool"
import type { SessionManager, ToastFn } from "../types.js"

interface SkillInfo {
  name: string
  description: string
  tokens: number
}

function formatSkillTable(skills: SkillInfo[]): string {
  const totalTokens = skills.reduce((sum, s) => sum + s.tokens, 0)
  const lines = skills.map(
    (s) => `- **${s.name}** (${s.tokens} tokens) — ${s.description}`
  )

  return [
    `**${skills.length} skill${skills.length === 1 ? "" : "s"} loaded** (${totalTokens} total tokens)`,
    "",
    ...lines,
  ].join("\n")
}

function formatToast(skills: SkillInfo[], tokensUsed: number): string {
  const lines = skills.map((s) => `• ${s.name} (${s.tokens} tok)`)
  return [
    `${skills.length} skill${skills.length === 1 ? "" : "s"} loaded (${tokensUsed} tokens):`,
    ...lines,
  ].join("\n")
}

export function registerLoadedSkillsTool(editor: ToolEditor, sessionManager: SessionManager, toast: ToastFn) {
  editor.add({
    name: "loaded_skills",
    description: "List all preloaded skills for the current session — names, descriptions, and token counts.",
    input: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async execute(_input: unknown, context: ToolContext) {
      const state = sessionManager.getState(context.sessionID)
      const skills = sessionManager.getAllLoadedSkills(context.sessionID)

      if (skills.length === 0) {
        return {
          content: "No skills currently loaded for this session.",
        }
      }

      const skillInfos: SkillInfo[] = skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        tokens: skill.tokenCount,
      }))

      toast(formatToast(skillInfos, state.totalTokensUsed), "success")

      const tableContent = [
        formatSkillTable(skillInfos),
        "",
        `Token budget: ${state.totalTokensUsed} used`,
      ].join("\n")

      return {
        content: tableContent,
      }
    },
  })
}
