export interface SkillSettings {
  useSummary?: boolean
}

export interface PreloadSkillsConfig {
  skills: string[]
  fileTypeSkills?: Record<string, string[]>
  agentSkills?: Record<string, string[]>
  pathPatterns?: Record<string, string[]>
  contentTriggers?: Record<string, string[]>
  groups?: Record<string, string[]>
  conditionalSkills?: ConditionalSkill[]
  skillSettings?: Record<string, SkillSettings>
  maxTokens?: number
  useSummaries?: boolean
  analytics?: boolean
  persistAfterCompaction?: boolean
  debug?: boolean
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
  triggerType: "initial" | "fileType" | "agent" | "path" | "content" | "conditional"
  firstLoaded: number
  lastLoaded: number
}

export interface AnalyticsData {
  sessionId: string
  skillUsage: Map<string, SkillUsageStats>
}
