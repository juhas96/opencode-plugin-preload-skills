import { extname } from "node:path"
import type { PluginContext } from "../types.js"

const FILE_TOOLS = ["read", "edit", "write", "glob", "grep"]

function getFilePathFromArgs(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const record = args as Record<string, unknown>
  if (typeof record.filePath === "string") return record.filePath
  if (typeof record.path === "string") return record.path
  if (typeof record.file === "string") return record.file
  return null
}

export function createToolExecuteAfterHook(ctx: PluginContext) {
  const { config, sessionManager, skillResolver, log } = ctx

  return async (event: {
    readonly tool: string
    readonly sessionID: string
    readonly input: unknown
    readonly status: "completed" | "error"
  }): Promise<void> => {
    if (event.status !== "completed") return
    if (!FILE_TOOLS.includes(event.tool)) return
    if (!event.sessionID) return

    const filePath = getFilePathFromArgs(event.input)
    if (!filePath) {
      log("debug", "No file path found in tool input", {
        tool: event.tool,
      })
      return
    }

    const state = sessionManager.getState(event.sessionID)
    const ext = extname(filePath)

    log("debug", "Processing file access", {
      tool: event.tool,
      filePath,
      extension: ext,
    })

    if (ext && config.fileTypeSkills) {
      const extSkillNames = skillResolver.getSkillsForExtension(ext)
      if (extSkillNames.length > 0) {
        log("debug", "Found skills for extension", { ext, skills: extSkillNames })
        const result = skillResolver.loadWithBudget(
          extSkillNames,
          state.totalTokensUsed,
          event.sessionID,
          "fileType"
        )
        if (result.skills.length > 0) {
          sessionManager.queueSkills(event.sessionID, result.skills, "fileType")
        }
      }
    }

    if (config.pathPatterns) {
      const pathSkillNames = skillResolver.getSkillsForPath(filePath)
      if (pathSkillNames.length > 0) {
        log("debug", "Found skills for path pattern", { filePath, skills: pathSkillNames })
        const result = skillResolver.loadWithBudget(
          pathSkillNames,
          state.totalTokensUsed,
          event.sessionID,
          "path"
        )
        if (result.skills.length > 0) {
          sessionManager.queueSkills(event.sessionID, result.skills, "path")
        }
      }
    }
  }
}
