import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Event, UserMessage, Part } from "@opencode-ai/sdk"
import type { PreloadSkillsConfig, ParsedSkill } from "./types.js"
import { loadSkills, formatSkillsForInjection } from "./skill-loader.js"

export type { PreloadSkillsConfig, ParsedSkill }
export { loadSkills, formatSkillsForInjection }

const CONFIG_FILENAME = "preload-skills.json"

const DEFAULT_CONFIG: PreloadSkillsConfig = {
  skills: [],
  persistAfterCompaction: true,
  debug: false,
}

function findConfigFile(projectDir: string): string | null {
  const locations = [
    join(projectDir, ".opencode", CONFIG_FILENAME),
    join(projectDir, CONFIG_FILENAME),
    join(homedir(), ".config", "opencode", CONFIG_FILENAME),
  ]

  for (const path of locations) {
    if (existsSync(path)) {
      return path
    }
  }
  return null
}

function loadConfigFile(projectDir: string): Partial<PreloadSkillsConfig> {
  const configPath = findConfigFile(projectDir)
  if (!configPath) {
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    return JSON.parse(content) as Partial<PreloadSkillsConfig>
  } catch {
    return {}
  }
}

export const PreloadSkillsPlugin: Plugin = async (ctx: PluginInput) => {
  const injectedSessions = new Set<string>()

  const fileConfig = loadConfigFile(ctx.directory)
  const config: PreloadSkillsConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  }

  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>
  ) => {
    if (level === "debug" && !config.debug) return

    ctx.client.app.log({
      body: {
        service: "preload-skills",
        level,
        message,
        extra,
      },
    })
  }

  let loadedSkills: ParsedSkill[] = []
  let formattedContent = ""

  if (config.skills.length === 0) {
    log("warn", "No skills configured for preloading. Create .opencode/preload-skills.json")
  } else {
    loadedSkills = loadSkills(config.skills, ctx.directory)
    formattedContent = formatSkillsForInjection(loadedSkills)

    const loadedNames = loadedSkills.map((s) => s.name)
    const missingNames = config.skills.filter((s) => !loadedNames.includes(s))

    log("info", `Loaded ${loadedSkills.length} skills for preloading`, {
      loaded: loadedNames,
      missing: missingNames.length > 0 ? missingNames : undefined,
    })

    if (missingNames.length > 0) {
      log("warn", "Some configured skills were not found", {
        missing: missingNames,
      })
    }
  }

  return {

    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        model?: { providerID: string; modelID: string }
        messageID?: string
        variant?: string
      },
      output: { message: UserMessage; parts: Part[] }
    ): Promise<void> => {
      if (loadedSkills.length === 0 || !formattedContent) {
        return
      }

      if (injectedSessions.has(input.sessionID)) {
        log("debug", "Skills already injected for session", {
          sessionID: input.sessionID,
        })
        return
      }

      injectedSessions.add(input.sessionID)

      const syntheticPart = {
        type: "text",
        text: formattedContent,
      } as Part

      output.parts.unshift(syntheticPart)

      log("info", "Injected preloaded skills into session", {
        sessionID: input.sessionID,
        skillCount: loadedSkills.length,
        skills: loadedSkills.map((s) => s.name),
      })
    },

    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string }
    ): Promise<void> => {
      if (!config.persistAfterCompaction || loadedSkills.length === 0) {
        return
      }

      output.context.push(
        `## Preloaded Skills\n\nThe following skills were auto-loaded at session start and should persist:\n\n${formattedContent}`
      )

      injectedSessions.delete(input.sessionID)

      log("info", "Added preloaded skills to compaction context", {
        sessionID: input.sessionID,
        skillCount: loadedSkills.length,
      })
    },

    event: async ({ event }: { event: Event }): Promise<void> => {
      if (
        event.type === "session.deleted" &&
        "sessionID" in event.properties
      ) {
        const sessionID = event.properties.sessionID as string
        injectedSessions.delete(sessionID)
        log("debug", "Cleaned up session tracking", { sessionID })
      }
    },
  }
}

export default PreloadSkillsPlugin
