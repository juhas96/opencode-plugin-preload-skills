import { extname } from "node:path"
import type { PluginContext } from "../types.js"

const FILE_TOOLS = ["read", "edit", "write", "glob", "grep"]

interface ToolExecuteInput {
  tool: string
  sessionID: string
  callID: string
}

interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>
}

interface ToolExecuteAfterOutput {
  title: string
  output: string
  metadata: unknown
}

function getFilePathFromArgs(args: Record<string, unknown>): string | null {
  if (typeof args.filePath === "string") return args.filePath
  if (typeof args.path === "string") return args.path
  if (typeof args.file === "string") return args.file
  return null
}

export function createToolExecuteHooks(ctx: PluginContext) {
  const { config, sessionManager, skillResolver, log } = ctx

  const before = async (
    input: ToolExecuteInput,
    output: ToolExecuteBeforeOutput
  ): Promise<void> => {
    if (!FILE_TOOLS.includes(input.tool)) return

    const filePath = getFilePathFromArgs(output.args)
    if (filePath) {
      sessionManager.trackFilePath(input.callID, filePath)
      log("debug", "Captured file path from tool", {
        tool: input.tool,
        callID: input.callID,
        filePath,
      })
    }
  }

  const after = async (
    input: ToolExecuteInput,
    _output: ToolExecuteAfterOutput
  ): Promise<void> => {
    if (!FILE_TOOLS.includes(input.tool)) return
    if (!input.sessionID) return

    const filePath = sessionManager.getFilePath(input.callID)
    sessionManager.clearFilePath(input.callID)

    if (!filePath) {
      log("debug", "No file path found for tool call", {
        tool: input.tool,
        callID: input.callID,
      })
      return
    }

    const state = sessionManager.getState(input.sessionID)
    const ext = extname(filePath)

    log("debug", "Processing file access", {
      tool: input.tool,
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
          input.sessionID,
          "fileType"
        )
        if (result.skills.length > 0) {
          sessionManager.queueSkills(input.sessionID, result.skills, "fileType")
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
          input.sessionID,
          "path"
        )
        if (result.skills.length > 0) {
          sessionManager.queueSkills(input.sessionID, result.skills, "path")
        }
      }
    }
  }

  return { before, after }
}
