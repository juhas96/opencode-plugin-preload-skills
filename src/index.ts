import { existsSync, readFileSync } from "node:fs"
import { join, extname } from "node:path"
import { homedir } from "node:os"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Event, UserMessage, Part } from "@opencode-ai/sdk"
import type { PreloadSkillsConfig, ParsedSkill, SessionState } from "./types.js"
import { loadSkills, loadSkill, formatSkillsForInjection } from "./skill-loader.js"

export type { PreloadSkillsConfig, ParsedSkill }
export { loadSkills, formatSkillsForInjection }

const CONFIG_FILENAME = "preload-skills.json"

const FILE_TOOLS = ["read", "edit", "write", "glob", "grep"]

const DEFAULT_CONFIG: PreloadSkillsConfig = {
  skills: [],
  fileTypeSkills: {},
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

function parseFileTypeSkills(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {}
  
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      result[key] = value.filter((v) => typeof v === "string")
    }
  }
  return result
}

function loadConfigFile(projectDir: string): Partial<PreloadSkillsConfig> {
  const configPath = findConfigFile(projectDir)
  if (!configPath) {
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      fileTypeSkills: parseFileTypeSkills(parsed.fileTypeSkills),
      persistAfterCompaction: typeof parsed.persistAfterCompaction === "boolean" 
        ? parsed.persistAfterCompaction 
        : undefined,
      debug: typeof parsed.debug === "boolean" ? parsed.debug : undefined,
    }
  } catch {
    return {}
  }
}

function getFilePathFromArgs(args: Record<string, unknown>): string | null {
  if (typeof args.filePath === "string") return args.filePath
  if (typeof args.path === "string") return args.path
  if (typeof args.file === "string") return args.file
  return null
}

function getSkillsForExtension(
  ext: string,
  fileTypeSkills: Record<string, string[]>
): string[] {
  const skills: string[] = []
  
  for (const [pattern, skillNames] of Object.entries(fileTypeSkills)) {
    const extensions = pattern.split(",").map((e) => e.trim().toLowerCase())
    if (extensions.includes(ext.toLowerCase())) {
      skills.push(...skillNames)
    }
  }
  
  return [...new Set(skills)]
}

export const PreloadSkillsPlugin: Plugin = async (ctx: PluginInput) => {
  const sessionStates = new Map<string, SessionState>()

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

  const skillCache = new Map<string, ParsedSkill>()

  const getOrLoadSkill = (skillName: string): ParsedSkill | null => {
    if (skillCache.has(skillName)) {
      return skillCache.get(skillName) ?? null
    }
    const skill = loadSkill(skillName, ctx.directory)
    if (skill) {
      skillCache.set(skillName, skill)
    }
    return skill
  }

  let initialSkills: ParsedSkill[] = []
  let initialFormattedContent = ""

  if (config.skills.length > 0) {
    initialSkills = loadSkills(config.skills, ctx.directory)
    initialFormattedContent = formatSkillsForInjection(initialSkills)

    for (const skill of initialSkills) {
      skillCache.set(skill.name, skill)
    }

    const loadedNames = initialSkills.map((s) => s.name)
    const missingNames = config.skills.filter((s) => !loadedNames.includes(s))

    log("info", `Loaded ${initialSkills.length} skills for preloading`, {
      loaded: loadedNames,
      missing: missingNames.length > 0 ? missingNames : undefined,
    })

    if (missingNames.length > 0) {
      log("warn", "Some configured skills were not found", {
        missing: missingNames,
      })
    }
  }

  const hasFileTypeSkills = Object.keys(config.fileTypeSkills ?? {}).length > 0

  if (config.skills.length === 0 && !hasFileTypeSkills) {
    log("warn", "No skills configured. Create .opencode/preload-skills.json")
  }

  const getSessionState = (sessionID: string): SessionState => {
    if (!sessionStates.has(sessionID)) {
      sessionStates.set(sessionID, {
        initialSkillsInjected: false,
        loadedSkills: new Set(initialSkills.map((s) => s.name)),
      })
    }
    return sessionStates.get(sessionID)!
  }

  const pendingSkillInjections = new Map<string, ParsedSkill[]>()

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
      if (!input.sessionID) return

      const state = getSessionState(input.sessionID)
      const firstTextPart = output.parts.find((p) => p.type === "text")
      if (!firstTextPart || !("text" in firstTextPart)) return

      const contentToInject: string[] = []

      if (!state.initialSkillsInjected && initialFormattedContent) {
        contentToInject.push(initialFormattedContent)
        state.initialSkillsInjected = true
        log("info", "Injected initial preloaded skills", {
          sessionID: input.sessionID,
          skills: initialSkills.map((s) => s.name),
        })
      }

      const pending = pendingSkillInjections.get(input.sessionID)
      if (pending && pending.length > 0) {
        const formatted = formatSkillsForInjection(pending)
        if (formatted) {
          contentToInject.push(formatted)
          log("info", "Injected file-type triggered skills", {
            sessionID: input.sessionID,
            skills: pending.map((s) => s.name),
          })
        }
        pendingSkillInjections.delete(input.sessionID)
      }

      if (contentToInject.length > 0) {
        firstTextPart.text = `${contentToInject.join("\n\n")}\n\n---\n\n${firstTextPart.text}`
      }
    },

    "tool.execute.after": async (
      input: {
        tool: string
        sessionID: string
        callID: string
      },
      _output: {
        title: string
        output: string
        metadata: unknown
      }
    ): Promise<void> => {
      if (!hasFileTypeSkills) return
      if (!FILE_TOOLS.includes(input.tool)) return
      if (!input.sessionID) return

      const state = getSessionState(input.sessionID)

      const toolArgs = (_output.metadata as { args?: Record<string, unknown> })?.args
      if (!toolArgs) return

      const filePath = getFilePathFromArgs(toolArgs)
      if (!filePath) return

      const ext = extname(filePath)
      if (!ext) return

      const skillNames = getSkillsForExtension(ext, config.fileTypeSkills ?? {})
      if (skillNames.length === 0) return

      const newSkills: ParsedSkill[] = []
      for (const name of skillNames) {
        if (state.loadedSkills.has(name)) continue

        const skill = getOrLoadSkill(name)
        if (skill) {
          newSkills.push(skill)
          state.loadedSkills.add(name)
        }
      }

      if (newSkills.length > 0) {
        const existing = pendingSkillInjections.get(input.sessionID) ?? []
        pendingSkillInjections.set(input.sessionID, [...existing, ...newSkills])

        log("debug", "Queued file-type skills for injection", {
          sessionID: input.sessionID,
          filePath,
          extension: ext,
          skills: newSkills.map((s) => s.name),
        })
      }
    },

    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string }
    ): Promise<void> => {
      if (!config.persistAfterCompaction) return

      const state = sessionStates.get(input.sessionID)
      if (!state || state.loadedSkills.size === 0) return

      const allLoadedSkills: ParsedSkill[] = []
      for (const name of state.loadedSkills) {
        const skill = skillCache.get(name)
        if (skill) allLoadedSkills.push(skill)
      }

      if (allLoadedSkills.length === 0) return

      const formatted = formatSkillsForInjection(allLoadedSkills)
      output.context.push(
        `## Preloaded Skills\n\nThe following skills were loaded during this session and should persist:\n\n${formatted}`
      )

      state.initialSkillsInjected = false

      log("info", "Added all loaded skills to compaction context", {
        sessionID: input.sessionID,
        skillCount: allLoadedSkills.length,
      })
    },

    event: async ({ event }: { event: Event }): Promise<void> => {
      if (
        event.type === "session.deleted" &&
        "sessionID" in event.properties
      ) {
        const sessionID = event.properties.sessionID as string
        sessionStates.delete(sessionID)
        pendingSkillInjections.delete(sessionID)
        log("debug", "Cleaned up session state", { sessionID })
      }
    },
  }
}

export default PreloadSkillsPlugin
