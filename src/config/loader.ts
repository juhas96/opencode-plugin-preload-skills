import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type {
  PreloadSkillsConfig,
  ConditionalSkill,
  SkillSettings,
  InjectionMethod,
} from "../types.js"

const CONFIG_FILENAME = "preload-skills.json"

/**
 * Default value for `triggerIgnoreTags`.
 *
 * These are well-known XML block tag names used by common OpenCode context /
 * memory plugins (e.g. `@cortexkit/opencode-magic-context`, OMO historian)
 * when injecting historical summaries, project memory, or user profile content
 * into a user's chat message. Stripping these blocks before `contentTriggers`
 * keyword matching prevents false skill-load fires when injected text happens
 * to contain a trigger keyword.
 *
 * Users can override this list via the `triggerIgnoreTags` config field.
 * Set to `[]` to disable stripping entirely.
 */
export const DEFAULT_TRIGGER_IGNORE_TAGS: string[] = [
  "session-history",
  "session-history-since",
  "compartment_examples_from_other_projects",
  "compartment",
  "project-memory",
  "user-profile",
  "draft",
]

export const DEFAULT_CONFIG: PreloadSkillsConfig = {
  skills: [],
  fileTypeSkills: {},
  agentSkills: {},
  pathPatterns: {},
  contentTriggers: {},
  groups: {},
  conditionalSkills: [],
  skillSettings: {},
  triggerIgnoreTags: DEFAULT_TRIGGER_IGNORE_TAGS,
  injectionMethod: "systemPrompt",
  maxTokens: undefined,
  useSummaries: false,
  useMinification: false,
  showToasts: false,
  enableTools: true,
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

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0)
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

    // triggerIgnoreTags: user override replaces defaults entirely (matches
    // the override semantics of every other config field in this file).
    if (Array.isArray(parsed.triggerIgnoreTags)) {
      config.triggerIgnoreTags = parseStringArray(parsed.triggerIgnoreTags)
    }

    if (typeof parsed.maxTokens === "number") {
      config.maxTokens = parsed.maxTokens
    }
    if (typeof parsed.useSummaries === "boolean") {
      config.useSummaries = parsed.useSummaries
    }
    if (typeof parsed.useMinification === "boolean") {
      config.useMinification = parsed.useMinification
    }
    if (typeof parsed.showToasts === "boolean") {
      config.showToasts = parsed.showToasts
    }
    if (typeof parsed.enableTools === "boolean") {
      config.enableTools = parsed.enableTools
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

export function loadConfig(projectDir: string): PreloadSkillsConfig {
  const fileConfig = loadConfigFile(projectDir)
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  }
}
