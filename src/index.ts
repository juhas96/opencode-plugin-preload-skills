import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { homedir } from "node:os"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Event, UserMessage, Part, Model } from "@opencode-ai/sdk"
import type {
  PreloadSkillsConfig,
  ParsedSkill,
  SessionState,
  ConditionalSkill,
  SkillSettings,
  SkillUsageStats,
  AnalyticsData,
  InjectionMethod,
} from "./types.js"
import {
  loadSkills,
  formatSkillsForInjection,
  filterSkillsByTokenBudget,
  calculateTotalTokens,
} from "./skill-loader.js"
import {
  checkCondition,
  matchGlobPattern,
  textContainsKeyword,
} from "./utils.js"

export type { PreloadSkillsConfig, ParsedSkill }
export { loadSkills, formatSkillsForInjection }

const CONFIG_FILENAME = "preload-skills.json"
const ANALYTICS_FILENAME = "preload-skills-analytics.json"
const FILE_TOOLS = ["read", "edit", "write", "glob", "grep"]

const DEFAULT_CONFIG: PreloadSkillsConfig = {
  skills: [],
  fileTypeSkills: {},
  agentSkills: {},
  pathPatterns: {},
  contentTriggers: {},
  groups: {},
  conditionalSkills: [],
  skillSettings: {},
  injectionMethod: "systemPrompt",
  maxTokens: undefined,
  useSummaries: false,
  analytics: false,
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

function parseStringArrayRecord(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {}

  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      result[key] = value.filter((v) => typeof v === "string")
    }
  }
  return result
}

function parseConditionalSkills(raw: unknown): ConditionalSkill[] {
  if (!Array.isArray(raw)) return []

  return raw.filter(
    (item): item is ConditionalSkill =>
      typeof item === "object" &&
      item !== null &&
      typeof item.skill === "string" &&
      typeof item.if === "object"
  )
}

function parseSkillSettings(raw: unknown): Record<string, SkillSettings> {
  if (!raw || typeof raw !== "object") return {}

  const result: Record<string, SkillSettings> = {}
  for (const [skillName, settings] of Object.entries(raw)) {
    if (typeof settings === "object" && settings !== null) {
      const parsed: SkillSettings = {}
      if ("useSummary" in settings && typeof settings.useSummary === "boolean") {
        parsed.useSummary = settings.useSummary
      }
      if (Object.keys(parsed).length > 0) {
        result[skillName] = parsed
      }
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

    const config: Partial<PreloadSkillsConfig> = {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      fileTypeSkills: parseStringArrayRecord(parsed.fileTypeSkills),
      agentSkills: parseStringArrayRecord(parsed.agentSkills),
      pathPatterns: parseStringArrayRecord(parsed.pathPatterns),
      contentTriggers: parseStringArrayRecord(parsed.contentTriggers),
      groups: parseStringArrayRecord(parsed.groups),
      conditionalSkills: parseConditionalSkills(parsed.conditionalSkills),
      skillSettings: parseSkillSettings(parsed.skillSettings),
    }

    if (typeof parsed.maxTokens === "number") {
      config.maxTokens = parsed.maxTokens
    }
    if (typeof parsed.useSummaries === "boolean") {
      config.useSummaries = parsed.useSummaries
    }
    if (typeof parsed.analytics === "boolean") {
      config.analytics = parsed.analytics
    }
    if (typeof parsed.persistAfterCompaction === "boolean") {
      config.persistAfterCompaction = parsed.persistAfterCompaction
    }
    if (typeof parsed.debug === "boolean") {
      config.debug = parsed.debug
    }
    if (parsed.injectionMethod === "systemPrompt" || parsed.injectionMethod === "chatMessage") {
      config.injectionMethod = parsed.injectionMethod as InjectionMethod
    }

    return config
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

function getSkillsForPath(
  filePath: string,
  pathPatterns: Record<string, string[]>
): string[] {
  const skills: string[] = []

  for (const [pattern, skillNames] of Object.entries(pathPatterns)) {
    if (matchGlobPattern(filePath, pattern)) {
      skills.push(...skillNames)
    }
  }

  return [...new Set(skills)]
}

function resolveSkillGroups(
  skillNames: string[],
  groups: Record<string, string[]>
): string[] {
  const resolved: string[] = []

  for (const name of skillNames) {
    if (name.startsWith("@") && groups[name.slice(1)]) {
      resolved.push(...groups[name.slice(1)]!)
    } else {
      resolved.push(name)
    }
  }

  return [...new Set(resolved)]
}

export const PreloadSkillsPlugin: Plugin = async (ctx: PluginInput) => {
  const sessionStates = new Map<string, SessionState>()
  const analyticsData = new Map<string, AnalyticsData>()

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

  const trackSkillUsage = (
    sessionID: string,
    skillName: string,
    triggerType: SkillUsageStats["triggerType"]
  ) => {
    if (!config.analytics) return

    if (!analyticsData.has(sessionID)) {
      analyticsData.set(sessionID, {
        sessionId: sessionID,
        skillUsage: new Map(),
      })
    }

    const data = analyticsData.get(sessionID)!
    const now = Date.now()

    if (data.skillUsage.has(skillName)) {
      const stats = data.skillUsage.get(skillName)!
      stats.loadCount++
      stats.lastLoaded = now
    } else {
      data.skillUsage.set(skillName, {
        skillName,
        loadCount: 1,
        triggerType,
        firstLoaded: now,
        lastLoaded: now,
      })
    }

    saveAnalytics()
  }

  const saveAnalytics = () => {
    if (!config.analytics) return

    try {
      const analyticsPath = join(ctx.directory, ".opencode", ANALYTICS_FILENAME)
      const dir = dirname(analyticsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const serializable: Record<string, unknown> = {}
      for (const [sessionId, data] of analyticsData) {
        serializable[sessionId] = {
          sessionId: data.sessionId,
          skillUsage: Object.fromEntries(data.skillUsage),
        }
      }

      writeFileSync(analyticsPath, JSON.stringify(serializable, null, 2))
    } catch {
      log("warn", "Failed to save analytics")
    }
  }

  const skillCache = new Map<string, ParsedSkill>()

  const loadSkillsWithBudget = (
    skillNames: string[],
    currentTokens: number,
    triggerType: SkillUsageStats["triggerType"],
    sessionID: string
  ): { skills: ParsedSkill[]; tokensUsed: number } => {
    const resolved = resolveSkillGroups(skillNames, config.groups ?? {})
    let skills = loadSkills(resolved, ctx.directory)

    for (const skill of skills) {
      skillCache.set(skill.name, skill)
    }

    if (config.maxTokens) {
      const remainingBudget = config.maxTokens - currentTokens
      skills = filterSkillsByTokenBudget(skills, remainingBudget)
    }

    for (const skill of skills) {
      trackSkillUsage(sessionID, skill.name, triggerType)
    }

    return {
      skills,
      tokensUsed: calculateTotalTokens(skills),
    }
  }

  const resolveConditionalSkills = (): string[] => {
    if (!config.conditionalSkills?.length) return []

    const resolved: string[] = []
    for (const { skill, if: condition } of config.conditionalSkills) {
      if (checkCondition(condition, ctx.directory)) {
        resolved.push(skill)
      }
    }

    return resolved
  }

  let initialSkills: ParsedSkill[] = []
  let initialFormattedContent = ""
  let initialTokensUsed = 0

  const allInitialSkillNames = [
    ...config.skills,
    ...resolveConditionalSkills(),
  ]

  if (allInitialSkillNames.length > 0) {
    const result = loadSkillsWithBudget(
      allInitialSkillNames,
      0,
      "initial",
      "__init__"
    )
    initialSkills = result.skills
    initialTokensUsed = result.tokensUsed
    initialFormattedContent = formatSkillsForInjection(
      initialSkills,
      { useSummaries: config.useSummaries, skillSettings: config.skillSettings }
    )

    const loadedNames = initialSkills.map((s) => s.name)
    const missingNames = allInitialSkillNames.filter(
      (s) => !loadedNames.includes(s) && !s.startsWith("@")
    )

    log("info", `Loaded ${initialSkills.length} initial skills`, {
      loaded: loadedNames,
      tokens: initialTokensUsed,
      missing: missingNames.length > 0 ? missingNames : undefined,
    })
  }

  const hasTriggeredSkills =
    Object.keys(config.fileTypeSkills ?? {}).length > 0 ||
    Object.keys(config.agentSkills ?? {}).length > 0 ||
    Object.keys(config.pathPatterns ?? {}).length > 0 ||
    Object.keys(config.contentTriggers ?? {}).length > 0

  if (allInitialSkillNames.length === 0 && !hasTriggeredSkills) {
    log("warn", "No skills configured. Create .opencode/preload-skills.json")
  }

  const getSessionState = (sessionID: string): SessionState => {
    if (!sessionStates.has(sessionID)) {
      sessionStates.set(sessionID, {
        initialSkillsInjected: false,
        loadedSkills: new Set(initialSkills.map((s) => s.name)),
        totalTokensUsed: initialTokensUsed,
      })
    }
    return sessionStates.get(sessionID)!
  }

  const pendingSkillInjections = new Map<string, ParsedSkill[]>()
  const pendingToolFilePaths = new Map<string, string>()

  const queueSkillsForInjection = (
    sessionID: string,
    skillNames: string[],
    triggerType: SkillUsageStats["triggerType"],
    state: SessionState
  ) => {
    const newSkillNames = skillNames.filter((name) => !state.loadedSkills.has(name))
    if (newSkillNames.length === 0) return

    const result = loadSkillsWithBudget(
      newSkillNames,
      state.totalTokensUsed,
      triggerType,
      sessionID
    )

    if (result.skills.length > 0) {
      for (const skill of result.skills) {
        state.loadedSkills.add(skill.name)
      }
      state.totalTokensUsed += result.tokensUsed

      const existing = pendingSkillInjections.get(sessionID) ?? []
      pendingSkillInjections.set(sessionID, [...existing, ...result.skills])

      log("debug", `Queued ${triggerType} skills for injection`, {
        sessionID,
        skills: result.skills.map((s) => s.name),
        tokens: result.tokensUsed,
      })
    }
  }

  const useSystemPromptInjection = config.injectionMethod === "systemPrompt"

  return {
    "experimental.chat.system.transform": useSystemPromptInjection
      ? async (
          input: { sessionID?: string; model: Model },
          output: { system: string[] }
        ): Promise<void> => {
          if (!input.sessionID) return

          const state = getSessionState(input.sessionID)
          const skillsToInject: ParsedSkill[] = []

          if (initialSkills.length > 0) {
            skillsToInject.push(...initialSkills)
          }

          for (const name of state.loadedSkills) {
            const skill = skillCache.get(name)
            if (skill && !skillsToInject.find((s) => s.name === name)) {
              skillsToInject.push(skill)
            }
          }

          const pending = pendingSkillInjections.get(input.sessionID)
          if (pending && pending.length > 0) {
            for (const skill of pending) {
              if (!skillsToInject.find((s) => s.name === skill.name)) {
                skillsToInject.push(skill)
              }
            }
            pendingSkillInjections.delete(input.sessionID)
          }

          if (skillsToInject.length > 0) {
            const formatted = formatSkillsForInjection(skillsToInject, {
              useSummaries: config.useSummaries,
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
      : undefined,

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

      const messageText = firstTextPart.text

      if (input.agent && config.agentSkills?.[input.agent]) {
        queueSkillsForInjection(
          input.sessionID,
          config.agentSkills[input.agent]!,
          "agent",
          state
        )
      }

      if (config.contentTriggers) {
        for (const [keyword, skillNames] of Object.entries(
          config.contentTriggers
        )) {
          if (textContainsKeyword(messageText, [keyword])) {
            queueSkillsForInjection(
              input.sessionID,
              skillNames,
              "content",
              state
            )
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

        const pending = pendingSkillInjections.get(input.sessionID)
        if (pending && pending.length > 0) {
          const formatted = formatSkillsForInjection(pending, {
            useSummaries: config.useSummaries,
            skillSettings: config.skillSettings,
          })
          if (formatted) {
            contentToInject.push(formatted)
            log("info", "Injected triggered skills", {
              sessionID: input.sessionID,
              skills: pending.map((s) => s.name),
            })
          }
          pendingSkillInjections.delete(input.sessionID)
        }

        if (contentToInject.length > 0) {
          firstTextPart.text = `${contentToInject.join("\n\n")}\n\n---\n\n${firstTextPart.text}`
        }
      }
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      if (!FILE_TOOLS.includes(input.tool)) return

      const filePath = getFilePathFromArgs(output.args)
      if (filePath) {
        pendingToolFilePaths.set(input.callID, filePath)
        log("debug", "Captured file path from tool", {
          tool: input.tool,
          callID: input.callID,
          filePath,
        })
      }
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { title: string; output: string; metadata: unknown }
    ): Promise<void> => {
      if (!FILE_TOOLS.includes(input.tool)) return
      if (!input.sessionID) return

      const filePath = pendingToolFilePaths.get(input.callID)
      pendingToolFilePaths.delete(input.callID)

      if (!filePath) {
        log("debug", "No file path found for tool call", {
          tool: input.tool,
          callID: input.callID,
        })
        return
      }

      const state = getSessionState(input.sessionID)
      const ext = extname(filePath)

      log("debug", "Processing file access", {
        tool: input.tool,
        filePath,
        extension: ext,
      })

      if (ext && config.fileTypeSkills) {
        const extSkills = getSkillsForExtension(ext, config.fileTypeSkills)
        if (extSkills.length > 0) {
          log("debug", "Found skills for extension", { ext, skills: extSkills })
          queueSkillsForInjection(input.sessionID, extSkills, "fileType", state)
        }
      }

      if (config.pathPatterns) {
        const pathSkills = getSkillsForPath(filePath, config.pathPatterns)
        if (pathSkills.length > 0) {
          log("debug", "Found skills for path pattern", { filePath, skills: pathSkills })
          queueSkillsForInjection(input.sessionID, pathSkills, "path", state)
        }
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

      const formatted = formatSkillsForInjection(
        allLoadedSkills,
        { useSummaries: config.useSummaries, skillSettings: config.skillSettings }
      )
      output.context.push(
        `## Preloaded Skills\n\nThe following skills were loaded during this session and should persist:\n\n${formatted}`
      )

      state.initialSkillsInjected = false

      log("info", "Added all loaded skills to compaction context", {
        sessionID: input.sessionID,
        skillCount: allLoadedSkills.length,
      })

      saveAnalytics()
    },

    event: async ({ event }: { event: Event }): Promise<void> => {
      if (
        event.type === "session.deleted" &&
        "sessionID" in event.properties
      ) {
        const sessionID = event.properties.sessionID as string
        sessionStates.delete(sessionID)
        pendingSkillInjections.delete(sessionID)
        analyticsData.delete(sessionID)
        log("debug", "Cleaned up session state", { sessionID })
        saveAnalytics()
      }
    },
  }
}

export default PreloadSkillsPlugin
