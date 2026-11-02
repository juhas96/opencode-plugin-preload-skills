import type { PreloadSkillsConfig, ParsedSkill, PluginContext, Logger, ToastFn } from "../types.js"
import { loadConfig } from "../config/loader.js"
import { loadSkills, formatSkillsForInjection, calculateTotalTokens, filterSkillsByTokenBudget } from "../skills/loader.js"
import { SkillResolverImpl, resolveSkillGroups } from "../skills/resolver.js"
import { SessionManagerImpl } from "../session/manager.js"
import { checkCondition } from "../utils.js"

export function resolveConditionalSkills(config: PreloadSkillsConfig, projectDir: string): string[] {
  if (!config.conditionalSkills?.length) return []

  const resolved: string[] = []
  for (const { skill, if: condition } of config.conditionalSkills) {
    if (checkCondition(condition, projectDir)) {
      resolved.push(skill)
    }
  }

  return resolved
}

export interface RuntimeOptions {
  projectDir: string
  customToast?: ToastFn
}

export function createPluginRuntime(options: RuntimeOptions): PluginContext {
  const { projectDir, customToast } = options
  const config = loadConfig(projectDir)

  const log: Logger = (level, message, extra) => {
    if (level === "debug" && !config.debug) return
    const logFn =
      level === "error"
        ? console.error
        : level === "warn"
        ? console.warn
        : level === "debug"
        ? console.debug
        : console.info
    if (extra) {
      logFn(`[preload-skills] ${message}`, extra)
    } else {
      logFn(`[preload-skills] ${message}`)
    }
  }

  const allInitialSkillNames = [
    ...config.skills,
    ...resolveConditionalSkills(config, projectDir),
  ]

  const resolvedInitialNames = resolveSkillGroups(allInitialSkillNames, config.groups ?? {})
  let initialSkills = loadSkills(resolvedInitialNames, projectDir)
  let initialTokensUsed = calculateTotalTokens(initialSkills)

  if (config.maxTokens && initialTokensUsed > config.maxTokens) {
    initialSkills = filterSkillsByTokenBudget(initialSkills, config.maxTokens)
    initialTokensUsed = calculateTotalTokens(initialSkills)
  }

  const initialFormattedContent = formatSkillsForInjection(initialSkills, {
    useSummaries: config.useSummaries,
    useMinification: config.useMinification,
    skillSettings: config.skillSettings,
  })

  if (initialSkills.length > 0) {
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

  const sessionManager = new SessionManagerImpl(
    config,
    projectDir,
    log,
    new Set(initialSkills.map((s) => s.name)),
    initialTokensUsed
  )

  for (const skill of initialSkills) {
    sessionManager.cacheSkill(skill)
  }

  const skillResolver = new SkillResolverImpl(config, projectDir)

  const toast: ToastFn = customToast ?? ((message, variant = "info") => {
    if (!config.showToasts) return
    log(variant === "error" ? "error" : variant === "warning" ? "warn" : "info", message)
  })

  return {
    config,
    projectDir,
    log,
    toast,
    sessionManager,
    skillResolver,
    initialSkills,
    initialFormattedContent,
    initialTokensUsed,
  }
}
