export interface SkillSettings {
  useSummary?: boolean
}

export type InjectionMethod = "systemPrompt" | "chatMessage"

export type TriggerType = "initial" | "fileType" | "agent" | "path" | "content" | "conditional"

export interface PreloadSkillsConfig {
  skills: string[]
  fileTypeSkills?: Record<string, string[]>
  agentSkills?: Record<string, string[]>
  pathPatterns?: Record<string, string[]>
  contentTriggers?: Record<string, string[]>
  groups?: Record<string, string[]>
  conditionalSkills?: ConditionalSkill[]
  skillSettings?: Record<string, SkillSettings>
  injectionMethod?: InjectionMethod
  maxTokens?: number
  useSummaries?: boolean
  useMinification?: boolean
  analytics?: boolean
  persistAfterCompaction?: boolean
  debug?: boolean
}

export type Logger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>
) => void

export interface LoadSkillsResult {
  skills: ParsedSkill[]
  tokensUsed: number
}

export interface SessionManager {
  getState(sessionId: string): SessionState
  queueSkills(sessionId: string, skills: ParsedSkill[], triggerType: TriggerType): void
  getPendingSkills(sessionId: string): ParsedSkill[]
  clearPendingSkills(sessionId: string): void
  getAllLoadedSkills(sessionId: string): ParsedSkill[]
  getCachedSkill(name: string): ParsedSkill | undefined
  cacheSkill(skill: ParsedSkill): void
  trackFilePath(callId: string, filePath: string): void
  getFilePath(callId: string): string | undefined
  clearFilePath(callId: string): void
  cleanup(sessionId: string): void
  saveAnalytics(): void
  markInitialSkillsInjected(sessionId: string): void
}

export interface SkillResolver {
  getSkillsForExtension(ext: string): string[]
  getSkillsForPath(filePath: string): string[]
  resolveGroups(skillNames: string[]): string[]
  loadWithBudget(
    skillNames: string[],
    currentTokens: number,
    sessionId: string,
    triggerType: TriggerType
  ): LoadSkillsResult
}

export interface PluginContext {
  readonly config: PreloadSkillsConfig
  readonly projectDir: string
  readonly log: Logger
  readonly sessionManager: SessionManager
  readonly skillResolver: SkillResolver
  readonly initialSkills: ParsedSkill[]
  readonly initialFormattedContent: string
  readonly initialTokensUsed: number
}

export interface ConditionalSkill {
  skill: string
  if: ConditionCheck
}

export interface ConditionCheck {
  fileExists?: string
  packageHasDependency?: string
  envVar?: string
}

export interface ParsedSkill {
  name: string
  description: string
  summary?: string
  content: string
  filePath: string
  tokenCount: number
}

export interface SessionState {
  initialSkillsInjected: boolean
  loadedSkills: Set<string>
  totalTokensUsed: number
}

export interface SkillUsageStats {
  skillName: string
  loadCount: number
  triggerType: TriggerType
  firstLoaded: number
  lastLoaded: number
}

export interface AnalyticsData {
  sessionId: string
  skillUsage: Map<string, SkillUsageStats>
}
