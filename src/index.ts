import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { PreloadSkillsConfig, ParsedSkill, PluginContext, Logger, ToastFn } from "./types.js"
import { loadConfig } from "./config/loader.js"
import { loadSkills, formatSkillsForInjection, calculateTotalTokens } from "./skills/loader.js"
import { SkillResolverImpl, resolveSkillGroups } from "./skills/resolver.js"
import { SessionManagerImpl } from "./session/manager.js"
import { createHooks } from "./hooks"
import { checkCondition } from "./utils.js"

export type { PreloadSkillsConfig, ParsedSkill }
export { loadSkills, formatSkillsForInjection }

function resolveConditionalSkills(config: PreloadSkillsConfig, projectDir: string): string[] {
  if (!config.conditionalSkills?.length) return []

  const resolved: string[] = []
  for (const { skill, if: condition } of config.conditionalSkills) {
    if (checkCondition(condition, projectDir)) {
      resolved.push(skill)
    }
  }

  return resolved
}

export const PreloadSkillsPlugin: Plugin = async (ctx: PluginInput) => {
  const config = loadConfig(ctx.directory)

  const log: Logger = (level, message, extra) => {
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

  const allInitialSkillNames = [
    ...config.skills,
    ...resolveConditionalSkills(config, ctx.directory),
  ]

  const resolvedInitialNames = resolveSkillGroups(allInitialSkillNames, config.groups ?? {})
  let initialSkills = loadSkills(resolvedInitialNames, ctx.directory)
  let initialTokensUsed = calculateTotalTokens(initialSkills)

  if (config.maxTokens && initialTokensUsed > config.maxTokens) {
    const { filterSkillsByTokenBudget } = await import("./skills/loader.js")
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
    ctx.directory,
    log,
    new Set(initialSkills.map((s) => s.name)),
    initialTokensUsed
  )

  for (const skill of initialSkills) {
    sessionManager.cacheSkill(skill)
  }

  const skillResolver = new SkillResolverImpl(config, ctx.directory)

  const toast: ToastFn = (message, variant = "info") => {
    if (!config.showToasts) return
    ctx.client.tui.showToast({
      body: { message, variant, duration: 3000 },
    })
  }

  const pluginContext: PluginContext = {
    config,
    projectDir: ctx.directory,
    log,
    toast,
    sessionManager,
    skillResolver,
    initialSkills,
    initialFormattedContent,
    initialTokensUsed,
  }

  return createHooks(pluginContext)
}

export default PreloadSkillsPlugin
